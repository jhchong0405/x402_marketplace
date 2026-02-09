"""
Step 2: 深度分析模块
将 Step 1 输出的因素交给 AI，分析相互作用、主导因素、并给出短期/中期走势预测。
"""
import sys
import os
from typing import Any, Dict

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from gold_analyzer.ai_client import chat_completion_json
else:
    from .ai_client import chat_completion_json


def deep_analyze(
    current_date: str,
    target_date: str,
    price_context: str,
    factors_result: Dict[str, Any],
    news_context: str = "",
) -> Dict[str, Any]:
    system_prompt = """你是一位资深的黄金市场分析师。根据用户提供的【具体因素列表】、【历史价格数据】、【精确当前时间】和【实时新闻】，分析因素之间的相互作用，并预测目标日期的金价。

███ 反编造规则（必须严格遵守）███
1. 你的分析必须完全基于用户提供的因素列表和实时新闻内容。
2. 不要编造因素列表中没有的因素。
3. 绝对禁止编造新闻/因素列表中没有的具体日期、数值、会议名称、人名。
4. 如果需要提及某个话题但缺乏具体数据，必须用模糊表述（如"市场预期...""分析师认为..."）。
5. 预测价格必须基于历史价格数据的量级合理推断。

你必须严格按照下面的JSON格式返回（XXX 是占位符，必须替换成真实内容）:
{
  "analysis_date": "YYYY-MM-DD",
  "dominant_factors": ["XXX从因素列表中选出最重要的2-3个"],
  "interactions": [
    {
      "factor_a": "XXX因素A名称",
      "factor_b": "XXX因素B名称",
      "relationship": "XXX这两个因素如何相互作用影响金价",
      "net_effect": "positive或negative或mixed"
    }
  ],
  "short_term_bias": "bullish或bearish或neutral",
  "short_term_confidence": "high或medium或low",
  "mid_term_bias": "bullish或bearish或neutral",
  "mid_term_confidence": "high或medium或low",
  "forecast_target_date": "YYYY-MM-DD",
  "forecast_price": 数值,
  "forecast_low": 数值,
  "forecast_high": 数值,
  "forecast_reasoning": "XXX基于具体因素的预测推理过程",
  "risk_notes": ["XXX风险提示1", "XXX风险提示2"]
}

注意事项:
1. interactions 数组里每个对象必须有 factor_a、factor_b、relationship、net_effect 四个字段
2. net_effect 只能填 "positive"、"negative" 或 "mixed"
3. short_term_bias 和 mid_term_bias 只能填 "bullish"、"bearish" 或 "neutral"
4. forecast_price、forecast_low、forecast_high 必须是数字，单位美元/盎司，量级要和历史价格一致
5. dominant_factors 里的名称必须来自用户提供的因素列表，不要自己编造
6. 不得引用分析基准日期之后才发生的事件
7. 除了这个JSON之外，不要输出任何其他文字"""

    # 构建新闻部分
    news_section = ""
    if news_context:
        news_section = f"""

实时新闻参考:
{news_context}
"""

    user_prompt = f"""当前精确时间: {current_date}
预测目标日期: {target_date}

历史价格摘要:
{price_context}
{news_section}
Step1 因素列表(JSON):
{factors_result}

请综合以上所有信息，做深度分析并给出 short_term、mid_term 观点，以及对 {target_date} 的金价预测。严格返回 JSON。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return chat_completion_json(messages, temperature=0.25)
