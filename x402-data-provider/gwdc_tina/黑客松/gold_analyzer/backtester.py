"""
Polymarket 回测引擎：

核心逻辑：
1. 对每个已结算的 GC Up/Down 事件，获取分钟级价格序列
2. 每分钟检查：我的模型预测的上涨概率 vs Polymarket 当前定价（=市场隐含概率）
3. 当两者差异超过阈值时，按模型概率方向交易
4. 事件结算后计算盈亏
5. 汇总所有交易的胜率、平均盈利、最大回撤等

交易规则（二元期权）：
- 买入 "Up" token @ price_up → 如果最终 Up 赢，获得 $1/share；否则 $0
- 买入 "Down" token @ price_down → 如果最终 Down 赢，获得 $1/share；否则 $0
- 盈利 = (结算价 - 买入价) × 份数
- 每笔交易固定投入 $1（即买入 1/price 份）
"""
import sys
import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone

# 让直接运行时也能找到其他模块
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
    # 结算后填充
    outcome: Optional[str] = None      # 实际结果 "Up" 或 "Down"
    settlement_price: float = 0.0      # 结算价 (1.0 或 0.0)
    pnl: float = 0.0                   # 盈亏 = (settlement - entry) × shares
    is_win: bool = False               # 是否盈利


@dataclass
class BacktestResult:
    """回测汇总结果"""
    total_events: int = 0              # 参与的事件数
    total_trades: int = 0              # 总交易笔数
    winning_trades: int = 0            # 盈利笔数
    losing_trades: int = 0             # 亏损笔数
    win_rate: float = 0.0              # 胜率
    total_pnl: float = 0.0            # 总盈亏
    total_invested: float = 0.0       # 总投入
    roi: float = 0.0                   # 投资回报率
    avg_pnl_per_trade: float = 0.0    # 每笔平均盈亏
    avg_pnl_per_win: float = 0.0      # 每笔盈利平均盈亏
    avg_pnl_per_loss: float = 0.0     # 每笔亏损平均盈亏
    max_single_win: float = 0.0       # 单笔最大盈利
    max_single_loss: float = 0.0      # 单笔最大亏损
    max_drawdown: float = 0.0         # 最大回撤
    sharpe_like: float = 0.0          # 简化夏普比率
    trades: List[Trade] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 策略：模型概率 vs 市场定价
# ---------------------------------------------------------------------------

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

    Args:
        model_prob_up: 模型预测的上涨概率 (0~1)
        market_price_up: Polymarket "Up" token 当前价格 (0~1)
        market_price_down: Polymarket "Down" token 当前价格 (0~1)
        edge_threshold: 最小优势阈值，只有差异超过此值才交易
        bet_amount: 每笔投注金额
        only_model_direction: 如果为 True，只允许交易方向与模型预测方向一致
            （防止模型说 Up 但因为 edge 计算反而买了 Down 的矛盾交易）

    Returns:
        交易决策 dict 或 None（不交易）
    """
    model_prob_down = 1.0 - model_prob_up
    model_direction = "Up" if model_prob_up >= 0.5 else "Down"

    # 计算 edge
    edge_up = model_prob_up - market_price_up      # 正 = 模型认为 Up 被低估
    edge_down = model_prob_down - market_price_down  # 正 = 模型认为 Down 被低估

    # 如果 only_model_direction，只考虑模型预测方向的 edge
    if only_model_direction:
        if model_direction == "Up" and edge_up > edge_threshold:
            entry_price = market_price_up
            if entry_price <= 0 or entry_price >= 1:
                return None
            return {
                "side": "Up",
                "entry_price": entry_price,
                "edge": edge_up,
                "shares": bet_amount / entry_price,
                "bet_amount": bet_amount,
            }
        elif model_direction == "Down" and edge_down > edge_threshold:
            entry_price = market_price_down
            if entry_price <= 0 or entry_price >= 1:
                return None
            return {
                "side": "Down",
                "entry_price": entry_price,
                "edge": edge_down,
                "shares": bet_amount / entry_price,
                "bet_amount": bet_amount,
            }
        return None  # 模型方向没有足够 edge，不交易

    # 原始逻辑：选择 edge 更大的方向
    if edge_up > edge_threshold and edge_up >= edge_down:
        # 买入 Up
        entry_price = market_price_up
        if entry_price <= 0 or entry_price >= 1:
            return None
        return {
            "side": "Up",
            "entry_price": entry_price,
            "edge": edge_up,
            "shares": bet_amount / entry_price,
            "bet_amount": bet_amount,
        }
    elif edge_down > edge_threshold and edge_down > edge_up:
        # 买入 Down
        entry_price = market_price_down
        if entry_price <= 0 or entry_price >= 1:
            return None
        return {
            "side": "Down",
            "entry_price": entry_price,
            "edge": edge_down,
            "shares": bet_amount / entry_price,
            "bet_amount": bet_amount,
        }

    return None  # 没有足够的 edge，不交易


# ---------------------------------------------------------------------------
# 回测主逻辑
# ---------------------------------------------------------------------------

def run_backtest(
    events_data: List[Dict[str, Any]],
    model_prob_up: float = 0.60,
    edge_threshold: float = 0.05,
    bet_amount: float = 1.0,
    max_trades_per_event: int = 1,
    trade_interval_minutes: int = 1,
) -> BacktestResult:
    """
    运行回测。

    Args:
        events_data: 从 polymarket_client.fetch_all_gc_history() 获取的事件数据
        model_prob_up: 模型预测的上涨概率（固定值，或后续可改为动态）
        edge_threshold: 最小 edge 阈值
        bet_amount: 每笔投注金额
        max_trades_per_event: 每个事件最多交易几笔
        trade_interval_minutes: 每隔几分钟检查一次（1=每分钟）

    Returns:
        BacktestResult
    """
    result = BacktestResult()
    all_trades: List[Trade] = []

    for event in events_data:
        slug = event.get("market_slug", "")
        title = event.get("title", "")
        winning_side = event.get("winning_side")
        prices = event.get("minute_prices", [])

        if not winning_side or not prices:
            continue

        result.total_events += 1
        trades_this_event = 0

        for i, p in enumerate(prices):
            if trades_this_event >= max_trades_per_event:
                break

            # 每 trade_interval_minutes 分钟检查一次
            if i % trade_interval_minutes != 0:
                continue

            price_up = p.get("price_up")
            price_down = p.get("price_down")

            if price_up is None or price_down is None:
                continue
            if price_up <= 0.01 or price_up >= 0.99:
                continue  # 价格太极端，跳过
            if price_down <= 0.01 or price_down >= 0.99:
                continue

            decision = decide_trade(
                model_prob_up=model_prob_up,
                market_price_up=price_up,
                market_price_down=price_down,
                edge_threshold=edge_threshold,
                bet_amount=bet_amount,
            )

            if decision is None:
                continue

            # 创建交易
            trade = Trade(
                event_slug=slug,
                event_title=title,
                timestamp=p["timestamp"],
                side=decision["side"],
                entry_price=decision["entry_price"],
                model_prob_up=model_prob_up,
                market_price_up=price_up,
                edge=decision["edge"],
                bet_amount=decision["bet_amount"],
                shares=decision["shares"],
            )

            # 结算
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

    # 汇总统计
    result.trades = all_trades
    result.total_trades = len(all_trades)

    if result.total_trades == 0:
        return result

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

    # 权益曲线 & 最大回撤
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

    # 简化夏普比率 (mean / std)
    import numpy as np
    if len(pnls) > 1:
        result.sharpe_like = float(np.mean(pnls) / np.std(pnls)) if np.std(pnls) > 0 else 0
    else:
        result.sharpe_like = 0

    return result


# ---------------------------------------------------------------------------
# 带模型预测的回测（动态概率，每小时决策）
# ---------------------------------------------------------------------------

def run_backtest_with_model(
    events_data: List[Dict[str, Any]],
    model_predictions: Dict[str, Dict[str, Any]],
    edge_threshold: float = 0.05,
    bet_amount: float = 1.0,
    max_trades_per_event: int = 999,
    only_model_direction: bool = False,
    min_confidence: float = 0.0,
) -> BacktestResult:
    """
    每小时检查市场价格，与模型概率对比，有 edge 就买入 $1。

    站在前一天视角：模型用 target_date 前一天的数据预测，
    然后在事件存续期间每小时检查 Polymarket 定价，
    只要市场错误定价（edge > threshold）就买入 $1。

    Args:
        events_data: 事件数据列表（需包含 hourly_prices）
        model_predictions: {target_date_str: {"probability_up": float, ...}, ...}
        edge_threshold: 最小 edge 阈值
        bet_amount: 每次买入金额
        max_trades_per_event: 每个事件最多交易几笔
        only_model_direction: 只允许交易方向与模型预测方向一致
        min_confidence: 最低置信度阈值，只有 max(P(Up), P(Down)) >= 此值才交易

    Returns:
        BacktestResult
    """
    result = BacktestResult()
    all_trades: List[Trade] = []

    for event in events_data:
        slug = event.get("market_slug", "")
        title = event.get("title", "")
        winning_side = event.get("winning_side")
        target_date = event.get("target_date", "")

        # 优先使用小时级价格，回退到分钟级
        prices = event.get("hourly_prices") or event.get("minute_prices", [])

        if not winning_side or not prices or not target_date:
            continue

        # 查找该日期的模型预测
        pred = model_predictions.get(target_date)
        if pred is None or pred.get("method") == "fallback":
            continue

        model_prob_up = pred.get("probability_up", 0.5)

        # 置信度过滤：只在模型足够确定时交易
        confidence = max(model_prob_up, 1.0 - model_prob_up)
        if confidence < min_confidence:
            continue
        result.total_events += 1
        trades_this_event = 0

        # 每个小时级价格点都检查一次
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
                model_prob_up=model_prob_up,
                market_price_up=price_up,
                market_price_down=price_down,
                edge_threshold=edge_threshold,
                bet_amount=bet_amount,
                only_model_direction=only_model_direction,
            )

            if decision is None:
                continue

            trade = Trade(
                event_slug=slug,
                event_title=title,
                timestamp=p["timestamp"],
                side=decision["side"],
                entry_price=decision["entry_price"],
                model_prob_up=model_prob_up,
                market_price_up=price_up,
                edge=decision["edge"],
                bet_amount=decision["bet_amount"],
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

    # 汇总统计
    _compute_stats(result, all_trades)
    return result


def _compute_stats(result: BacktestResult, all_trades: List[Trade]):
    """汇总交易统计（供多个回测函数复用）"""
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


# ---------------------------------------------------------------------------
# 打印回测报告
# ---------------------------------------------------------------------------

def print_backtest_report(result: BacktestResult, model_prob_up: float, edge_threshold: float):
    """打印回测结果"""
    print("\n" + "=" * 80)
    print("  ★ Polymarket 黄金 GC Up/Down 回测报告 ★")
    print("=" * 80)

    print(f"\n策略参数:")
    print(f"  模型预测上涨概率: {model_prob_up*100:.1f}%")
    print(f"  最小 edge 阈值:   {edge_threshold*100:.1f}%")
    print(f"  每笔投注金额:     $1.00")

    print(f"\n交易统计:")
    print(f"  参与事件数:   {result.total_events}")
    print(f"  总交易笔数:   {result.total_trades}")
    print(f"  盈利笔数:     {result.winning_trades}")
    print(f"  亏损笔数:     {result.losing_trades}")
    print(f"  胜率:         {result.win_rate*100:.1f}%")

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
    print(f"\n按事件明细:")
    print(f"  {'事件':<45} {'方向':>4} {'买入价':>6} {'结果':>4} {'盈亏':>8}")
    print(f"  {'-'*45} {'----':>4} {'------':>6} {'----':>4} {'--------':>8}")

    event_pnls = {}
    for t in result.trades:
        short_title = t.event_title[:42] + "..." if len(t.event_title) > 45 else t.event_title
        win_mark = "✓" if t.is_win else "✗"
        print(f"  {short_title:<45} {t.side:>4} {t.entry_price:>6.3f} {win_mark:>4} ${t.pnl:>+7.4f}")

        if t.event_slug not in event_pnls:
            event_pnls[t.event_slug] = 0
        event_pnls[t.event_slug] += t.pnl

    # 权益曲线（简化文本版）
    if result.equity_curve:
        print(f"\n权益曲线 (累计盈亏):")
        n = len(result.equity_curve)
        step = max(1, n // 20)
        for i in range(0, n, step):
            eq = result.equity_curve[i]
            bar_len = int(abs(eq) * 20)
            if eq >= 0:
                bar = "█" * min(bar_len, 40)
                print(f"  [{i+1:>4}] ${eq:>+8.4f} |{bar}")
            else:
                bar = "░" * min(bar_len, 40)
                print(f"  [{i+1:>4}] ${eq:>+8.4f} |{bar}")
        # 最后一个
        if (n - 1) % step != 0:
            eq = result.equity_curve[-1]
            bar_len = int(abs(eq) * 20)
            bar = "█" * min(bar_len, 40) if eq >= 0 else "░" * min(bar_len, 40)
            print(f"  [{n:>4}] ${eq:>+8.4f} |{bar}")

    print("\n" + "=" * 80)


# ---------------------------------------------------------------------------
# 多参数扫描
# ---------------------------------------------------------------------------

def sweep_parameters(
    events_data: List[Dict[str, Any]],
    prob_range: List[float] = None,
    edge_range: List[float] = None,
) -> List[Dict[str, Any]]:
    """
    扫描不同的 model_prob_up 和 edge_threshold 参数组合。

    Returns:
        [{"prob": float, "edge": float, "trades": int, "win_rate": float, "roi": float, "pnl": float}, ...]
    """
    if prob_range is None:
        prob_range = [0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75]
    if edge_range is None:
        edge_range = [0.03, 0.05, 0.08, 0.10, 0.15, 0.20]

    results = []
    for prob in prob_range:
        for edge in edge_range:
            r = run_backtest(
                events_data=events_data,
                model_prob_up=prob,
                edge_threshold=edge,
                max_trades_per_event=1,
            )
            results.append({
                "prob": prob,
                "edge": edge,
                "events": r.total_events,
                "trades": r.total_trades,
                "wins": r.winning_trades,
                "win_rate": r.win_rate,
                "total_pnl": r.total_pnl,
                "roi": r.roi,
                "max_dd": r.max_drawdown,
                "sharpe": r.sharpe_like,
            })

    return results


def print_sweep_report(sweep_results: List[Dict[str, Any]]):
    """打印参数扫描结果"""
    print("\n" + "=" * 100)
    print("  ★ 参数扫描结果 ★")
    print("=" * 100)
    print(f"  {'Prob':>6} {'Edge':>6} {'Trades':>7} {'Wins':>5} {'WinRate':>8} {'PnL':>10} {'ROI':>8} {'MaxDD':>8} {'Sharpe':>8}")
    print(f"  {'------':>6} {'------':>6} {'-------':>7} {'-----':>5} {'--------':>8} {'----------':>10} {'--------':>8} {'--------':>8} {'--------':>8}")

    for r in sweep_results:
        if r["trades"] == 0:
            continue
        print(f"  {r['prob']:>6.2f} {r['edge']:>6.2f} {r['trades']:>7} {r['wins']:>5} "
              f"{r['win_rate']*100:>7.1f}% ${r['total_pnl']:>+9.2f} {r['roi']*100:>+7.1f}% "
              f"${r['max_dd']:>7.2f} {r['sharpe']:>8.3f}")

    # 找最佳参数
    valid = [r for r in sweep_results if r["trades"] >= 5]
    if valid:
        best_roi = max(valid, key=lambda x: x["roi"])
        best_sharpe = max(valid, key=lambda x: x["sharpe"])
        print(f"\n  最佳 ROI:    prob={best_roi['prob']:.2f} edge={best_roi['edge']:.2f} → "
              f"ROI={best_roi['roi']*100:+.1f}% (trades={best_roi['trades']}, winrate={best_roi['win_rate']*100:.1f}%)")
        print(f"  最佳 Sharpe: prob={best_sharpe['prob']:.2f} edge={best_sharpe['edge']:.2f} → "
              f"Sharpe={best_sharpe['sharpe']:.3f} (trades={best_sharpe['trades']}, winrate={best_sharpe['win_rate']*100:.1f}%)")

    print("=" * 100)
