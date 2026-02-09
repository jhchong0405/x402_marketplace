"""
Step 4: 报告输出模块
将因素、深度分析、量化评分、价格数据整理为完整报告
"""
import json
import sys
import os
from datetime import datetime
from typing import Any, Dict

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)


def build_report(
    current_date: str,
    target_date: str,
    price_summary: Dict[str, Any],
    factors_result: Dict[str, Any],
    deep_result: Dict[str, Any],
    score_result: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "meta": {
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "current_date": current_date,
            "target_date": target_date,
        },
        "price_summary": price_summary,
        "step1_factors": factors_result,
        "step2_deep_analysis": deep_result,
        "step3_quant_score": score_result,
    }


def save_report_json(report: Dict[str, Any], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)


def print_report(report: Dict[str, Any]) -> None:
    meta = report.get("meta", {})
    price = report.get("price_summary", {})
    score = report.get("step3_quant_score", {})
    deep = report.get("step2_deep_analysis", {})

    print("=" * 80)
    print("AI 黄金分析报告")
    print("=" * 80)
    print(f"生成时间(UTC): {meta.get('generated_at')}")
    print(f"分析时间: {meta.get('current_date')}  预测目标日期: {meta.get('target_date')}")
    print("-" * 80)

    if "error" in price:
        print(f"价格数据: {price['error']}")
    else:
        print(f"最新交易日: {price.get('latest_date')}  最新收盘: ${price.get('latest_close')}")
        if price.get("ma_20") is not None:
            print(f"均线: MA20={price.get('ma_20')}  MA50={price.get('ma_50')}  MA200={price.get('ma_200')}")
        if price.get("annualized_volatility") is not None:
            print(f"年化波动率: {price.get('annualized_volatility')}")

    print("-" * 80)
    print(f"量化评分: {score.get('score')}  结论: {score.get('view')}  阈值: {score.get('thresholds')}")

    forecast = deep.get("forecast", {})
    if forecast:
        print("-" * 80)
        print(f"AI 目标日预测: {forecast.get('target_date')}  预测价: {forecast.get('forecast_price')}")
        rng = forecast.get("forecast_range") or {}
        if rng:
            print(f"预测区间: {rng.get('low')} - {rng.get('high')}")

    print("-" * 80)
    dom = deep.get("dominant_factors", [])
    if dom:
        print("主导因素:")
        for x in dom:
            print(f"- {x}")

    print("-" * 80)
    factors = (report.get("step1_factors", {}) or {}).get("factors", [])
    if factors:
        print("关键因素列表:")
        for f in factors:
            print(f"- {f.get('name')} | {f.get('direction')} | {f.get('impact_level')} | weight={f.get('weight')}")

    print("=" * 80)
