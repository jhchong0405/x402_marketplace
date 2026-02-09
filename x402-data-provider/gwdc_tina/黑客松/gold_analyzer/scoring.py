"""
Step 3: 量化评分模块
将因素方向与影响程度映射为加权分数，输出总分与看法。
"""
import sys
import os
from typing import Any, Dict, List, Optional

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from gold_analyzer.ai_client import chat_completion_json
    from gold_analyzer.config import BEARISH_THRESHOLD, BULLISH_THRESHOLD
else:
    from .ai_client import chat_completion_json
    from .config import BEARISH_THRESHOLD, BULLISH_THRESHOLD


def _level_to_weight(level: str, mapping: Dict[str, float]) -> float:
    key = (level or "").strip().lower()
    return float(mapping.get(key, mapping.get("medium", 2.0)))


def get_level_weight_mapping_from_ai(
    current_date: str,
    target_date: str,
    factors: List[Dict[str, Any]],
    price_context: str,
) -> Dict[str, Any]:
    system_prompt = """你是一位金融量化分析师。你需要为一个黄金因素打分系统确定 high/medium/low 三档的分值。

你必须返回严格 JSON：
{
  "level_weight_mapping": {"high": 数值, "medium": 数值, "low": 数值},
  "notes": "简短说明"
}

要求：
1) 数值为正数，且 high > medium > low。
2) 建议分值尽量简单（例如 5/3/1 或 3/2/1），便于解释。
3) 不要输出除 JSON 之外的任何文本。"""

    user_prompt = f"""当前精确时间: {current_date}
预测目标日期: {target_date}

历史价格摘要:
{price_context}

因素列表(只用于判断整体敏感度，不需要逐条解释):
{factors}

请给出 high/medium/low 的分值映射。严格返回 JSON。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        result = chat_completion_json(messages, temperature=0.1)
        mapping = result.get("level_weight_mapping", {})
        high = float(mapping.get("high"))
        medium = float(mapping.get("medium"))
        low = float(mapping.get("low"))
        if not (high > medium > low > 0):
            raise ValueError("invalid mapping")
        return {"level_weight_mapping": {"high": high, "medium": medium, "low": low}, "notes": result.get("notes")}
    except Exception:
        return {"level_weight_mapping": {"high": 3.0, "medium": 2.0, "low": 1.0}, "notes": "fallback_default"}


def compute_score(
    factors: List[Dict[str, Any]],
    level_weight_mapping: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    评分公式：sum( direction_sign * level_weight * normalized_factor_weight ) / normalization

    - direction_sign: positive = +1, negative = -1
    - level_weight: high/medium/low 对应的分值（默认 3/2/1）
    - normalized_factor_weight: 因素自身权重（1-10）归一化

    返回：总分、结论(bullish/bearish/neutral)、每个因素贡献。
    """
    if level_weight_mapping is None:
        level_weight_mapping = {"high": 3.0, "medium": 2.0, "low": 1.0}

    contributions: List[Dict[str, Any]] = []

    weights = []
    for f in factors:
        w = f.get("weight", 5)
        try:
            w = float(w)
        except Exception:
            w = 5.0
        weights.append(max(w, 0.0))

    weight_sum = sum(weights) if sum(weights) > 0 else 1.0

    raw_total = 0.0
    for idx, f in enumerate(factors):
        name = f.get("name", f"factor_{idx}")
        direction = (f.get("direction") or "").strip().lower()
        sign = 1.0 if direction == "positive" else -1.0

        level = f.get("impact_level", "medium")
        level_weight = _level_to_weight(level, level_weight_mapping)

        w = weights[idx] / weight_sum
        contrib = sign * level_weight * w
        raw_total += contrib

        contributions.append(
            {
                "name": name,
                "direction": direction,
                "impact_level": level,
                "weight": f.get("weight", None),
                "normalized_weight": round(w, 6),
                "level_weight": level_weight,
                "contribution": round(contrib, 6),
            }
        )

    # 归一化到 [-1, 1] 的大致范围（因为 level_weight 最大可能 3，w 归一化后 sum=1）
    # 这里 raw_total 的范围大概在 [-3,3]，我们除以3，得到 [-1,1]
    score = raw_total / max(level_weight_mapping.values())

    if score >= BULLISH_THRESHOLD:
        view = "bullish"
    elif score <= BEARISH_THRESHOLD:
        view = "bearish"
    else:
        view = "neutral"

    return {
        "score": round(score, 6),
        "view": view,
        "thresholds": {"bullish": BULLISH_THRESHOLD, "bearish": BEARISH_THRESHOLD},
        "level_weight_mapping": level_weight_mapping,
        "factor_contributions": contributions,
    }
