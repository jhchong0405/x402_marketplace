import json
import sys
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from gold_analyzer.factor_collector import collect_factors
    from gold_analyzer.deep_analyzer import deep_analyze
    from gold_analyzer.price_fetcher import fetch_gold_prices, format_price_context, get_price_summary
    from gold_analyzer.reporting import build_report, save_report_json
    from gold_analyzer.scoring import compute_score, get_level_weight_mapping_from_ai
    from gold_analyzer.factor_data import ai_select_proxies, fetch_proxy_data, build_feature_matrix
    from gold_analyzer.regression import train_and_predict, compute_combined_probability
    from gold_analyzer.news_fetcher import fetch_all_gold_news, format_news_context
else:
    from .factor_collector import collect_factors
    from .deep_analyzer import deep_analyze
    from .price_fetcher import fetch_gold_prices, format_price_context, get_price_summary
    from .reporting import build_report, save_report_json
    from .scoring import compute_score, get_level_weight_mapping_from_ai
    from .factor_data import ai_select_proxies, fetch_proxy_data, build_feature_matrix
    from .regression import train_and_predict, compute_combined_probability
    from .news_fetcher import fetch_all_gold_news, format_news_context


def _normalize_factor(f: Any) -> Dict[str, Any]:
    """兼容不同 AI 返回的字段名，统一成标准格式"""
    if not isinstance(f, dict):
        return {"name": str(f), "direction": "unknown", "impact_level": "medium",
                "weight": 5, "impact_score": 5, "reasoning": "", "category": "", "description": "",
                "source_type": "unknown", "source_ref": ""}
    # 兼容 Qwen 可能用的各种字段名（包括拼写错误如 direcction）
    name = f.get("name") or f.get("factor") or f.get("factor_name") or f.get("因素") or ""
    direction = (f.get("direction") or f.get("direcction") or f.get("impact_direction")
                 or f.get("effect") or f.get("方向") or "")
    impact_level = (f.get("impact_level") or f.get("influence") or f.get("level")
                    or f.get("importance") or f.get("影响程度") or "")
    weight = f.get("weight") or f.get("value") or f.get("importance_weight") or f.get("权重") or 5
    impact_score = f.get("impact_score") or f.get("score") or f.get("value") or f.get("影响分数") or 5
    reasoning = (f.get("reasoning") or f.get("reason") or f.get("explanation")
                 or f.get("analysis") or f.get("原因") or "")
    category = f.get("category") or f.get("type") or f.get("分类") or ""
    description = f.get("description") or f.get("detail") or f.get("details") or f.get("描述") or ""
    source_type = f.get("source_type") or f.get("来源类型") or "unknown"
    source_ref = f.get("source_ref") or f.get("来源引用") or ""
    return {
        "name": name if name else "未知因素",
        "direction": str(direction).strip().lower() if direction else "unknown",
        "impact_level": str(impact_level).strip().lower() if impact_level else "medium",
        "weight": weight, "impact_score": impact_score,
        "reasoning": reasoning, "category": category, "description": description,
        "source_type": str(source_type).strip().lower(),
        "source_ref": str(source_ref).strip(),
    }


def _extract_factors(factors_result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """从 AI 返回的结果中提取因素列表，兼容多种结构"""
    raw = factors_result.get("factors") or factors_result.get("key_factors") or factors_result.get("data") or []
    if not isinstance(raw, list):
        raw = []

    # 过滤掉空字典
    raw = [f for f in raw if isinstance(f, dict) and len(f) > 0]

    # 如果 factors 数组为空，但顶层有 name 字段，说明 Qwen 把因素放在了顶层
    if len(raw) == 0 and factors_result.get("name"):
        # 把顶层当作一个因素
        top_factor = {k: v for k, v in factors_result.items()
                      if k not in ("analysis_date", "factors", "total_factors_count",
                                   "key_factors", "data")}
        raw = [top_factor]

    return [_normalize_factor(f) for f in raw]


def print_analysis(current_time: str, target_date: str, price_summary: dict,
                   factors: List[Dict[str, Any]], deep_result: dict, score_result: dict,
                   regression_result: dict = None, combined_result: dict = None,
                   proxy_mapping: dict = None) -> None:
    """打印完整的分析报告到屏幕"""
    print("\n" + "=" * 80)
    print("  AI 黄金价格分析报告")
    print("=" * 80)
    print(f"分析时间: {current_time}")
    print(f"预测目标日期: {target_date}")

    # 价格摘要
    if "error" not in price_summary:
        print(f"\n最新收盘价: ${price_summary.get('latest_close')}  ({price_summary.get('latest_date')})")
        if price_summary.get('ma_20'):
            print(f"均线: MA20=${price_summary['ma_20']}  MA50=${price_summary.get('ma_50')}  MA200=${price_summary.get('ma_200')}")
        changes = []
        if price_summary.get('pct_change_1w') is not None:
            changes.append(f"1周:{price_summary['pct_change_1w']:+.2f}%")
        if price_summary.get('pct_change_1m') is not None:
            changes.append(f"1月:{price_summary['pct_change_1m']:+.2f}%")
        if price_summary.get('pct_change_3m') is not None:
            changes.append(f"3月:{price_summary['pct_change_3m']:+.2f}%")
        if changes:
            print(f"涨跌幅: {' | '.join(changes)}")

    # 关键因素
    print("\n" + "-" * 80)
    print("  关键影响因素（AI 定性分析）")
    print("-" * 80)
    for i, f in enumerate(factors, 1):
        direction_cn = "看涨 ↑" if f['direction'] == 'positive' else "看跌 ↓" if f['direction'] == 'negative' else "未知"
        level_cn = {"high": "高", "medium": "中", "low": "低"}.get(f['impact_level'], f['impact_level'])
        # 来源标签
        src_type = f.get('source_type', 'unknown')
        src_labels = {"news": "📰新闻", "price_data": "📊价格数据", "general_knowledge": "📚常识"}
        src_label = src_labels.get(src_type, f"❓{src_type}")
        src_ref = f.get('source_ref', '')

        print(f"\n  [{i}] {f['name']}")
        print(f"      方向: {direction_cn}  |  影响程度: {level_cn}  |  权重: {f['weight']}")
        print(f"      来源: {src_label}  {src_ref}")
        if f.get('category'):
            print(f"      分类: {f['category']}")
        if f.get('description'):
            print(f"      现状: {f['description']}")
        if f.get('reasoning'):
            print(f"      原因: {f['reasoning']}")

    # 因素量化映射
    if proxy_mapping:
        selected = proxy_mapping.get("selected_proxies", [])
        if selected:
            print("\n" + "-" * 80)
            print("  因素 → 量化代理指标映射")
            print("-" * 80)
            for sp in selected:
                dir_cn = "↑利多" if sp.get("direction_on_gold") == "positive" else "↓利空"
                print(f"  {sp.get('mapped_factor', '')} → {sp.get('proxy_id', '')} (权重:{sp.get('ai_weight', '')}, {dir_cn})")

    # ========== 核心输出：涨跌概率 ==========
    if combined_result and "error" not in combined_result:
        print("\n" + "=" * 80)
        print("  ★ 最终预测结果 ★")
        print("=" * 80)
        prob_up = combined_result.get("final_probability_up", 0.5)
        prob_down = combined_result.get("final_probability_down", 0.5)
        prediction = combined_result.get("final_prediction", "")

        # 大号显示
        bar_len = 40
        up_bars = int(prob_up * bar_len)
        down_bars = bar_len - up_bars
        print(f"\n  {target_date} 黄金价格预测:")
        print(f"  上涨概率: {prob_up*100:.1f}%  {'█' * up_bars}{'░' * down_bars}")
        print(f"  下跌概率: {prob_down*100:.1f}%  {'█' * down_bars}{'░' * up_bars}")
        print(f"\n  预测方向: {'📈 上涨' if prediction == '上涨' else '📉 下跌'}")

        # 分项来源
        comp = combined_result.get("components", {})
        print(f"\n  概率构成:")
        print(f"    回归模型 (权重{comp.get('regression_weight', 0)*100:.0f}%): 上涨概率 {comp.get('regression_prob_up', 0)*100:.1f}%")
        print(f"    AI定性   (权重{comp.get('ai_qualitative_weight', 0)*100:.0f}%): 上涨概率 {comp.get('ai_qualitative_prob_up', 0)*100:.1f}%")

    elif regression_result and "error" not in regression_result:
        # 只有回归结果，没有合并结果
        print("\n" + "=" * 80)
        print("  ★ 回归模型预测结果 ★")
        print("=" * 80)
        prob_up = regression_result.get("probability_up", 0.5)
        prob_down = regression_result.get("probability_down", 0.5)
        bar_len = 40
        up_bars = int(prob_up * bar_len)
        down_bars = bar_len - up_bars
        print(f"\n  {target_date} 黄金价格预测:")
        print(f"  上涨概率: {prob_up*100:.1f}%  {'█' * up_bars}{'░' * down_bars}")
        print(f"  下跌概率: {prob_down*100:.1f}%  {'█' * down_bars}{'░' * up_bars}")

    # 回归模型详情
    if regression_result and "error" not in regression_result:
        print("\n" + "-" * 80)
        print("  回归模型详情")
        print("-" * 80)
        mi = regression_result.get("model_info", {})
        print(f"  算法: {mi.get('algorithm', '')}")
        print(f"  训练样本: {mi.get('training_samples', '')} 个交易日")
        print(f"  特征数: {mi.get('features_count', '')}")
        if mi.get("cv_accuracy_mean"):
            print(f"  交叉验证准确率: {mi['cv_accuracy_mean']*100:.1f}% ± {mi.get('cv_accuracy_std', 0)*100:.1f}%")
        print(f"  历史上涨比例: {mi.get('train_up_ratio', 0)*100:.1f}%")

        top = regression_result.get("top_features", [])[:5]
        if top:
            print(f"\n  最重要的特征:")
            for tf in top:
                coef = tf.get("coefficient", 0)
                direction = "利多" if coef > 0 else "利空"
                print(f"    {tf['feature']}: {direction} (系数={coef:.4f})")

    # AI 预测价格
    forecast = deep_result.get("forecast", {})
    fp = forecast.get("forecast_price") if forecast else None
    fp = fp or deep_result.get("forecast_price")
    f_low = (forecast.get("forecast_range", {}) or {}).get("low") if forecast else None
    f_low = f_low or deep_result.get("forecast_low")
    f_high = (forecast.get("forecast_range", {}) or {}).get("high") if forecast else None
    f_high = f_high or deep_result.get("forecast_high")
    f_reasoning = forecast.get("reasoning") if forecast else None
    f_reasoning = f_reasoning or deep_result.get("forecast_reasoning")

    if fp:
        print("\n" + "-" * 80)
        print("  AI 价格预测（参考）")
        print("-" * 80)
        print(f"  {target_date} 预测价格: ${fp}")
        if f_low and f_high:
            print(f"  预测区间: ${f_low} ~ ${f_high}")
        if f_reasoning:
            print(f"  预测依据: {f_reasoning}")

    # 主导因素
    dom = deep_result.get("dominant_factors", [])
    if dom:
        print(f"\n  主导因素: {', '.join(dom)}")

    # 风险提示
    risks = deep_result.get("risk_notes", [])
    if isinstance(risks, list) and risks:
        print("\n  风险提示:")
        for r in risks:
            print(f"    - {r}")

    print("\n" + "=" * 80)


def run(target_date: str, output_path: str) -> Dict[str, Any]:
    # 获取真实当前时间（精确到秒）
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    current_date = now.strftime("%Y-%m-%d")

    print(f"\n当前真实时间: {current_time}")
    print(f"预测目标日期: {target_date}")

    # 计算预测天数
    try:
        d_target = datetime.strptime(target_date, "%Y-%m-%d")
        forecast_horizon = max(1, (d_target - now.replace(hour=0, minute=0, second=0, microsecond=0)).days)
    except Exception:
        forecast_horizon = 1

    # ===== Step 1: 历史价格（获取到最新可用数据） =====
    print("\n[1/8] 正在获取历史黄金价格数据（截至当前最新）...")
    df = fetch_gold_prices(end_date=None, lookback_days=365)
    price_summary = get_price_summary(df)
    price_context = format_price_context(price_summary)

    # ===== Step 2: 抓取实时新闻 =====
    print("[2/8] 正在抓取最新黄金相关新闻...")
    news_list = fetch_all_gold_news(max_total=30, period="3d")
    news_context = format_news_context(news_list, max_items=20)
    print(f"  获取到 {len(news_list)} 条实时新闻")

    # ===== Step 3: AI 因素收集 =====
    print("[3/8] 正在让 AI 基于实时新闻收集影响金价的关键因素...")
    factors_result = collect_factors(
        current_date=current_time, target_date=target_date,
        price_context=price_context, news_context=news_context,
    )
    factors = _extract_factors(factors_result)
    factors_result["factors"] = factors

    # ===== Step 4: AI 深度分析 =====
    print("[4/8] 正在让 AI 做深度分析与价格预测...")
    deep_result = deep_analyze(
        current_date=current_time,
        target_date=target_date,
        price_context=price_context,
        factors_result=factors_result,
        news_context=news_context,
    )

    # ===== Step 5: AI 选择量化代理指标 =====
    print("[5/8] 正在让 AI 将因素映射到量化代理指标...")
    proxy_mapping = ai_select_proxies(
        current_date=current_time,
        target_date=target_date,
        factors=factors,
        price_context=price_context,
    )
    selected_proxies = proxy_mapping.get("selected_proxies", [])
    proxy_ids = [sp["proxy_id"] for sp in selected_proxies if sp.get("proxy_id")]
    print(f"  已选择 {len(proxy_ids)} 个量化代理指标: {', '.join(proxy_ids)}")

    # ===== Step 6: 爬取代理指标日度数据（截至当前最新） =====
    print("[6/8] 正在爬取代理指标的日度数据（约1年，截至当前最新）...")
    proxy_data = fetch_proxy_data(proxy_ids=proxy_ids, end_date=None, lookback_days=365)
    print(f"  获取到 {len(proxy_data)} 个交易日 × {len(proxy_data.columns)} 个指标的数据")

    # ===== Step 7: 时间序列回归 =====
    regression_result = {}
    combined_result = {}
    if not proxy_data.empty and not df.empty:
        print(f"[7/8] 正在构建特征矩阵并训练 Logistic 回归模型（预测{forecast_horizon}天后涨跌）...")
        feature_matrix = build_feature_matrix(
            proxy_data=proxy_data,
            gold_prices=df,
            selected_proxies=selected_proxies,
            forecast_horizon=forecast_horizon,
        )
        print(f"  特征矩阵: {feature_matrix.shape[0]} 样本 × {feature_matrix.shape[1] - 2} 特征")

        regression_result = train_and_predict(
            feature_matrix=feature_matrix,
            selected_proxies=selected_proxies,
            forecast_horizon=forecast_horizon,
        )
        if "error" not in regression_result:
            print(f"  回归模型上涨概率: {regression_result['probability_up']*100:.1f}%")
        else:
            print(f"  [警告] 回归模型失败: {regression_result.get('error')}")
    else:
        print("[7/8] 数据不足，跳过回归分析")

    # ===== Step 8: 融合 AI 定性 + 回归定量 =====
    print("[8/8] 正在融合 AI 定性判断与回归模型结果...")
    ai_bias = deep_result.get("short_term_bias", "neutral")
    ai_conf = deep_result.get("short_term_confidence", "medium")
    if forecast_horizon > 20:
        ai_bias = deep_result.get("mid_term_bias", ai_bias)
        ai_conf = deep_result.get("mid_term_confidence", ai_conf)

    if regression_result and "error" not in regression_result:
        combined_result = compute_combined_probability(
            regression_result=regression_result,
            ai_qualitative_bias=ai_bias,
            ai_confidence=ai_conf,
        )
    else:
        # 没有回归结果，只用 AI 定性
        bias_map = {"bullish": 0.65, "bearish": 0.35, "neutral": 0.50}
        prob_up = bias_map.get(ai_bias, 0.5)
        combined_result = {
            "final_probability_up": prob_up,
            "final_probability_down": 1.0 - prob_up,
            "final_prediction": "上涨" if prob_up > 0.5 else "下跌",
            "components": {"note": "仅基于AI定性判断，无回归数据"},
        }

    # ===== 量化评分（保留原有逻辑） =====
    mapping_result = get_level_weight_mapping_from_ai(
        current_date=current_time, target_date=target_date,
        factors=factors, price_context=price_context,
    )
    level_weight_mapping = mapping_result.get("level_weight_mapping")
    score_result = compute_score(factors=factors, level_weight_mapping=level_weight_mapping)
    score_result["ai_level_weight_mapping"] = mapping_result

    # ===== 打印报告 =====
    print_analysis(
        current_time, target_date, price_summary, factors, deep_result, score_result,
        regression_result=regression_result,
        combined_result=combined_result,
        proxy_mapping=proxy_mapping,
    )

    # ===== 保存 JSON =====
    report = build_report(
        current_date=current_time,
        target_date=target_date,
        price_summary=price_summary,
        factors_result=factors_result,
        deep_result=deep_result,
        score_result=score_result,
    )
    report["step2_news"] = {"news_count": len(news_list), "news_items": news_list}
    report["step4_proxy_mapping"] = proxy_mapping
    report["step5_regression"] = regression_result
    report["step6_combined_probability"] = combined_result
    save_report_json(report, output_path)
    print(f"\n完整报告已保存到: {output_path}")
    return report


if __name__ == "__main__":
    print("=" * 40)
    print("  AI 黄金分析师")
    print("=" * 40)
    now = datetime.now()
    print(f"当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    target_date = input("请输入预测目标日期 (YYYY-MM-DD): ").strip()
    out = input("输出文件路径 [直接回车默认 report.json]: ").strip() or "report.json"
    if not os.path.isabs(out):
        out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), out)
    print(f"\n开始分析: {now.strftime('%Y-%m-%d %H:%M:%S')} → {target_date}\n")
    run(target_date=target_date, output_path=out)
