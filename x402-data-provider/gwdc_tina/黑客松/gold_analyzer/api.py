"""
FastAPI 接口：将黄金分析系统包装为 REST API。

启动方式:
    uvicorn gold_analyzer.api:app --reload --port 8000

主要接口:
    GET  /health           健康检查
    GET  /price            当前金价摘要
    POST /predict          运行完整 8 步 AI 预测
    POST /backtest         运行回测
"""
import sys
import os
import json
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# 确保模块可被正确导入
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from gold_analyzer.price_fetcher import fetch_gold_prices, get_price_summary
from gold_analyzer.main import run as run_predict
from gold_analyzer.model_predictor import predict_for_date
from gold_analyzer.backtester import run_backtest_with_model, BacktestResult
from gold_analyzer.run_backtest import (
    load_or_fetch_data,
    enrich_events_with_dates,
    run_model_predictions,
    parse_target_date_from_slug,
)

# ── FastAPI 实例 ──────────────────────────────────────────────
app = FastAPI(
    title="Gold Analyzer API",
    description="AI 驱动的黄金价格预测与 Polymarket 回测系统",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 请求 / 响应模型 ──────────────────────────────────────────

class PredictRequest(BaseModel):
    target_date: str = Field(..., description="预测目标日期，格式 YYYY-MM-DD", examples=["2026-02-10"])
    output_path: Optional[str] = Field(None, description="报告保存路径（可选）")


class QuickPredictRequest(BaseModel):
    target_date: str = Field(..., description="预测目标日期，格式 YYYY-MM-DD", examples=["2026-02-10"])
    mode: str = Field("fast", description="预测模式: fast / ai_select / full")


class BacktestRequest(BaseModel):
    edge: float = Field(0.05, description="最小 Edge 阈值")
    bet: float = Field(1.0, description="每笔投注金额")
    strict: bool = Field(True, description="严格模式：只跟模型方向交易")
    min_conf: float = Field(0.0, description="最低置信度阈值 (例: 0.80)")
    model_mode: str = Field("fast", description="模型模式: fast / ai_select / full")
    refresh: bool = Field(False, description="强制重新获取 Polymarket 数据")
    refresh_predictions: bool = Field(False, description="强制重新运行模型预测")


# ── 辅助函数 ──────────────────────────────────────────────────

def _backtest_result_to_dict(result: BacktestResult, predictions: dict = None) -> dict:
    """将 BacktestResult dataclass 转为可序列化的 dict"""
    # 按事件汇总
    from collections import OrderedDict
    event_groups = OrderedDict()
    for t in result.trades:
        td = parse_target_date_from_slug(t.event_slug) or t.event_slug
        if td not in event_groups:
            event_groups[td] = []
        event_groups[td].append(t)

    events_summary = []
    for td, trades in event_groups.items():
        wins = sum(1 for t in trades if t.is_win)
        losses = len(trades) - wins
        pnl = sum(t.pnl for t in trades)
        invested = sum(t.bet_amount for t in trades)
        roi = pnl / invested * 100 if invested > 0 else 0
        actual = trades[0].outcome or "?"
        model_p = trades[0].model_prob_up
        events_summary.append({
            "date": td,
            "model_prob_up": round(model_p, 4),
            "actual": actual,
            "trades": len(trades),
            "wins": wins,
            "losses": losses,
            "pnl": round(pnl, 4),
            "roi_pct": round(roi, 2),
        })

    # 模型方向准确率
    correct = 0
    total_events_checked = 0
    if predictions:
        seen_dates = set()
        for t in result.trades:
            td = parse_target_date_from_slug(t.event_slug)
            if td and td not in seen_dates and td in predictions:
                seen_dates.add(td)
                pred_dir = predictions[td].get("prediction", "")
                actual = t.outcome
                if pred_dir and actual:
                    total_events_checked += 1
                    if pred_dir == actual:
                        correct += 1

    return {
        "summary": {
            "total_events": result.total_events,
            "total_trades": result.total_trades,
            "winning_trades": result.winning_trades,
            "losing_trades": result.losing_trades,
            "win_rate": round(result.win_rate, 4),
            "total_invested": round(result.total_invested, 2),
            "total_pnl": round(result.total_pnl, 2),
            "roi": round(result.roi, 4),
            "avg_pnl_per_trade": round(result.avg_pnl_per_trade, 4),
            "avg_pnl_per_win": round(result.avg_pnl_per_win, 4),
            "avg_pnl_per_loss": round(result.avg_pnl_per_loss, 4),
            "max_single_win": round(result.max_single_win, 4),
            "max_single_loss": round(result.max_single_loss, 4),
            "max_drawdown": round(result.max_drawdown, 4),
            "sharpe_ratio": round(result.sharpe_like, 4),
            "model_direction_accuracy": (
                f"{correct}/{total_events_checked} = {correct/total_events_checked*100:.1f}%"
                if total_events_checked > 0 else "N/A"
            ),
        },
        "events": events_summary,
        "trades": [
            {
                "date": parse_target_date_from_slug(t.event_slug) or "?",
                "timestamp": t.timestamp,
                "side": t.side,
                "entry_price": round(t.entry_price, 4),
                "model_prob_up": round(t.model_prob_up, 4),
                "market_price_up": round(t.market_price_up, 4),
                "edge": round(t.edge, 4),
                "outcome": t.outcome,
                "pnl": round(t.pnl, 4),
                "is_win": t.is_win,
            }
            for t in result.trades
        ],
    }


# ── API 路由 ──────────────────────────────────────────────────

@app.get("/health")
def health():
    """健康检查"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/price")
def get_gold_price():
    """获取当前金价摘要"""
    try:
        df = fetch_gold_prices(end_date=None, lookback_days=60)
        summary = get_price_summary(df)
        return {"status": "ok", "data": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict")
def predict(req: PredictRequest):
    """
    运行完整 8 步 AI 黄金预测流程。

    包含：历史价格 → 新闻抓取 → AI因素收集 → 深度分析 →
          AI选指标 → 爬取代理数据 → 回归训练 → 融合预测

    ⚠️ 耗时较长（约 30-60 秒），建议异步调用。
    """
    output_path = req.output_path
    if not output_path:
        output_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            f"report_{req.target_date}.json",
        )

    try:
        report = run_predict(target_date=req.target_date, output_path=output_path)
        # 提取核心结果
        combined = report.get("step6_combined_probability", {})
        regression = report.get("step5_regression", {})
        return {
            "status": "ok",
            "target_date": req.target_date,
            "prediction": combined.get("final_prediction", ""),
            "probability_up": combined.get("final_probability_up"),
            "probability_down": combined.get("final_probability_down"),
            "components": combined.get("components", {}),
            "regression": {
                "probability_up": regression.get("probability_up"),
                "model_info": regression.get("model_info", {}),
            },
            "report_path": output_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/quick")
def predict_quick(req: QuickPredictRequest):
    """
    快速预测：仅运行回归模型（不包含新闻、深度分析等），几秒即可返回。

    mode:
    - fast: 固定 10 个核心指标
    - ai_select: AI 动态选 8-15 个指标
    - full: AI 选指标 + AI 定性融合
    """
    try:
        result = predict_for_date(req.target_date, mode=req.mode)
        return {
            "status": "ok",
            "target_date": req.target_date,
            "prediction": result.get("prediction"),
            "probability_up": result.get("probability_up"),
            "probability_down": result.get("probability_down"),
            "method": result.get("method"),
            "details": result.get("details", {}),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest")
def backtest(req: BacktestRequest):
    """
    运行 Polymarket 黄金 GC Up/Down 回测。

    返回完整的回测统计（参与事件、胜率、盈亏、夏普比率等）、
    按事件汇总和每笔交易明细。
    """
    try:
        # 加载数据
        events_data = load_or_fetch_data(force_refresh=req.refresh)
        events_data = enrich_events_with_dates(events_data)

        # 过滤有效事件
        valid_events = [
            e for e in events_data
            if e.get("winning_side") and (
                len(e.get("hourly_prices", [])) > 0 or len(e.get("minute_prices", [])) > 0
            )
        ]
        dated_events = [e for e in valid_events if e.get("target_date")]

        # 清除预测缓存
        predictions_cache = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "model_predictions_cache.json",
        )
        if req.refresh_predictions and os.path.exists(predictions_cache):
            os.remove(predictions_cache)

        # 运行模型预测
        predictions = run_model_predictions(dated_events, mode=req.model_mode)

        # 运行回测
        result = run_backtest_with_model(
            events_data=dated_events,
            model_predictions=predictions,
            edge_threshold=req.edge,
            bet_amount=req.bet,
            max_trades_per_event=999,
            only_model_direction=req.strict,
            min_confidence=req.min_conf,
        )

        return {
            "status": "ok",
            "params": {
                "edge": req.edge,
                "strict": req.strict,
                "min_conf": req.min_conf,
                "model_mode": req.model_mode,
            },
            "result": _backtest_result_to_dict(result, predictions),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 直接运行入口 ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("gold_analyzer.api:app", host="0.0.0.0", port=8000, reload=True)
