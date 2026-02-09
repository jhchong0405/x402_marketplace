# Polymarket 黄金回测系统 — 完整代码

---

## 1. `polymarket_client.py` — Polymarket 数据客户端

```python
"""
Polymarket 数据客户端：通过 Dome API 获取黄金 GC Up/Down 事件的历史数据。

API 端点:
- GET /v1/polymarket/markets?search=...&status=open|closed  → 搜索事件
- GET /v1/polymarket/candlesticks/{condition_id}?interval=1|60|1440&start_time=...&end_time=...  → K线数据
"""
import time
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

DOME_API_BASE = "https://api.domeapi.io/v1/polymarket"
DOME_API_KEY = "8d731a33e4d3d9d2c02466ed3f077cae0d9e4fcd"
HEADERS = {"Authorization": f"Bearer {DOME_API_KEY}"}


def search_gc_markets(status: str = "closed", limit: int = 100) -> List[Dict[str, Any]]:
    """搜索所有 Gold (GC) Up or Down 事件。"""
    all_markets = []
    search_terms = ["gc+up+or+down", "gold+gc+up+or+down"]
    seen_slugs = set()
    for term in search_terms:
        url = f"{DOME_API_BASE}/markets?search={term}&status={status}&limit={limit}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            markets = data if isinstance(data, list) else data.get("markets", [])
            for m in markets:
                slug = m.get("market_slug", "")
                title = m.get("title", "").lower()
                if slug not in seen_slugs and "gc" in title and ("up or down" in title or "up-or-down" in slug):
                    seen_slugs.add(slug)
                    all_markets.append(m)
        except Exception as e:
            print(f"  [警告] 搜索 '{term}' 失败: {e}")
    all_markets.sort(key=lambda m: m.get("start_time", 0))
    return all_markets


def fetch_candlesticks(condition_id: str, start_time: int, end_time: int, interval: int = 1) -> Dict[str, List[Dict[str, Any]]]:
    """获取某个事件的 K 线数据。interval: 1=1分钟, 60=1小时, 1440=1天"""
    url = f"{DOME_API_BASE}/candlesticks/{condition_id}"
    params = {"interval": interval, "start_time": start_time, "end_time": end_time}
    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [警告] 获取 candlesticks 失败: {e}")
        return {}
    result = {}
    for side_data in data.get("candlesticks", []):
        if len(side_data) < 2:
            continue
        candles = side_data[0]
        meta = side_data[1]
        side_label = meta.get("side", "Unknown")
        result[side_label] = candles
    return result


def fetch_hourly_prices(condition_id: str, start_time: int, end_time: int) -> List[Dict[str, Any]]:
    """获取某个事件的小时级价格序列（interval=60）。"""
    candles = fetch_candlesticks(condition_id, start_time, end_time, interval=60)
    up_candles = candles.get("Up", [])
    down_candles = candles.get("Down", [])
    up_map = {}
    for c in up_candles:
        ts = c["end_period_ts"]
        up_map[ts] = {"price_up": float(c["price"]["close_dollars"]), "volume": c.get("volume", 0)}
    down_map = {}
    for c in down_candles:
        ts = c["end_period_ts"]
        down_map[ts] = {"price_down": float(c["price"]["close_dollars"])}
    all_ts = sorted(set(list(up_map.keys()) + list(down_map.keys())))
    result = []
    for ts in all_ts:
        entry = {
            "timestamp": ts,
            "datetime": datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "price_up": up_map.get(ts, {}).get("price_up"),
            "price_down": down_map.get(ts, {}).get("price_down"),
            "volume": up_map.get(ts, {}).get("volume", 0),
        }
        if entry["price_up"] is not None and entry["price_down"] is None:
            entry["price_down"] = round(1.0 - entry["price_up"], 4)
        elif entry["price_down"] is not None and entry["price_up"] is None:
            entry["price_up"] = round(1.0 - entry["price_down"], 4)
        result.append(entry)
    return result


def fetch_minute_prices(condition_id: str, start_time: int, end_time: int) -> List[Dict[str, Any]]:
    """获取某个事件的分钟级价格序列（interval=1）。"""
    candles = fetch_candlesticks(condition_id, start_time, end_time, interval=1)
    up_candles = candles.get("Up", [])
    down_candles = candles.get("Down", [])
    up_map = {}
    for c in up_candles:
        ts = c["end_period_ts"]
        up_map[ts] = {"price_up": float(c["price"]["close_dollars"]), "volume": c.get("volume", 0)}
    down_map = {}
    for c in down_candles:
        ts = c["end_period_ts"]
        down_map[ts] = {"price_down": float(c["price"]["close_dollars"])}
    all_ts = sorted(set(list(up_map.keys()) + list(down_map.keys())))
    result = []
    for ts in all_ts:
        entry = {
            "timestamp": ts,
            "datetime": datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "price_up": up_map.get(ts, {}).get("price_up"),
            "price_down": down_map.get(ts, {}).get("price_down"),
            "volume": up_map.get(ts, {}).get("volume", 0),
        }
        if entry["price_up"] is not None and entry["price_down"] is None:
            entry["price_down"] = round(1.0 - entry["price_up"], 4)
        elif entry["price_down"] is not None and entry["price_up"] is None:
            entry["price_up"] = round(1.0 - entry["price_down"], 4)
        result.append(entry)
    return result


def fetch_all_gc_history(include_open: bool = False, interval: int = 1, sleep_between: float = 0.5) -> List[Dict[str, Any]]:
    """获取所有已结算的 GC Up/Down 事件及其价格数据。"""
    print("正在搜索所有已结算的 Gold (GC) Up/Down 事件...")
    closed_markets = search_gc_markets(status="closed")
    print(f"  找到 {len(closed_markets)} 个已结算事件")
    if include_open:
        open_markets = search_gc_markets(status="open")
        print(f"  找到 {len(open_markets)} 个进行中事件")
    else:
        open_markets = []
    all_markets = closed_markets + open_markets
    results = []
    for i, m in enumerate(all_markets):
        slug = m.get("market_slug", "")
        title = m.get("title", "")
        cond_id = m.get("condition_id", "")
        start_t = m.get("start_time", 0)
        end_t = m.get("end_time", 0) or m.get("completed_time", 0) or m.get("close_time", 0)
        ws = m.get("winning_side")
        winning_label = None
        if isinstance(ws, dict):
            winning_label = ws.get("label")
        elif isinstance(ws, str):
            winning_label = ws
        print(f"  [{i+1}/{len(all_markets)}] {title} → winner={winning_label}")
        if not cond_id:
            print(f"    跳过: 无 condition_id")
            continue
        prices = fetch_minute_prices(cond_id, start_t, end_t)
        hourly = fetch_hourly_prices(cond_id, start_t, end_t)
        print(f"    获取到 {len(prices)} 分钟级 / {len(hourly)} 小时级价格点")
        results.append({
            "market_slug": slug, "title": title, "condition_id": cond_id,
            "start_time": start_t, "end_time": end_t, "winning_side": winning_label,
            "volume_total": m.get("volume_total", 0),
            "side_a_label": m.get("side_a", {}).get("label", ""),
            "side_b_label": m.get("side_b", {}).get("label", ""),
            "minute_prices": prices, "hourly_prices": hourly,
        })
        if sleep_between > 0 and i < len(all_markets) - 1:
            time.sleep(sleep_between)
    return results
```

---

## 2. `model_predictor.py` — AI 回归模型预测器

```python
"""
模型预测器：为回测系统提供历史日期的金价涨跌概率预测。

对每个历史事件日期，模拟"站在前一天"的视角：
1. 获取截至前一天的历史金价数据
2. 获取截至前一天的代理指标数据
3. 用回归模型预测目标日期的涨跌概率
4. （可选）调用 AI 做定性分析并融合

模式：
- fast: 仅用回归模型（无 AI 调用，速度快）
- full: 回归 + AI 融合（完整流程，但每个事件需要 ~30s）
"""
import sys
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)

from gold_analyzer.price_fetcher import fetch_gold_prices, get_price_summary, format_price_context
from gold_analyzer.factor_data import fetch_proxy_data, build_feature_matrix
from gold_analyzer.regression import train_and_predict, compute_combined_probability

# 默认使用的代理指标（覆盖主要宏观因素）
DEFAULT_PROXY_IDS = [
    "us_10y_yield",      # 美国10年期国债收益率
    "us_2y_yield",       # 美国2年期国债收益率
    "dxy_index",         # 美元指数
    "sp500",             # 标普500
    "vix",               # 恐慌指数
    "oil_wti",           # 原油价格
    "silver",            # 白银价格
    "tips_etf",          # 通胀保值债券
    "gld_volume",        # 黄金ETF成交量
    "copper",            # 铜价格
]

DEFAULT_PROXY_CONFIG = [
    {"proxy_id": "us_10y_yield", "ai_weight": 8, "direction_on_gold": "negative"},
    {"proxy_id": "us_2y_yield", "ai_weight": 6, "direction_on_gold": "negative"},
    {"proxy_id": "dxy_index", "ai_weight": 9, "direction_on_gold": "negative"},
    {"proxy_id": "sp500", "ai_weight": 5, "direction_on_gold": "negative"},
    {"proxy_id": "vix", "ai_weight": 7, "direction_on_gold": "positive"},
    {"proxy_id": "oil_wti", "ai_weight": 4, "direction_on_gold": "positive"},
    {"proxy_id": "silver", "ai_weight": 6, "direction_on_gold": "positive"},
    {"proxy_id": "tips_etf", "ai_weight": 5, "direction_on_gold": "positive"},
    {"proxy_id": "gld_volume", "ai_weight": 3, "direction_on_gold": "positive"},
    {"proxy_id": "copper", "ai_weight": 4, "direction_on_gold": "positive"},
]


def predict_for_date(
    target_date: str, mode: str = "fast",
    lookback_days: int = 365, forecast_horizon: int = 1,
) -> Dict[str, Any]:
    """
    预测某个目标日期的金价涨跌概率。
    模拟"站在前一天"的视角，只使用 target_date 之前的数据。
    """
    try:
        d_target = datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        return _fallback_result("invalid date format")

    end_date = (d_target - timedelta(days=1)).strftime("%Y-%m-%d")

    # Step 1: 获取历史金价
    try:
        df = fetch_gold_prices(end_date=end_date, lookback_days=lookback_days)
        if df is None or df.empty or len(df) < 30:
            return _fallback_result("insufficient gold price data")
    except Exception as e:
        return _fallback_result(f"gold price fetch error: {e}")

    # Step 2: 获取代理指标数据
    try:
        proxy_data = fetch_proxy_data(
            proxy_ids=DEFAULT_PROXY_IDS, end_date=end_date, lookback_days=lookback_days,
        )
        if proxy_data is None or proxy_data.empty:
            return _fallback_result("insufficient proxy data")
    except Exception as e:
        return _fallback_result(f"proxy data fetch error: {e}")

    # Step 3: 构建特征矩阵
    try:
        feature_matrix = build_feature_matrix(
            proxy_data=proxy_data, gold_prices=df,
            selected_proxies=DEFAULT_PROXY_CONFIG, forecast_horizon=forecast_horizon,
        )
        if feature_matrix is None or feature_matrix.empty or len(feature_matrix) < 30:
            return _fallback_result("insufficient feature matrix")
    except Exception as e:
        return _fallback_result(f"feature matrix error: {e}")

    # Step 4: 训练回归模型并预测
    try:
        regression_result = train_and_predict(
            feature_matrix=feature_matrix,
            selected_proxies=DEFAULT_PROXY_CONFIG,
            forecast_horizon=forecast_horizon,
        )
        if "error" in regression_result:
            return _fallback_result(f"regression error: {regression_result['error']}")
    except Exception as e:
        return _fallback_result(f"regression error: {e}")

    prob_up = regression_result.get("probability_up", 0.5)
    prob_down = regression_result.get("probability_down", 0.5)

    # Step 5: (full mode) AI 融合
    if mode == "full":
        try:
            price_summary = get_price_summary(df)
            price_context = format_price_context(price_summary)
            from gold_analyzer.news_fetcher import fetch_all_gold_news, format_news_context
            from gold_analyzer.factor_collector import collect_factors
            from gold_analyzer.deep_analyzer import deep_analyze
            from gold_analyzer.main import _extract_factors
            news_list = fetch_all_gold_news(max_total=20, period="3d")
            news_context = format_news_context(news_list, max_items=15)
            current_time = end_date + " 23:59:59"
            factors_result = collect_factors(
                current_date=current_time, target_date=target_date,
                price_context=price_context, news_context=news_context,
            )
            factors = _extract_factors(factors_result)
            deep_result = deep_analyze(
                current_date=current_time, target_date=target_date,
                price_context=price_context, factors_result={"factors": factors},
                news_context=news_context,
            )
            ai_bias = deep_result.get("short_term_bias", "neutral")
            ai_conf = deep_result.get("short_term_confidence", "medium")
            combined = compute_combined_probability(
                regression_result=regression_result,
                ai_qualitative_bias=ai_bias, ai_confidence=ai_conf,
            )
            prob_up = combined.get("final_probability_up", prob_up)
            prob_down = combined.get("final_probability_down", prob_down)
            return {
                "probability_up": prob_up, "probability_down": prob_down,
                "prediction": "Up" if prob_up > 0.5 else "Down",
                "method": "regression+ai",
                "details": {
                    "regression_prob_up": regression_result.get("probability_up"),
                    "ai_bias": ai_bias, "ai_confidence": ai_conf, "combined": combined,
                },
            }
        except Exception as e:
            pass  # AI 失败，退回到纯回归结果

    return {
        "probability_up": prob_up, "probability_down": prob_down,
        "prediction": "Up" if prob_up > 0.5 else "Down",
        "method": "regression",
        "details": {
            "regression_prob_up": prob_up,
            "model_accuracy": regression_result.get("accuracy"),
            "n_features": regression_result.get("n_features"),
            "n_samples": regression_result.get("n_samples"),
        },
    }


def _fallback_result(reason: str) -> Dict[str, Any]:
    """数据不足时的回退结果：返回 50/50"""
    return {
        "probability_up": 0.5, "probability_down": 0.5,
        "prediction": "Up", "method": "fallback",
        "details": {"reason": reason},
    }


def batch_predict(target_dates: List[str], mode: str = "fast", verbose: bool = True) -> Dict[str, Dict[str, Any]]:
    """批量预测多个日期的金价涨跌概率。"""
    results = {}
    for i, date in enumerate(target_dates):
        if verbose:
            print(f"  [{i+1}/{len(target_dates)}] 预测 {date}...", end=" ", flush=True)
        result = predict_for_date(date, mode=mode)
        results[date] = result
        if verbose:
            print(f"→ {result['prediction']} ({result['probability_up']*100:.1f}%) [{result['method']}]")
    return results
```

---

## 3. `backtester.py` — 回测引擎

```python
"""
Polymarket 回测引擎：

核心逻辑：
1. 对每个已结算的 GC Up/Down 事件，获取小时级价格序列
2. 每小时检查：模型预测的上涨概率 vs Polymarket 当前定价（=市场隐含概率）
3. 当两者差异超过阈值时，按模型概率方向交易
4. 事件结算后计算盈亏
5. 汇总所有交易的胜率、平均盈利、最大回撤等

交易规则（二元期权）：
- 买入 "Up" token @ price_up → 如果最终 Up 赢，获得 $1/share；否则 $0
- 买入 "Down" token @ price_down → 如果最终 Down 赢，获得 $1/share；否则 $0
- 盈利 = (结算价 - 买入价) * 份数
- 每笔交易固定投入 $1（即买入 1/price 份）
"""
import sys
import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone

if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)


@dataclass
class Trade:
    """单笔交易记录"""
    event_slug: str           # 事件标识
    event_title: str          # 事件标题
    timestamp: int            # 交易时间 (unix ts)
    side: str                 # "Up" 或 "Down"
    entry_price: float        # 买入价格 (0~1)
    model_prob_up: float      # 模型预测的上涨概率
    market_price_up: float    # Polymarket 的 Up 定价
    edge: float               # 预期优势 = |model_prob - market_price|
    bet_amount: float         # 投注金额 ($)
    shares: float             # 买入份数 = bet_amount / entry_price
    outcome: Optional[str] = None      # 实际结果 "Up" 或 "Down"
    settlement_price: float = 0.0      # 结算价 (1.0 或 0.0)
    pnl: float = 0.0                   # 盈亏 = (settlement - entry) * shares
    is_win: bool = False               # 是否盈利


@dataclass
class BacktestResult:
    """回测汇总结果"""
    total_events: int = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    total_invested: float = 0.0
    roi: float = 0.0
    avg_pnl_per_trade: float = 0.0
    avg_pnl_per_win: float = 0.0
    avg_pnl_per_loss: float = 0.0
    max_single_win: float = 0.0
    max_single_loss: float = 0.0
    max_drawdown: float = 0.0
    sharpe_like: float = 0.0
    trades: List[Trade] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)


def decide_trade(
    model_prob_up: float,
    market_price_up: float,
    market_price_down: float,
    edge_threshold: float = 0.05,
    bet_amount: float = 1.0,
    only_model_direction: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    根据模型概率和市场定价决定是否交易。
    only_model_direction=True 时，只允许交易方向与模型预测方向一致。
    """
    model_prob_down = 1.0 - model_prob_up
    model_direction = "Up" if model_prob_up >= 0.5 else "Down"

    edge_up = model_prob_up - market_price_up
    edge_down = model_prob_down - market_price_down

    if only_model_direction:
        if model_direction == "Up" and edge_up > edge_threshold:
            entry_price = market_price_up
            if entry_price <= 0 or entry_price >= 1:
                return None
            return {"side": "Up", "entry_price": entry_price, "edge": edge_up,
                    "shares": bet_amount / entry_price, "bet_amount": bet_amount}
        elif model_direction == "Down" and edge_down > edge_threshold:
            entry_price = market_price_down
            if entry_price <= 0 or entry_price >= 1:
                return None
            return {"side": "Down", "entry_price": entry_price, "edge": edge_down,
                    "shares": bet_amount / entry_price, "bet_amount": bet_amount}
        return None

    if edge_up > edge_threshold and edge_up >= edge_down:
        entry_price = market_price_up
        if entry_price <= 0 or entry_price >= 1:
            return None
        return {"side": "Up", "entry_price": entry_price, "edge": edge_up,
                "shares": bet_amount / entry_price, "bet_amount": bet_amount}
    elif edge_down > edge_threshold and edge_down > edge_up:
        entry_price = market_price_down
        if entry_price <= 0 or entry_price >= 1:
            return None
        return {"side": "Down", "entry_price": entry_price, "edge": edge_down,
                "shares": bet_amount / entry_price, "bet_amount": bet_amount}
    return None


def run_backtest_with_model(
    events_data: List[Dict[str, Any]],
    model_predictions: Dict[str, Dict[str, Any]],
    edge_threshold: float = 0.05,
    bet_amount: float = 1.0,
    max_trades_per_event: int = 999,
    only_model_direction: bool = False,
    min_confidence: float = 0.0,
) -> BacktestResult:
    """每小时检查市场价格，与模型概率对比，有 edge 就买入 $1。"""
    result = BacktestResult()
    all_trades: List[Trade] = []

    for event in events_data:
        slug = event.get("market_slug", "")
        title = event.get("title", "")
        winning_side = event.get("winning_side")
        target_date = event.get("target_date", "")
        prices = event.get("hourly_prices") or event.get("minute_prices", [])

        if not winning_side or not prices or not target_date:
            continue

        pred = model_predictions.get(target_date)
        if pred is None or pred.get("method") == "fallback":
            continue

        model_prob_up = pred.get("probability_up", 0.5)

        confidence = max(model_prob_up, 1.0 - model_prob_up)
        if confidence < min_confidence:
            continue
        result.total_events += 1
        trades_this_event = 0

        for p in prices:
            if trades_this_event >= max_trades_per_event:
                break
            price_up = p.get("price_up")
            price_down = p.get("price_down")
            if price_up is None or price_down is None:
                continue
            if price_up <= 0.01 or price_up >= 0.99:
                continue
            if price_down <= 0.01 or price_down >= 0.99:
                continue

            decision = decide_trade(
                model_prob_up=model_prob_up, market_price_up=price_up,
                market_price_down=price_down, edge_threshold=edge_threshold,
                bet_amount=bet_amount, only_model_direction=only_model_direction,
            )
            if decision is None:
                continue

            trade = Trade(
                event_slug=slug, event_title=title, timestamp=p["timestamp"],
                side=decision["side"], entry_price=decision["entry_price"],
                model_prob_up=model_prob_up, market_price_up=price_up,
                edge=decision["edge"], bet_amount=decision["bet_amount"],
                shares=decision["shares"],
            )
            trade.outcome = winning_side
            if trade.side == winning_side:
                trade.settlement_price = 1.0
                trade.is_win = True
            else:
                trade.settlement_price = 0.0
                trade.is_win = False
            trade.pnl = (trade.settlement_price - trade.entry_price) * trade.shares
            all_trades.append(trade)
            trades_this_event += 1

    _compute_stats(result, all_trades)
    return result


def _compute_stats(result: BacktestResult, all_trades: List[Trade]):
    """汇总交易统计"""
    result.trades = all_trades
    result.total_trades = len(all_trades)
    if result.total_trades == 0:
        return

    wins = [t for t in all_trades if t.is_win]
    losses = [t for t in all_trades if not t.is_win]
    result.winning_trades = len(wins)
    result.losing_trades = len(losses)
    result.win_rate = len(wins) / len(all_trades)
    result.total_pnl = sum(t.pnl for t in all_trades)
    result.total_invested = sum(t.bet_amount for t in all_trades)
    result.roi = result.total_pnl / result.total_invested if result.total_invested > 0 else 0
    result.avg_pnl_per_trade = result.total_pnl / len(all_trades)
    result.avg_pnl_per_win = sum(t.pnl for t in wins) / len(wins) if wins else 0
    result.avg_pnl_per_loss = sum(t.pnl for t in losses) / len(losses) if losses else 0

    pnls = [t.pnl for t in all_trades]
    result.max_single_win = max(pnls) if pnls else 0
    result.max_single_loss = min(pnls) if pnls else 0

    equity = 0.0
    peak = 0.0
    max_dd = 0.0
    curve = []
    for t in all_trades:
        equity += t.pnl
        curve.append(equity)
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    result.equity_curve = curve
    result.max_drawdown = max_dd

    import numpy as np
    if len(pnls) > 1:
        result.sharpe_like = float(np.mean(pnls) / np.std(pnls)) if np.std(pnls) > 0 else 0


def sweep_parameters(events_data, prob_range=None, edge_range=None):
    """扫描不同的 model_prob_up 和 edge_threshold 参数组合。"""
    if prob_range is None:
        prob_range = [0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75]
    if edge_range is None:
        edge_range = [0.03, 0.05, 0.08, 0.10, 0.15, 0.20]
    results = []
    for prob in prob_range:
        for edge in edge_range:
            r = run_backtest(events_data=events_data, model_prob_up=prob,
                             edge_threshold=edge, max_trades_per_event=1)
            results.append({
                "prob": prob, "edge": edge, "events": r.total_events,
                "trades": r.total_trades, "wins": r.winning_trades,
                "win_rate": r.win_rate, "total_pnl": r.total_pnl,
                "roi": r.roi, "max_dd": r.max_drawdown, "sharpe": r.sharpe_like,
            })
    return results
```
## 4. `run_backtest.py` — 回测入口

```python
#!/usr/bin/env python3
"""
回测入口：获取 Polymarket 黄金 GC Up/Down 历史数据，运行回测并输出结果。

用法:
    python run_backtest.py --model --edge 0.05 --strict --min-conf 0.80
"""
import sys
import os
import re
import argparse
import json
from datetime import datetime, timezone

_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from gold_analyzer.polymarket_client import fetch_all_gc_history
from gold_analyzer.backtester import (
    run_backtest, run_backtest_with_model,
    print_backtest_report, sweep_parameters, print_sweep_report,
)

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gc_events_cache.json")
PREDICTIONS_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_predictions_cache.json")

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def parse_target_date_from_slug(slug: str) -> str:
    """从事件 slug 中提取目标日期。例: "gc-up-or-down-on-january-8-2026" → "2026-01-08" """
    pattern = r"on-([a-z]+)-(\d+)-(\d{4})"
    match = re.search(pattern, slug)
    if match:
        month_name = match.group(1)
        day = int(match.group(2))
        year = int(match.group(3))
        month = MONTH_MAP.get(month_name, 0)
        if month > 0:
            return f"{year}-{month:02d}-{day:02d}"
    return ""


def load_or_fetch_data(force_refresh: bool = False) -> list:
    """加载缓存数据或从 API 获取"""
    if not force_refresh and os.path.exists(CACHE_FILE):
        print(f"从缓存加载数据: {CACHE_FILE}")
        with open(CACHE_FILE, "r") as f:
            data = json.load(f)
        print(f"  缓存中有 {len(data)} 个事件")
        return data
    print("从 Dome API 获取数据（首次运行可能需要 30-60 秒）...")
    data = fetch_all_gc_history(include_open=False, interval=1, sleep_between=0.3)
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"数据已缓存到: {CACHE_FILE}")
    return data


def enrich_events_with_dates(events: list) -> list:
    """为每个事件添加 target_date 字段（从 slug 解析）"""
    for e in events:
        slug = e.get("market_slug", "")
        td = parse_target_date_from_slug(slug)
        e["target_date"] = td
    return events


def run_model_predictions(valid_events: list, mode: str = "fast") -> dict:
    """对所有事件运行模型预测，返回 {date: prediction} 映射。支持缓存。"""
    from gold_analyzer.model_predictor import predict_for_date

    if os.path.exists(PREDICTIONS_CACHE):
        with open(PREDICTIONS_CACHE, "r") as f:
            cached = json.load(f)
        print(f"  已有 {len(cached)} 个缓存预测")
    else:
        cached = {}

    target_dates = []
    for e in valid_events:
        td = e.get("target_date", "")
        if td and td not in cached:
            target_dates.append(td)

    if target_dates:
        print(f"  需要新预测 {len(target_dates)} 个日期...")
        for i, date in enumerate(target_dates):
            print(f"  [{i+1}/{len(target_dates)}] 预测 {date}...", end=" ", flush=True)
            try:
                result = predict_for_date(date, mode=mode)
                cached[date] = result
                print(f"→ {result['prediction']} ({result['probability_up']*100:.1f}%) [{result['method']}]")
            except Exception as ex:
                print(f"→ 失败: {ex}")
                cached[date] = {"probability_up": 0.5, "probability_down": 0.5,
                                "prediction": "Up", "method": "fallback",
                                "details": {"reason": str(ex)}}
        with open(PREDICTIONS_CACHE, "w") as f:
            json.dump(cached, f, ensure_ascii=False, indent=2)
        print(f"  预测结果已缓存到: {PREDICTIONS_CACHE}")
    else:
        print(f"  所有 {len(cached)} 个预测已在缓存中")
    return cached


def print_model_backtest_report(result, edge_threshold: float, predictions: dict):
    """打印模型驱动的回测报告（每小时决策版）"""
    from collections import OrderedDict

    print("\n" + "=" * 80)
    print("  ★ AI 模型 × Polymarket 每小时决策回测报告 ★")
    print("=" * 80)

    print(f"\n策略参数:")
    print(f"  模型:           AI 回归模型（站在前一天预测）")
    print(f"  决策频率:       每小时检查一次市场定价")
    print(f"  最小 edge 阈值: {edge_threshold*100:.1f}%")
    print(f"  每次买入金额:   $1.00")
    print(f"  逻辑: 模型概率 vs 市场定价，有 edge 就买入 $1")

    print(f"\n交易统计:")
    print(f"  参与事件数:   {result.total_events}")
    print(f"  总交易笔数:   {result.total_trades}")
    print(f"  盈利笔数:     {result.winning_trades}")
    print(f"  亏损笔数:     {result.losing_trades}")
    print(f"  胜率:         {result.win_rate*100:.1f}%")
    if result.total_events > 0:
        print(f"  平均每事件:   {result.total_trades/result.total_events:.1f} 笔交易")

    print(f"\n盈亏统计:")
    print(f"  总投入:       ${result.total_invested:.2f}")
    print(f"  总盈亏:       ${result.total_pnl:+.2f}")
    print(f"  投资回报率:   {result.roi*100:+.1f}%")
    print(f"  每笔平均盈亏: ${result.avg_pnl_per_trade:+.4f}")
    print(f"  盈利笔均盈:   ${result.avg_pnl_per_win:+.4f}")
    print(f"  亏损笔均亏:   ${result.avg_pnl_per_loss:+.4f}")
    print(f"  单笔最大盈利: ${result.max_single_win:+.4f}")
    print(f"  单笔最大亏损: ${result.max_single_loss:+.4f}")
    print(f"  最大回撤:     ${result.max_drawdown:.4f}")
    print(f"  夏普比率(简): {result.sharpe_like:.4f}")

    # 按事件汇总
    event_groups = OrderedDict()
    for t in result.trades:
        td = parse_target_date_from_slug(t.event_slug) or t.event_slug
        if td not in event_groups:
            event_groups[td] = []
        event_groups[td].append(t)

    print(f"\n按事件汇总 ({len(event_groups)} 个事件):")
    print(f"  {'日期':<12} {'模型P(Up)':>9} {'实际':>4} {'交易数':>5} {'盈利':>4} {'亏损':>4} {'净盈亏':>10} {'ROI':>8}")
    print(f"  {'-'*12} {'-'*9:>9} {'----':>4} {'-----':>5} {'----':>4} {'----':>4} {'----------':>10} {'--------':>8}")

    for td, trades in event_groups.items():
        wins = sum(1 for t in trades if t.is_win)
        losses = len(trades) - wins
        pnl = sum(t.pnl for t in trades)
        invested = sum(t.bet_amount for t in trades)
        roi = pnl / invested * 100 if invested > 0 else 0
        actual = trades[0].outcome or "?"
        model_p = trades[0].model_prob_up
        print(f"  {td:<12} {model_p:>8.1%} {actual:>4} {len(trades):>5} {wins:>4} {losses:>4} ${pnl:>+9.2f} {roi:>+7.1f}%")

    # 每笔交易明细
    print(f"\n每笔交易明细 ({result.total_trades} 笔):")
    print(f"  {'日期':<12} {'时间(UTC)':>10} {'模型':>6} {'市场':>6} {'Edge':>6} {'方向':>4} {'买入':>5} {'结果':>3} {'盈亏':>9}")
    print(f"  {'-'*12} {'-'*10:>10} {'-'*6:>6} {'-'*6:>6} {'-'*6:>6} {'----':>4} {'-----':>5} {'---':>3} {'-'*9:>9}")

    for t in result.trades:
        td = parse_target_date_from_slug(t.event_slug) or "?"
        ts_str = datetime.fromtimestamp(t.timestamp, tz=timezone.utc).strftime("%H:%M")
        win_mark = "✓" if t.is_win else "✗"
        print(f"  {td:<12} {ts_str:>10} {t.model_prob_up:>5.0%} {t.market_price_up:>5.0%} "
              f"{t.edge:>5.0%} {t.side:>4} {t.entry_price:>5.2f} {win_mark:>3} ${t.pnl:>+8.2f}")

    # 模型方向预测准确率
    correct = 0
    total_events = 0
    seen_dates = set()
    for t in result.trades:
        td = parse_target_date_from_slug(t.event_slug)
        if td and td not in seen_dates and td in predictions:
            seen_dates.add(td)
            pred_dir = predictions[td].get("prediction", "")
            actual = t.outcome
            if pred_dir and actual:
                total_events += 1
                if pred_dir == actual:
                    correct += 1
    if total_events > 0:
        print(f"\n模型方向预测准确率: {correct}/{total_events} = {correct/total_events*100:.1f}%")

    print("\n" + "=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Polymarket 黄金 GC 回测")
    parser.add_argument("--prob", type=float, default=0.60,
                        help="固定模型上涨概率 (默认 0.60)")
    parser.add_argument("--edge", type=float, default=0.05,
                        help="最小 edge 阈值 (默认 0.05)")
    parser.add_argument("--bet", type=float, default=1.0,
                        help="每笔投注金额 (默认 $1.00)")
    parser.add_argument("--max-trades", type=int, default=1,
                        help="每个事件最多交易几笔 (默认 1)")
    parser.add_argument("--sweep", action="store_true",
                        help="固定概率参数扫描模式")
    parser.add_argument("--model", action="store_true",
                        help="使用 AI 回归模型动态预测每个事件的概率")
    parser.add_argument("--model-mode", choices=["fast", "full"], default="fast",
                        help="模型模式: fast=仅回归, full=回归+AI (默认 fast)")
    parser.add_argument("--refresh", action="store_true",
                        help="强制从 API 重新获取 Polymarket 数据")
    parser.add_argument("--refresh-predictions", action="store_true",
                        help="强制重新运行模型预测（清除预测缓存）")
    parser.add_argument("--strict", action="store_true",
                        help="严格模式：只允许交易方向与模型预测方向一致（禁止矛盾交易）")
    parser.add_argument("--min-conf", type=float, default=0.0,
                        help="最低置信度阈值，只在模型置信度>=此值时交易 (例: 0.80)")
    args = parser.parse_args()

    print("=" * 80)
    print("  Polymarket 黄金 GC Up/Down 回测系统")
    print("=" * 80)

    events_data = load_or_fetch_data(force_refresh=args.refresh)
    events_data = enrich_events_with_dates(events_data)

    valid_events = [
        e for e in events_data
        if e.get("winning_side") and (
            len(e.get("hourly_prices", [])) > 0 or len(e.get("minute_prices", [])) > 0
        )
    ]
    print(f"\n有效事件: {len(valid_events)} 个（有结算结果且有价格数据）")

    up_count = sum(1 for e in valid_events if e["winning_side"] == "Up")
    down_count = sum(1 for e in valid_events if e["winning_side"] == "Down")
    print(f"  实际结果分布: Up={up_count} ({up_count/len(valid_events)*100:.0f}%) | "
          f"Down={down_count} ({down_count/len(valid_events)*100:.0f}%)")

    dated_events = [e for e in valid_events if e.get("target_date")]
    print(f"  成功解析日期: {len(dated_events)}/{len(valid_events)} 个事件")

    if args.model:
        print(f"\n[模型模式] 使用 AI 回归模型预测每个事件的概率 (mode={args.model_mode})")
        if args.refresh_predictions and os.path.exists(PREDICTIONS_CACHE):
            os.remove(PREDICTIONS_CACHE)
            print("  已清除预测缓存")
        predictions = run_model_predictions(dated_events, mode=args.model_mode)

        strict_label = " [严格模式]" if args.strict else ""
        conf_label = f" [置信度>={args.min_conf:.0%}]" if args.min_conf > 0 else ""
        print(f"\n运行模型驱动回测: edge={args.edge}, 每小时检查一次{strict_label}{conf_label}")
        result = run_backtest_with_model(
            events_data=dated_events,
            model_predictions=predictions,
            edge_threshold=args.edge,
            bet_amount=args.bet,
            max_trades_per_event=999,
            only_model_direction=args.strict,
            min_confidence=args.min_conf,
        )
        print_model_backtest_report(result, args.edge, predictions)

    elif args.sweep:
        print("\n开始参数扫描...")
        sweep_results = sweep_parameters(
            events_data=valid_events,
            prob_range=[0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80],
            edge_range=[0.02, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25],
        )
        print_sweep_report(sweep_results)

    else:
        print(f"\n运行回测: prob={args.prob}, edge={args.edge}, bet=${args.bet}")
        result = run_backtest(
            events_data=valid_events,
            model_prob_up=args.prob,
            edge_threshold=args.edge,
            bet_amount=args.bet,
            max_trades_per_event=args.max_trades,
        )
        print_backtest_report(result, args.prob, args.edge)


if __name__ == "__main__":
    main()
```
