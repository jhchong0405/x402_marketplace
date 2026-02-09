"""
OpenAI API 客户端封装
"""
import json
from typing import Any, Dict, List, Optional
import sys
import os

from openai import OpenAI

# 让 Windsurf 直接运行时也能找到 config
_sys_path_inserted = False
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
        _sys_path_inserted = True
    from gold_analyzer.config import AI_BASE_URL, AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL
    if _sys_path_inserted:
        sys.path.remove(_pkg_root)
else:
    from .config import AI_BASE_URL, AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL


def get_client() -> OpenAI:
    """获取 OpenAI 客户端实例"""
    if not OPENAI_API_KEY:
        raise ValueError("请在 .env 文件中设置 OPENAI_API_KEY")
    base_url = AI_BASE_URL
    if not base_url and (AI_PROVIDER or "").strip().lower() == "qwen":
        base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    if base_url:
        return OpenAI(api_key=OPENAI_API_KEY, base_url=base_url)
    return OpenAI(api_key=OPENAI_API_KEY)


def chat_completion(messages: List[Dict[str, Any]], temperature: float = 0.3, response_format: Optional[str] = None) -> str:
    """
    调用 OpenAI ChatCompletion API
    
    Args:
        messages: 对话消息列表
        temperature: 温度参数，越低越确定
        response_format: 响应格式，设为 "json_object" 则强制返回 JSON
    
    Returns:
        AI 回复的文本内容
    """
    client = get_client()
    kwargs = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format == "json":
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


def chat_completion_json(messages: List[Dict[str, Any]], temperature: float = 0.3) -> Dict[str, Any]:
    """
    调用 API 并解析 JSON 响应
    
    Returns:
        解析后的字典
    """
    raw = chat_completion(messages, temperature=temperature, response_format="json")
    return json.loads(raw)
