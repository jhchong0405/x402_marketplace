"""
新闻获取模块：直接解析 Google News RSS Feed 抓取最新黄金相关新闻，
为 AI 分析提供真实的实时新闻上下文。

使用 feedparser 解析 Google News RSS（无需 API Key）。
"""
import sys
import os
import re
import urllib.parse
from typing import List, Dict, Any

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)

import feedparser
import requests


# Google News RSS 搜索 URL 模板
GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search?q={query}&hl={hl}&gl={gl}&ceid={ceid}"

# 搜索关键词列表（中英文混合，覆盖黄金相关主题）
# 尽量广泛覆盖，减少 AI 需要凭记忆"补脑"的空间
GOLD_QUERIES_EN = [
    "gold price",
    "gold market forecast",
    "Federal Reserve interest rate",
    "Fed chair nominee",
    "central bank gold buying",
    "geopolitical risk gold",
    "US dollar index",
    "gold ETF holdings",
    "Trump tariff gold",
    "inflation data gold",
    "US jobs employment gold",
    "Middle East tension gold",
    "China gold demand",
]

GOLD_QUERIES_ZH = [
    "黄金价格",
    "美联储 利率",
    "美联储主席",
    "央行购金",
    "地缘政治 黄金",
    "特朗普 关税 黄金",
    "通胀 黄金",
    "美元 黄金",
]


def _fetch_google_news_rss(
    query: str,
    language: str = "en",
    max_results: int = 8,
) -> List[Dict[str, Any]]:
    """
    通过 Google News RSS Feed 搜索新闻。

    Args:
        query: 搜索关键词
        language: "en" 或 "zh-CN"
        max_results: 最多返回几条

    Returns:
        新闻条目列表
    """
    if language == "zh":
        hl, gl, ceid = "zh-CN", "CN", "CN:zh-Hans"
    else:
        hl, gl, ceid = "en-US", "US", "US:en"

    encoded_query = urllib.parse.quote(query)
    url = GOOGLE_NEWS_RSS_URL.format(query=encoded_query, hl=hl, gl=gl, ceid=ceid)

    # 用 requests 获取 RSS 内容（解决 SSL 证书问题），再交给 feedparser 解析
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        feed = feedparser.parse(resp.text)
    except Exception:
        feed = feedparser.parse(url)  # fallback
    results = []
    for entry in feed.entries[:max_results]:
        # 从标题中提取来源（Google News 格式: "标题 - 来源"）
        title = entry.get("title", "")
        source = ""
        if " - " in title:
            parts = title.rsplit(" - ", 1)
            title = parts[0].strip()
            source = parts[1].strip()

        results.append({
            "title": title,
            "source": source or entry.get("source", {}).get("title", ""),
            "published_date": entry.get("published", ""),
            "url": entry.get("link", ""),
            "description": entry.get("summary", ""),
        })

    return results


def fetch_gold_news(
    max_results_per_query: int = 8,
    max_total: int = 30,
    language: str = "en",
) -> List[Dict[str, Any]]:
    """
    从 Google News RSS 获取最新黄金相关新闻。

    Args:
        max_results_per_query: 每个搜索词最多返回几条
        max_total: 总共最多返回几条（去重后）
        language: 语言 "en" 或 "zh"

    Returns:
        新闻列表，每条包含 title, description, published_date, url, source
    """
    queries = GOLD_QUERIES_EN if language == "en" else GOLD_QUERIES_ZH
    seen_titles = set()
    all_news = []

    for query in queries:
        try:
            results = _fetch_google_news_rss(
                query=query,
                language=language,
                max_results=max_results_per_query,
            )
            for item in results:
                title = item.get("title", "").strip()
                if title and title not in seen_titles:
                    seen_titles.add(title)
                    all_news.append(item)
        except Exception as e:
            print(f"  [警告] 搜索 '{query}' 失败: {e}")
            continue

        if len(all_news) >= max_total:
            break

    return all_news[:max_total]


def fetch_all_gold_news(
    max_total: int = 40,
    period: str = "3d",
) -> List[Dict[str, Any]]:
    """
    同时获取中英文黄金新闻，合并去重。
    """
    en_news = fetch_gold_news(
        max_results_per_query=8,
        max_total=max_total // 2,
        language="en",
    )
    zh_news = fetch_gold_news(
        max_results_per_query=8,
        max_total=max_total // 2,
        language="zh",
    )

    # 合并
    all_news = en_news + zh_news
    return all_news[:max_total]


def format_news_context(news_list: List[Dict[str, Any]], max_items: int = 20) -> str:
    """
    将新闻列表格式化为文本，供 AI prompt 使用。

    Args:
        news_list: 新闻列表
        max_items: 最多包含几条

    Returns:
        格式化的新闻摘要文本
    """
    if not news_list:
        return "（未获取到实时新闻数据）"

    lines = []
    for i, item in enumerate(news_list[:max_items], 1):
        title = item.get("title", "无标题")
        source = item.get("source", "未知来源")
        pub_date = item.get("published_date", "")
        desc = item.get("description", "")
        # 清理 HTML 标签和实体
        if desc:
            desc = re.sub(r"<[^>]+>", "", desc)
            desc = desc.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            desc = desc.strip()
        # 截断过长的描述
        if desc and len(desc) > 200:
            desc = desc[:200] + "..."

        line = f"[{i}] {title}"
        if source:
            line += f" — {source}"
        if pub_date:
            line += f" ({pub_date})"
        if desc:
            line += f"\n    摘要: {desc}"
        lines.append(line)

    header = f"以下是最近获取到的 {len(lines)} 条黄金相关实时新闻:\n"
    return header + "\n".join(lines)


# 测试入口
if __name__ == "__main__":
    print("正在获取最新黄金相关新闻...\n")
    news = fetch_all_gold_news(max_total=20, period="3d")
    print(f"共获取到 {len(news)} 条新闻:\n")
    print(format_news_context(news))
