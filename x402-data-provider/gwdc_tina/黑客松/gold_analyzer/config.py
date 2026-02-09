import os
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
AI_BASE_URL = os.getenv("AI_BASE_URL", "")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# 黄金价格的 Yahoo Finance 代码
GOLD_TICKER = "GC=F"

# 量化评分阈值
BULLISH_THRESHOLD = 0.3
BEARISH_THRESHOLD = -0.3
