"""
Step 1: 因素收集模块
让 AI 搜索并列举当前影响金价的所有关键因素
"""
import sys
import os

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from gold_analyzer.ai_client import chat_completion_json
else:
    from .ai_client import chat_completion_json


def collect_factors(current_date: str, target_date: str, price_context: str, news_context: str = "") -> dict:
    """
    调用 AI 收集影响金价的关键因素
    
    Args:
        current_date: 当前精确时间字符串
        target_date: 预测目标日期 (YYYY-MM-DD)
        price_context: 历史价格摘要文本
        news_context: 实时新闻摘要文本
    
    Returns:
        包含因素列表的字典
    """
    system_prompt = """你是一位资深的黄金市场分析师。用户会提供当前的精确时间、历史价格数据，以及最新的实时新闻。你需要综合这些信息，分析影响黄金价格走势的关键因素。

███ 反编造规则（必须严格遵守）███
1. 你的因素必须且只能来自以下三个来源：
   - 「新闻」：用户提供的实时新闻中明确提到的事件
   - 「价格数据」：用户提供的历史价格数据中可以直接观察到的趋势（如均线、涨跌幅）
   - 「常识」：不涉及具体日期/数值的一般性市场逻辑（如“实际利率与金价负相关”）
2. 绝对禁止编造新闻中没有提到的：
   - 具体日期（如“X月X日的会议”）
   - 具体数值（如“新增就业15万”、“利率下调至-0.6%”）
   - 具体会议/事件名称（如“2月7日美联储会议”）
   - 具体人名、协议名称（除非新闻中明确提到）
3. 如果你想提及某个话题但新闻中没有具体细节，必须用模糊表述，例如：
   - ✔ “市场预期美联储可能维持利率不变”
   - ✘ “美联储在2月7日决定维持利率不变”（除非新闻明确这么说）

你必须严格按照下面的JSON格式返回，所有因素必须放在 factors 数组里面。

格式模板（下面的 XXX 是占位符，你必须替换成真实内容）:
{
  "analysis_date": "YYYY-MM-DD",
  "factors": [
    {
      "name": "XXX因素名称",
      "category": "XXX分类",
      "source_type": "news或price_data或general_knowledge",
      "source_ref": "XXX引用的新闻编号或数据来源，如 [3][5] 或 价格数据 或 市场常识",
      "description": "XXX该因素的真实现状描述",
      "direction": "positive或negative",
      "impact_level": "high或medium或low",
      "impact_score": 1到10的整数,
      "weight": 1到10的整数,
      "reasoning": "XXX为什么该因素在此时会这样影响金价"
    }
  ],
  "total_factors_count": 因素总数
}

注意事项:
1. factors 数组里要有 8 到 15 个因素对象
2. 每个因素必须包含 name/category/source_type/source_ref/description/direction/impact_level/impact_score/weight/reasoning 这10个字段
3. source_type 只能填 "news"、"price_data" 或 "general_knowledge"
4. source_ref: 如果 source_type 是 news，必须引用新闻编号如 "[1][3]"；如果是 price_data，写 "价格数据"；如果是 general_knowledge，写 "市场常识"
5. direction 只能填 "positive" 或 "negative"
6. impact_level 只能填 "high"、"medium" 或 "low"
7. impact_score 和 weight 是 1-10 的整数
8. 涵盖宏观经济、货币政策、地缘政治、市场情绪、技术面、供需基本面等维度
9. 绝对禁止编造新闻中没有的具体日期、数值、会议名称、人名
10. 除了这个JSON之外，不要输出任何其他文字"""

    # 构建新闻部分
    news_section = ""
    if news_context:
        news_section = f"""

以下是刚刚抓取到的最新实时新闻（请务必参考这些新闻来分析当前影响金价的因素）:
{news_context}
"""

    user_prompt = f"""当前精确时间: {current_date}
预测目标日期: {target_date}

以下是黄金的历史价格数据摘要:
{price_context}
{news_section}
请你仅基于上述【实时新闻】和【价格数据】，分析当前影响黄金价格的因素。

███ 关键规则 ███
1. 每个因素必须标注 source_type 和 source_ref，说明信息来源
2. source_type="news" 的因素，source_ref 必须引用具体新闻编号（如 "[1][3]")
3. 绝对禁止编造新闻中没有的具体日期、数值、会议名称、人名
4. 如果新闻只提到了话题但没有具体数值，你只能用模糊表述（如“市场担忧...”“分析师预期...”）

请列出 8-15 个因素，严格返回 JSON 格式。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    result = chat_completion_json(messages, temperature=0.5)
    return result
