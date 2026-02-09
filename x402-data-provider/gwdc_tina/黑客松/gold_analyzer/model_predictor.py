"""
模型预测器：为回测系统提供历史日期的金价涨跌概率预测。

对每个历史事件日期，模拟"站在前一天"的视角：
1. 获取截至前一天的历史金价数据
2. 获取截至前一天的代理指标数据
3. 用回归模型预测目标日期的涨跌概率
4. （可选）调用 AI 做定性分析并融合

为了回测效率，提供两种模式：
- fast: 仅用回归模型（无 AI 调用，速度快）
- full: 回归 + AI 融合（完整流程，但每个事件需要 ~30s）
"""
import sys
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

# 让直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)

from gold_analyzer.price_fetcher import fetch_gold_prices, get_price_summary, format_price_context
from gold_analyzer.factor_data import fetch_proxy_data, build_feature_matrix, ai_select_proxies, FACTOR_PROXY_REGISTRY
from gold_analyzer.regression import train_and_predict, compute_combined_probability


# 默认使用的代理指标（覆盖主要宏观因素，无需 AI 选择）
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

# 默认代理指标的权重和方向（简化版，无需 AI）
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


# AI 代理指标选择缓存（避免同一日期重复调用 AI）
_ai_proxy_cache: Dict[str, Any] = {}


def _ai_select_proxies_for_date(
    target_date: str,
    price_context: str,
) -> tuple:
    """
    让 AI 从 65 个代理指标中选择 8-15 个最相关的，并决定权重和方向。
    结果会缓存，同一日期不重复调用。

    Returns:
        (proxy_ids, proxy_config)  或在失败时回退到默认值
    """
    if target_date in _ai_proxy_cache:
        cached = _ai_proxy_cache[target_date]
        return cached["proxy_ids"], cached["proxy_config"]

    # 构造简化的因素列表（基于价格上下文让 AI 判断当前市场主题）
    generic_factors = [
        {"name": "美联储货币政策", "direction": "unknown", "impact_level": "high", "weight": 8},
        {"name": "美元走势", "direction": "unknown", "impact_level": "high", "weight": 7},
        {"name": "通胀预期", "direction": "unknown", "impact_level": "medium", "weight": 6},
        {"name": "地缘政治风险", "direction": "unknown", "impact_level": "medium", "weight": 6},
        {"name": "市场风险偏好", "direction": "unknown", "impact_level": "medium", "weight": 5},
        {"name": "黄金ETF资金流", "direction": "unknown", "impact_level": "medium", "weight": 5},
        {"name": "全球经济增长", "direction": "unknown", "impact_level": "medium", "weight": 4},
    ]

    try:
        current_time = (datetime.strptime(target_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d") + " 23:59:59"
        result = ai_select_proxies(
            current_date=current_time,
            target_date=target_date,
            factors=generic_factors,
            price_context=price_context,
        )
        selected = result.get("selected_proxies", [])
        if len(selected) >= 5:
            proxy_ids = [s["proxy_id"] for s in selected]
            proxy_config = selected
            _ai_proxy_cache[target_date] = {"proxy_ids": proxy_ids, "proxy_config": proxy_config}
            return proxy_ids, proxy_config
    except Exception as e:
        print(f"    [AI选择失败，回退默认] {e}")

    # 回退到默认
    _ai_proxy_cache[target_date] = {"proxy_ids": DEFAULT_PROXY_IDS, "proxy_config": DEFAULT_PROXY_CONFIG}
    return DEFAULT_PROXY_IDS, DEFAULT_PROXY_CONFIG


def predict_for_date(
    target_date: str,
    mode: str = "fast",
    lookback_days: int = 365,
    forecast_horizon: int = 1,
) -> Dict[str, Any]:
    """
    预测某个目标日期的金价涨跌概率。

    模拟"站在前一天"的视角，只使用 target_date 之前的数据。

    Args:
        target_date: 预测目标日期 "YYYY-MM-DD"
        mode:
            - "fast": 固定10个指标 + 回归（最快，无AI调用）
            - "ai_select": AI从65个指标中选8-15个 + 回归（每个事件多~5s）
            - "full": AI选指标 + 回归 + AI定性融合（最慢，每个事件~30s）
        lookback_days: 历史数据回看天数
        forecast_horizon: 预测天数（1=明天涨跌）

    Returns:
        {
            "probability_up": float,     # 上涨概率 0~1
            "probability_down": float,   # 下跌概率 0~1
            "prediction": "Up" | "Down",
            "method": "regression" | "regression+ai_select" | "regression+ai" | "fallback",
            "details": {...}
        }
    """
    try:
        d_target = datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        return _fallback_result("invalid date format")

    # 数据截止日期 = 目标日期前一天（模拟站在前一天做预测）
    end_date = (d_target - timedelta(days=1)).strftime("%Y-%m-%d")

    # Step 1: 获取历史金价（截至 end_date）
    try:
        df = fetch_gold_prices(end_date=end_date, lookback_days=lookback_days)
        if df is None or df.empty or len(df) < 30:
            return _fallback_result("insufficient gold price data")
    except Exception as e:
        return _fallback_result(f"gold price fetch error: {e}")

    # Step 2: 选择代理指标（AI动态选择 或 固定默认）
    if mode in ("ai_select", "full"):
        price_summary = get_price_summary(df)
        price_context = format_price_context(price_summary)
        proxy_ids, proxy_config = _ai_select_proxies_for_date(target_date, price_context)
    else:
        proxy_ids = DEFAULT_PROXY_IDS
        proxy_config = DEFAULT_PROXY_CONFIG

    # Step 3: 获取代理指标数据（截至 end_date）
    try:
        proxy_data = fetch_proxy_data(
            proxy_ids=proxy_ids,
            end_date=end_date,
            lookback_days=lookback_days,
        )
        if proxy_data is None or proxy_data.empty:
            return _fallback_result("insufficient proxy data")
    except Exception as e:
        return _fallback_result(f"proxy data fetch error: {e}")

    # Step 4: 构建特征矩阵
    try:
        feature_matrix = build_feature_matrix(
            proxy_data=proxy_data,
            gold_prices=df,
            selected_proxies=proxy_config,
            forecast_horizon=forecast_horizon,
        )
        if feature_matrix is None or feature_matrix.empty or len(feature_matrix) < 30:
            return _fallback_result("insufficient feature matrix")
    except Exception as e:
        return _fallback_result(f"feature matrix error: {e}")

    # Step 5: 训练回归模型并预测
    try:
        regression_result = train_and_predict(
            feature_matrix=feature_matrix,
            selected_proxies=proxy_config,
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
                ai_qualitative_bias=ai_bias,
                ai_confidence=ai_conf,
            )

            prob_up = combined.get("final_probability_up", prob_up)
            prob_down = combined.get("final_probability_down", prob_down)

            return {
                "probability_up": prob_up,
                "probability_down": prob_down,
                "prediction": "Up" if prob_up > 0.5 else "Down",
                "method": "regression+ai",
                "details": {
                    "regression_prob_up": regression_result.get("probability_up"),
                    "ai_bias": ai_bias,
                    "ai_confidence": ai_conf,
                    "combined": combined,
                },
            }
        except Exception as e:
            # AI 失败，退回到纯回归结果
            pass

    method_label = "regression+ai_select" if mode == "ai_select" else "regression"
    return {
        "probability_up": prob_up,
        "probability_down": prob_down,
        "prediction": "Up" if prob_up > 0.5 else "Down",
        "method": method_label,
        "details": {
            "regression_prob_up": prob_up,
            "proxy_ids": proxy_ids,
            "n_proxies": len(proxy_ids),
            "model_accuracy": regression_result.get("accuracy"),
            "n_features": regression_result.get("n_features"),
            "n_samples": regression_result.get("n_samples"),
        },
    }


def _fallback_result(reason: str) -> Dict[str, Any]:
    """数据不足时的回退结果：返回 50/50"""
    return {
        "probability_up": 0.5,
        "probability_down": 0.5,
        "prediction": "Up",
        "method": "fallback",
        "details": {"reason": reason},
    }


def batch_predict(
    target_dates: List[str],
    mode: str = "fast",
    verbose: bool = True,
) -> Dict[str, Dict[str, Any]]:
    """
    批量预测多个日期的金价涨跌概率。

    Args:
        target_dates: 目标日期列表 ["2026-01-08", "2026-01-09", ...]
        mode: "fast" 或 "full"
        verbose: 是否打印进度

    Returns:
        {date_str: prediction_result, ...}
    """
    results = {}
    for i, date in enumerate(target_dates):
        if verbose:
            print(f"  [{i+1}/{len(target_dates)}] 预测 {date}...", end=" ", flush=True)
        result = predict_for_date(date, mode=mode)
        results[date] = result
        if verbose:
            print(f"→ {result['prediction']} ({result['probability_up']*100:.1f}%) [{result['method']}]")
    return results


# ---------------------------------------------------------------------------
# 测试入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  模型预测器测试")
    print("=" * 60)

    # 测试几个已知结果的日期
    test_dates = [
        "2026-01-08",  # 实际: Down
        "2026-01-09",  # 实际: Up
        "2026-02-04",  # 实际: Up
        "2026-02-05",  # 实际: Down
    ]

    print("\n快速模式 (仅回归):")
    results = batch_predict(test_dates, mode="fast")
    for date, r in results.items():
        print(f"  {date}: {r['prediction']} ({r['probability_up']*100:.1f}%) [{r['method']}]")
