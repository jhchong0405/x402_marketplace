#!/usr/bin/env python3
"""
回测入口：获取 Polymarket 黄金 GC Up/Down 历史数据，运行回测并输出结果。

用法:
    python run_backtest.py                        # 固定概率回测 (默认 prob=0.60)
    python run_backtest.py --prob 0.65 --edge 0.08
    python run_backtest.py --sweep                # 参数扫描模式
    python run_backtest.py --model                # 使用 AI 回归模型动态预测
    python run_backtest.py --model --edge 0.10    # 模型模式 + 自定义 edge
"""
import sys
import os
import re
import argparse
import json
from datetime import datetime, timezone

# 让直接运行时也能找到其他模块
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from gold_analyzer.polymarket_client import fetch_all_gc_history
from gold_analyzer.backtester import (
    run_backtest,
    run_backtest_with_model,
    print_backtest_report,
    sweep_parameters,
    print_sweep_report,
)


CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gc_events_cache.json")
PREDICTIONS_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_predictions_cache.json")

# 月份名 → 数字
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def parse_target_date_from_slug(slug: str) -> str:
    """
    从事件 slug 中提取目标日期。

    例如:
        "gc-up-or-down-on-january-8-2026" → "2026-01-08"
        "gc-f-up-or-down-on-october-27-2025" → "2025-10-27"
    """
    # 匹配 "on-{month}-{day}-{year}" 模式
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

    # 保存缓存
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
    """
    对所有事件运行模型预测，返回 {date: prediction} 映射。
    支持缓存以避免重复调用。
    """
    from gold_analyzer.model_predictor import predict_for_date

    # 尝试加载缓存
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

        # 保存缓存
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

    # 模型方向预测准确率（按事件去重）
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
    parser.add_argument("--model-mode", choices=["fast", "ai_select", "full"], default="fast",
                        help="模型模式: fast=固定10指标, ai_select=AI选指标+回归, full=AI选指标+回归+AI融合 (默认 fast)")
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

    # 获取 Polymarket 数据
    events_data = load_or_fetch_data(force_refresh=args.refresh)

    # 为每个事件解析 target_date
    events_data = enrich_events_with_dates(events_data)

    # 过滤有效事件（有结算结果且有价格数据）
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

    # 显示日期解析结果
    dated_events = [e for e in valid_events if e.get("target_date")]
    print(f"  成功解析日期: {len(dated_events)}/{len(valid_events)} 个事件")

    if args.model:
        # ===== AI 模型驱动回测 =====
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
            max_trades_per_event=999,  # 每小时都可以交易
            only_model_direction=args.strict,
            min_confidence=args.min_conf,
        )
        print_model_backtest_report(result, args.edge, predictions)

    elif args.sweep:
        # ===== 参数扫描模式 =====
        print("\n开始参数扫描...")
        sweep_results = sweep_parameters(
            events_data=valid_events,
            prob_range=[0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80],
            edge_range=[0.02, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25],
        )
        print_sweep_report(sweep_results)

    else:
        # ===== 固定概率回测 =====
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
