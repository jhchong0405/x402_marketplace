"""
历史黄金价格数据获取模块
使用 yfinance 获取黄金期货价格
"""
import sys
import os
import yfinance as yf
import pandas as pd

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from gold_analyzer.config import GOLD_TICKER
else:
    from .config import GOLD_TICKER


def fetch_gold_prices(end_date: str = None, lookback_days: int = 365) -> pd.DataFrame:
    """
    获取截至 end_date 的历史黄金价格数据
    
    Args:
        end_date: 截止日期，格式 "YYYY-MM-DD"。如果为 None，则获取到当前最新可用数据。
        lookback_days: 向前回溯天数
    
    Returns:
        包含 Date, Open, High, Low, Close, Volume 列的 DataFrame
    """
    if end_date is None:
        end = pd.Timestamp.now()
    else:
        end = pd.Timestamp(end_date)
    start = end - pd.Timedelta(days=lookback_days)

    ticker = yf.Ticker(GOLD_TICKER)
    # end_date=None 时不传 end 参数，让 yfinance 获取到最新数据
    hist_kwargs = {"start": start.strftime("%Y-%m-%d")}
    if end_date is not None:
        hist_kwargs["end"] = end.strftime("%Y-%m-%d")
    df = ticker.history(**hist_kwargs)

    if df.empty:
        print(f"[警告] 无法获取 {start.date()} 到 {end.date()} 的黄金价格数据")
        return pd.DataFrame()

    df = df.reset_index()
    # yfinance 返回的 Date 列可能是 Datetime 带时区，统一处理
    dates = pd.to_datetime(df["Date"])
    try:
        if getattr(dates.dt, "tz", None) is not None:
            dates = dates.dt.tz_convert(None)
    except Exception:
        pass
    df["Date"] = dates
    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]]
    return df


def get_price_summary(df: pd.DataFrame) -> dict:
    """
    从历史价格 DataFrame 中提取关键统计信息
    
    Returns:
        包含价格统计的字典
    """
    if df.empty:
        return {"error": "无可用价格数据"}

    latest = df.iloc[-1]
    close_prices = df["Close"]

    # 计算技术指标
    ma_20 = close_prices.rolling(20).mean().iloc[-1] if len(close_prices) >= 20 else None
    ma_50 = close_prices.rolling(50).mean().iloc[-1] if len(close_prices) >= 50 else None
    ma_200 = close_prices.rolling(200).mean().iloc[-1] if len(close_prices) >= 200 else None

    # 计算波动率 (年化)
    daily_returns = close_prices.pct_change().dropna()
    volatility = float(daily_returns.std() * (252 ** 0.5)) if len(daily_returns) > 1 else None

    # 近期涨跌幅
    pct_1w = float((close_prices.iloc[-1] / close_prices.iloc[-5] - 1) * 100) if len(close_prices) >= 5 else None
    pct_1m = float((close_prices.iloc[-1] / close_prices.iloc[-22] - 1) * 100) if len(close_prices) >= 22 else None
    pct_3m = float((close_prices.iloc[-1] / close_prices.iloc[-66] - 1) * 100) if len(close_prices) >= 66 else None
    pct_6m = float((close_prices.iloc[-1] / close_prices.iloc[-132] - 1) * 100) if len(close_prices) >= 132 else None

    summary = {
        "latest_date": str(latest["Date"].date()),
        "latest_close": round(float(latest["Close"]), 2),
        "latest_open": round(float(latest["Open"]), 2),
        "latest_high": round(float(latest["High"]), 2),
        "latest_low": round(float(latest["Low"]), 2),
        "period_high": round(float(close_prices.max()), 2),
        "period_low": round(float(close_prices.min()), 2),
        "ma_20": round(float(ma_20), 2) if ma_20 is not None else None,
        "ma_50": round(float(ma_50), 2) if ma_50 is not None else None,
        "ma_200": round(float(ma_200), 2) if ma_200 is not None else None,
        "annualized_volatility": round(volatility, 4) if volatility is not None else None,
        "pct_change_1w": round(pct_1w, 2) if pct_1w is not None else None,
        "pct_change_1m": round(pct_1m, 2) if pct_1m is not None else None,
        "pct_change_3m": round(pct_3m, 2) if pct_3m is not None else None,
        "pct_change_6m": round(pct_6m, 2) if pct_6m is not None else None,
        "data_points": len(df),
    }
    return summary


def format_price_context(summary: dict) -> str:
    """将价格摘要格式化为供 AI 阅读的文本"""
    if "error" in summary:
        return f"价格数据不可用: {summary['error']}"

    lines = [
        f"=== 黄金价格历史数据摘要 ===",
        f"最新交易日: {summary['latest_date']}",
        f"最新收盘价: ${summary['latest_close']}",
        f"最新开盘价: ${summary['latest_open']}",
        f"当日最高: ${summary['latest_high']}  当日最低: ${summary['latest_low']}",
        f"区间最高: ${summary['period_high']}  区间最低: ${summary['period_low']}",
    ]

    if summary.get("ma_20"):
        lines.append(f"20日均线: ${summary['ma_20']}")
    if summary.get("ma_50"):
        lines.append(f"50日均线: ${summary['ma_50']}")
    if summary.get("ma_200"):
        lines.append(f"200日均线: ${summary['ma_200']}")
    if summary.get("annualized_volatility"):
        lines.append(f"年化波动率: {summary['annualized_volatility']:.2%}")

    changes = []
    if summary.get("pct_change_1w") is not None:
        changes.append(f"1周: {summary['pct_change_1w']:+.2f}%")
    if summary.get("pct_change_1m") is not None:
        changes.append(f"1月: {summary['pct_change_1m']:+.2f}%")
    if summary.get("pct_change_3m") is not None:
        changes.append(f"3月: {summary['pct_change_3m']:+.2f}%")
    if summary.get("pct_change_6m") is not None:
        changes.append(f"6月: {summary['pct_change_6m']:+.2f}%")
    if changes:
        lines.append(f"涨跌幅: {' | '.join(changes)}")

    lines.append(f"数据点数: {summary['data_points']} 个交易日")
    return "\n".join(lines)
