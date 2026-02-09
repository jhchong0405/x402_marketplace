"""
Polymarket 数据客户端：通过 Dome API 获取黄金 GC Up/Down 事件的历史数据。

API 端点:
- GET /v1/polymarket/markets?search=...&status=open|closed  → 搜索事件
- GET /v1/polymarket/candlesticks/{condition_id}?interval=1|60|1440&start_time=...&end_time=...  → K线数据
- GET /v1/polymarket/market-price/{token_id}?at_time=...  → 历史价格快照
"""
import time
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone


DOME_API_BASE = "https://api.domeapi.io/v1/polymarket"
DOME_API_KEY = "8d731a33e4d3d9d2c02466ed3f077cae0d9e4fcd"

HEADERS = {"Authorization": f"Bearer {DOME_API_KEY}"}


# ---------------------------------------------------------------------------
# 1. 搜索黄金 GC Up/Down 事件
# ---------------------------------------------------------------------------

def search_gc_markets(status: str = "closed", limit: int = 100) -> List[Dict[str, Any]]:
    """
    搜索所有 Gold (GC) Up or Down 事件。

    Args:
        status: "open" 或 "closed"
        limit: 最大返回数

    Returns:
        市场列表，每个包含 market_slug, title, condition_id, side_a, side_b, winning_side 等
    """
    all_markets = []
    # 搜索多个关键词以覆盖不同命名
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
                # 只保留 Gold (GC) Up or Down 事件
                if slug not in seen_slugs and "gc" in title and ("up or down" in title or "up-or-down" in slug):
                    seen_slugs.add(slug)
                    all_markets.append(m)
        except Exception as e:
            print(f"  [警告] 搜索 '{term}' 失败: {e}")

    # 按 start_time 排序
    all_markets.sort(key=lambda m: m.get("start_time", 0))
    return all_markets


def get_market_detail(market_slug: str) -> Optional[Dict[str, Any]]:
    """获取单个市场的详细信息"""
    url = f"{DOME_API_BASE}/markets?market_slug={market_slug}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        markets = data.get("markets", [])
        return markets[0] if markets else None
    except Exception as e:
        print(f"  [警告] 获取 {market_slug} 详情失败: {e}")
        return None


# ---------------------------------------------------------------------------
# 2. 获取分钟级 K 线数据
# ---------------------------------------------------------------------------

def fetch_candlesticks(
    condition_id: str,
    start_time: int,
    end_time: int,
    interval: int = 1,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    获取某个事件的 K 线数据。

    Args:
        condition_id: 事件的 condition_id (0x...)
        start_time: 开始时间 (Unix timestamp seconds)
        end_time: 结束时间 (Unix timestamp seconds)
        interval: K线间隔分钟数 (1=1分钟, 60=1小时, 1440=1天)
            - interval=1: 最大范围 1 周
            - interval=60: 最大范围 1 月
            - interval=1440: 最大范围 1 年

    Returns:
        {"Up": [candle_list], "Down": [candle_list]}
        每个 candle 包含 end_period_ts, price (open/high/low/close_dollars), volume 等
    """
    url = f"{DOME_API_BASE}/candlesticks/{condition_id}"
    params = {
        "interval": interval,
        "start_time": start_time,
        "end_time": end_time,
    }

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


def fetch_hourly_prices(
    condition_id: str,
    start_time: int,
    end_time: int,
) -> List[Dict[str, Any]]:
    """
    获取某个事件的小时级价格序列（interval=60）。

    Returns:
        [{"timestamp": unix_ts, "datetime": str, "price_up": float, "price_down": float, "volume": int}, ...]
    """
    candles = fetch_candlesticks(condition_id, start_time, end_time, interval=60)

    up_candles = candles.get("Up", [])
    down_candles = candles.get("Down", [])

    up_map = {}
    for c in up_candles:
        ts = c["end_period_ts"]
        up_map[ts] = {
            "price_up": float(c["price"]["close_dollars"]),
            "volume": c.get("volume", 0),
        }

    down_map = {}
    for c in down_candles:
        ts = c["end_period_ts"]
        down_map[ts] = {
            "price_down": float(c["price"]["close_dollars"]),
        }

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


def fetch_minute_prices(
    condition_id: str,
    start_time: int,
    end_time: int,
) -> List[Dict[str, Any]]:
    """
    获取某个事件 "Up" 侧的分钟级价格序列。

    由于 interval=1 最大范围 1 周，对于日度事件（通常 <2 天）完全够用。

    Returns:
        [{"timestamp": unix_ts, "price_up": float, "price_down": float, "volume": int}, ...]
    """
    candles = fetch_candlesticks(condition_id, start_time, end_time, interval=1)

    up_candles = candles.get("Up", [])
    down_candles = candles.get("Down", [])

    # 构建 timestamp → price 映射
    up_map = {}
    for c in up_candles:
        ts = c["end_period_ts"]
        up_map[ts] = {
            "price_up": float(c["price"]["close_dollars"]),
            "volume": c.get("volume", 0),
        }

    down_map = {}
    for c in down_candles:
        ts = c["end_period_ts"]
        down_map[ts] = {
            "price_down": float(c["price"]["close_dollars"]),
        }

    # 合并
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
        # 如果只有一侧有数据，推算另一侧 (price_up + price_down ≈ 1.0)
        if entry["price_up"] is not None and entry["price_down"] is None:
            entry["price_down"] = round(1.0 - entry["price_up"], 4)
        elif entry["price_down"] is not None and entry["price_up"] is None:
            entry["price_up"] = round(1.0 - entry["price_down"], 4)
        result.append(entry)

    return result


# ---------------------------------------------------------------------------
# 3. 获取所有历史 GC 事件 + 分钟级价格（用于回测）
# ---------------------------------------------------------------------------

def fetch_all_gc_history(
    include_open: bool = False,
    interval: int = 1,
    sleep_between: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    获取所有已结算的 GC Up/Down 事件及其分钟级价格数据。

    Returns:
        [{
            "market_slug": str,
            "title": str,
            "condition_id": str,
            "start_time": int,
            "end_time": int,
            "winning_side": "Up" | "Down",
            "volume_total": float,
            "minute_prices": [{"timestamp", "price_up", "price_down", "volume"}, ...],
        }, ...]
    """
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

        # 获取 winning_side
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

        # 获取分钟级价格
        prices = fetch_minute_prices(cond_id, start_t, end_t)
        # 获取小时级价格
        hourly = fetch_hourly_prices(cond_id, start_t, end_t)
        print(f"    获取到 {len(prices)} 分钟级 / {len(hourly)} 小时级价格点")

        results.append({
            "market_slug": slug,
            "title": title,
            "condition_id": cond_id,
            "start_time": start_t,
            "end_time": end_t,
            "winning_side": winning_label,
            "volume_total": m.get("volume_total", 0),
            "side_a_label": m.get("side_a", {}).get("label", ""),
            "side_b_label": m.get("side_b", {}).get("label", ""),
            "minute_prices": prices,
            "hourly_prices": hourly,
        })

        if sleep_between > 0 and i < len(all_markets) - 1:
            time.sleep(sleep_between)

    return results


# ---------------------------------------------------------------------------
# 测试入口
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  Polymarket Gold (GC) 数据获取测试")
    print("=" * 60)

    # 测试搜索
    closed = search_gc_markets(status="closed")
    print(f"\n已结算事件: {len(closed)} 个")
    for m in closed:
        ws = m.get("winning_side", {})
        wl = ws.get("label", "") if isinstance(ws, dict) else str(ws)
        print(f"  {m['market_slug']} | winner={wl} | vol={m.get('volume_total', 0):.0f}")

    open_m = search_gc_markets(status="open")
    print(f"\n进行中事件: {len(open_m)} 个")
    for m in open_m:
        print(f"  {m['market_slug']} | vol={m.get('volume_total', 0):.0f}")

    # 测试获取第一个已结算事件的分钟级数据
    if closed:
        m = closed[0]
        print(f"\n测试获取分钟级数据: {m['title']}")
        prices = fetch_minute_prices(
            m["condition_id"],
            m.get("start_time", 0),
            m.get("end_time", 0) or m.get("completed_time", 0),
        )
        print(f"  获取到 {len(prices)} 个价格点")
        for p in prices[:5]:
            print(f"  {p['datetime']} | Up={p['price_up']} Down={p['price_down']} Vol={p['volume']}")
        if len(prices) > 5:
            print(f"  ... 共 {len(prices)} 个点")
