"""
因素量化数据模块
将 AI 选出的定性因素映射到可量化的金融数据代理指标，并自动爬取日度数据。
"""
import sys
import os
from typing import Any, Dict, List, Optional

import pandas as pd
import numpy as np
import yfinance as yf

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)
    from gold_analyzer.ai_client import chat_completion_json
else:
    from .ai_client import chat_completion_json


# ============================================================
# 预定义的因素 → 量化代理指标映射
# 每个代理指标包含: ticker, description, transform
# transform 说明如何将原始数据转换为对金价的影响信号
# ============================================================
FACTOR_PROXY_REGISTRY = {

    # ================================================================
    # 一、美联储货币政策 / 美国利率
    # ================================================================
    "us_10y_yield": {
        "ticker": "^TNX",
        "name": "美国10年期国债收益率",
        "description": "长端利率上升 → 持有黄金机会成本增加 → 利空黄金",
        "category": "美联储/利率",
    },
    "us_2y_yield": {
        "ticker": "2YY=F",
        "name": "美国2年期国债收益率",
        "description": "短端利率直接反映美联储加息/降息预期",
        "category": "美联储/利率",
    },
    "us_3m_yield": {
        "ticker": "^IRX",
        "name": "美国3月期国债收益率",
        "description": "最短端利率，紧贴联邦基金利率",
        "category": "美联储/利率",
    },
    "us_30y_yield": {
        "ticker": "^TYX",
        "name": "美国30年期国债收益率",
        "description": "超长端利率反映长期通胀和经济预期",
        "category": "美联储/利率",
    },
    "us_5y_yield": {
        "ticker": "^FVX",
        "name": "美国5年期国债收益率",
        "description": "中端利率，与通胀预期相关",
        "category": "美联储/利率",
    },
    "tlt_bond_etf": {
        "ticker": "TLT",
        "name": "美国20年+国债ETF",
        "description": "TLT上涨=长端利率下降 → 利多黄金",
        "category": "美联储/利率",
    },
    "shy_short_bond": {
        "ticker": "SHY",
        "name": "美国1-3年短期国债ETF",
        "description": "短债ETF反映近期利率预期变化",
        "category": "美联储/利率",
    },
    "fed_funds_futures": {
        "ticker": "ZQ=F",
        "name": "联邦基金利率期货",
        "description": "直接反映市场对美联储下次会议利率决议的预期",
        "category": "美联储/利率",
    },

    # ================================================================
    # 二、欧洲央行 / 欧洲利率
    # ================================================================
    "eurusd": {
        "ticker": "EURUSD=X",
        "name": "欧元兑美元",
        "description": "欧元走强=美元走弱 → 利多黄金；也反映ECB vs Fed政策差异",
        "category": "欧洲央行/利率",
    },
    "german_10y_bund": {
        "ticker": "IBGL.L",
        "name": "德国10年期国债ETF(iShares)",
        "description": "欧洲基准利率代理，ECB鹰派→德债跌→利空黄金",
        "category": "欧洲央行/利率",
    },
    "euro_stoxx50": {
        "ticker": "^STOXX50E",
        "name": "欧洲斯托克50指数",
        "description": "欧洲股市表现反映欧洲经济和ECB政策影响",
        "category": "欧洲央行/利率",
    },
    "eurchf": {
        "ticker": "EURCHF=X",
        "name": "欧元兑瑞郎",
        "description": "欧洲避险情绪指标，欧元贬值兑瑞郎→欧洲风险上升→利多黄金",
        "category": "欧洲央行/利率",
    },

    # ================================================================
    # 三、美国通胀数据
    # ================================================================
    "tips_etf": {
        "ticker": "TIP",
        "name": "通胀保值债券ETF(TIPS)",
        "description": "TIP上涨反映通胀预期升温 → 利多黄金",
        "category": "通胀",
    },
    "breakeven_10y": {
        "ticker": "T5YIE=F",
        "name": "10年期盈亏平衡通胀率期货",
        "description": "市场隐含通胀预期，上升 → 利多黄金",
        "category": "通胀",
    },
    "commodity_index": {
        "ticker": "DJP",
        "name": "彭博大宗商品指数ETN",
        "description": "大宗商品整体上涨反映通胀压力 → 利多黄金",
        "category": "通胀",
    },
    "copper": {
        "ticker": "HG=F",
        "name": "铜期货",
        "description": "铜价上涨反映经济过热和通胀压力 → 利多黄金",
        "category": "通胀",
    },
    "wheat": {
        "ticker": "ZW=F",
        "name": "小麦期货",
        "description": "粮食价格上涨反映食品通胀 → 利多黄金",
        "category": "通胀",
    },

    # ================================================================
    # 四、美元指数 / 汇率
    # ================================================================
    "dxy": {
        "ticker": "DX-Y.NYB",
        "name": "美元指数(DXY)",
        "description": "美元走强 → 黄金承压 → 利空黄金",
        "category": "美元/汇率",
    },
    "usdjpy": {
        "ticker": "JPY=X",
        "name": "美元兑日元",
        "description": "日元走强(数值下降)=避险情绪升温 → 利多黄金",
        "category": "美元/汇率",
    },
    "usdchf": {
        "ticker": "CHF=X",
        "name": "美元兑瑞郎",
        "description": "瑞郎走强(数值下降)=避险需求 → 利多黄金",
        "category": "美元/汇率",
    },
    "usdcny": {
        "ticker": "CNY=X",
        "name": "美元兑人民币",
        "description": "人民币贬值 → 中国投资者买入黄金避险 → 利多黄金",
        "category": "美元/汇率",
    },
    "usdinr": {
        "ticker": "INR=X",
        "name": "美元兑印度卢比",
        "description": "印度是全球第二大黄金消费国，卢比贬值影响印度黄金需求",
        "category": "美元/汇率",
    },
    "gbpusd": {
        "ticker": "GBPUSD=X",
        "name": "英镑兑美元",
        "description": "英镑走强=美元走弱 → 利多黄金",
        "category": "美元/汇率",
    },
    "uup_dollar_etf": {
        "ticker": "UUP",
        "name": "美元看涨ETF",
        "description": "UUP上涨=美元走强 → 利空黄金",
        "category": "美元/汇率",
    },

    # ================================================================
    # 五、地缘政治风险
    # ================================================================
    "vix": {
        "ticker": "^VIX",
        "name": "VIX恐慌指数",
        "description": "VIX飙升 → 市场恐慌/地缘风险 → 避险买入黄金",
        "category": "地缘政治/风险",
    },
    "crude_oil": {
        "ticker": "CL=F",
        "name": "WTI原油期货",
        "description": "油价飙升常伴随中东地缘冲突 → 间接利多黄金",
        "category": "地缘政治/风险",
    },
    "brent_oil": {
        "ticker": "BZ=F",
        "name": "布伦特原油期货",
        "description": "国际油价基准，对中东局势更敏感",
        "category": "地缘政治/风险",
    },
    "nat_gas": {
        "ticker": "NG=F",
        "name": "天然气期货",
        "description": "天然气价格飙升常与俄乌/欧洲地缘风险相关",
        "category": "地缘政治/风险",
    },
    "defense_etf": {
        "ticker": "ITA",
        "name": "美国国防军工ETF",
        "description": "军工股上涨反映地缘冲突升级预期 → 利多黄金",
        "category": "地缘政治/风险",
    },
    "israel_etf": {
        "ticker": "EIS",
        "name": "以色列ETF",
        "description": "以色列ETF下跌反映中东局势恶化 → 利多黄金",
        "category": "地缘政治/风险",
    },
    "vxus_intl_stock": {
        "ticker": "VXUS",
        "name": "国际(除美)股票ETF",
        "description": "国际股市下跌反映全球风险上升 → 利多黄金",
        "category": "地缘政治/风险",
    },

    # ================================================================
    # 六、市场情绪 / 风险偏好
    # ================================================================
    "sp500": {
        "ticker": "^GSPC",
        "name": "标普500指数",
        "description": "股市上涨 → 风险偏好高 → 资金流出黄金",
        "category": "市场情绪",
    },
    "nasdaq": {
        "ticker": "^IXIC",
        "name": "纳斯达克指数",
        "description": "科技股表现反映风险偏好",
        "category": "市场情绪",
    },
    "russell2000": {
        "ticker": "^RUT",
        "name": "罗素2000小盘股指数",
        "description": "小盘股表现反映市场风险偏好和经济信心",
        "category": "市场情绪",
    },
    "hyg_junk_bond": {
        "ticker": "HYG",
        "name": "高收益(垃圾)债券ETF",
        "description": "HYG下跌=信用利差扩大=风险厌恶 → 利多黄金",
        "category": "市场情绪",
    },
    "put_call_ratio": {
        "ticker": "^VIX9D",
        "name": "VIX 9日短期恐慌指数",
        "description": "超短期恐慌指标，飙升反映极端恐慌 → 利多黄金",
        "category": "市场情绪",
    },
    "move_bond_vol": {
        "ticker": "^MOVE",
        "name": "MOVE债券波动率指数",
        "description": "债市波动加剧反映金融系统压力 → 利多黄金",
        "category": "市场情绪",
    },

    # ================================================================
    # 七、美国就业 / 经济数据
    # ================================================================
    "us_unemployment_etf": {
        "ticker": "XLF",
        "name": "金融板块ETF",
        "description": "金融股表现反映就业和经济健康度，下跌→经济担忧→利多黄金",
        "category": "就业/经济",
    },
    "us_consumer_etf": {
        "ticker": "XLY",
        "name": "非必需消费品ETF",
        "description": "消费股下跌反映就业/消费疲软 → 经济衰退预期 → 利多黄金",
        "category": "就业/经济",
    },
    "us_industrial_etf": {
        "ticker": "XLI",
        "name": "工业板块ETF",
        "description": "工业股反映制造业和经济活动强度",
        "category": "就业/经济",
    },
    "us_transport": {
        "ticker": "IYT",
        "name": "运输业ETF",
        "description": "运输股是经济领先指标，下跌→经济放缓预期→利多黄金",
        "category": "就业/经济",
    },
    "us_housing": {
        "ticker": "XHB",
        "name": "住宅建筑ETF",
        "description": "房地产市场反映利率政策和经济健康度",
        "category": "就业/经济",
    },

    # ================================================================
    # 八、全球经济增长
    # ================================================================
    "eem_emerging": {
        "ticker": "EEM",
        "name": "新兴市场ETF",
        "description": "新兴市场下跌反映全球增长放缓 → 利多黄金",
        "category": "全球经济",
    },
    "fxi_china": {
        "ticker": "FXI",
        "name": "中国大盘股ETF",
        "description": "中国经济表现影响全球增长预期和黄金实物需求",
        "category": "全球经济",
    },
    "ewj_japan": {
        "ticker": "EWJ",
        "name": "日本ETF",
        "description": "日本经济和日央行政策影响全球资金流向",
        "category": "全球经济",
    },
    "nikkei225": {
        "ticker": "^N225",
        "name": "日经225指数",
        "description": "日本股市表现反映亚太经济和日央行政策",
        "category": "全球经济",
    },
    "shanghai_composite": {
        "ticker": "000001.SS",
        "name": "上证综合指数",
        "description": "中国股市表现反映中国经济和黄金需求预期",
        "category": "全球经济",
    },
    "baltic_dry": {
        "ticker": "BDRY",
        "name": "波罗的海干散货运价ETF",
        "description": "全球贸易活动领先指标，下跌→全球经济放缓→利多黄金",
        "category": "全球经济",
    },

    # ================================================================
    # 九、黄金ETF持仓 / 实物需求 / 央行购金
    # ================================================================
    "gld_price": {
        "ticker": "GLD",
        "name": "黄金ETF(GLD)价格",
        "description": "全球最大黄金ETF价格，直接跟踪金价",
        "category": "ETF/实物需求",
    },
    "gld_volume": {
        "ticker": "GLD",
        "name": "黄金ETF(GLD)成交量",
        "description": "成交量放大反映市场对黄金的关注度和资金流入",
        "category": "ETF/实物需求",
    },
    "iau_etf": {
        "ticker": "IAU",
        "name": "iShares黄金ETF",
        "description": "第二大黄金ETF，成交量变化反映机构配置需求",
        "category": "ETF/实物需求",
    },
    "gdx_miners": {
        "ticker": "GDX",
        "name": "黄金矿业ETF",
        "description": "金矿股上涨反映市场看好黄金前景和央行购金预期",
        "category": "ETF/实物需求",
    },
    "gdxj_junior_miners": {
        "ticker": "GDXJ",
        "name": "小型黄金矿业ETF",
        "description": "小型金矿股对金价更敏感，是金价方向的放大器",
        "category": "ETF/实物需求",
    },
    "silver": {
        "ticker": "SI=F",
        "name": "白银期货",
        "description": "白银与黄金高度相关，金银比变化反映贵金属需求结构",
        "category": "ETF/实物需求",
    },
    "slv_silver_etf": {
        "ticker": "SLV",
        "name": "白银ETF",
        "description": "白银ETF资金流反映贵金属整体配置需求",
        "category": "ETF/实物需求",
    },
    "platinum": {
        "ticker": "PL=F",
        "name": "铂金期货",
        "description": "铂金与黄金同属贵金属，走势分化反映工业vs避险需求",
        "category": "ETF/实物需求",
    },
    "palladium": {
        "ticker": "PA=F",
        "name": "钯金期货",
        "description": "钯金价格反映工业贵金属需求",
        "category": "ETF/实物需求",
    },

    # ================================================================
    # 十、技术面信号代理
    # ================================================================
    "gold_futures_volume": {
        "ticker": "GC=F",
        "name": "黄金期货成交量",
        "description": "成交量放大+价格上涨=趋势确认；成交量萎缩=趋势可能反转",
        "category": "技术面",
    },
    "gold_silver_ratio": {
        "ticker": "SI=F",
        "name": "金银比(通过白银间接计算)",
        "description": "金银比上升=避险情绪主导；下降=工业需求/风险偏好回升",
        "category": "技术面",
    },
    "gdx_gld_ratio": {
        "ticker": "GDX",
        "name": "金矿股/金价比(通过GDX间接计算)",
        "description": "GDX跑赢GLD=市场看好金价继续上涨；GDX跑输=见顶信号",
        "category": "技术面",
    },

    # ================================================================
    # 十一、加密货币（替代资产）
    # ================================================================
    "bitcoin": {
        "ticker": "BTC-USD",
        "name": "比特币",
        "description": "比特币作为'数字黄金'，与黄金存在替代/共振关系",
        "category": "替代资产",
    },
    "ethereum": {
        "ticker": "ETH-USD",
        "name": "以太坊",
        "description": "加密市场整体情绪指标，与风险偏好相关",
        "category": "替代资产",
    },

    # ================================================================
    # 十二、其他宏观
    # ================================================================
    "us_reit": {
        "ticker": "VNQ",
        "name": "美国房地产信托ETF",
        "description": "REIT对利率敏感，下跌反映利率上升预期 → 利空黄金",
        "category": "宏观经济",
    },
    "us_utilities": {
        "ticker": "XLU",
        "name": "公用事业板块ETF",
        "description": "防御性板块，上涨反映资金转向防御 → 利多黄金",
        "category": "宏观经济",
    },
    "lumber": {
        "ticker": "LBS=F",
        "name": "木材期货",
        "description": "木材价格反映房地产和建筑活动，是经济领先指标",
        "category": "宏观经济",
    },
}


def get_proxy_registry() -> Dict[str, Dict]:
    """返回所有可用的代理指标注册表"""
    return FACTOR_PROXY_REGISTRY.copy()


def ai_select_proxies(
    current_date: str,
    target_date: str,
    factors: List[Dict[str, Any]],
    price_context: str,
) -> Dict[str, Any]:
    """
    让 AI 从预定义的代理指标中选择与当前因素最相关的指标，
    并为每个指标分配权重和影响方向。
    """
    registry_desc = []
    for key, info in FACTOR_PROXY_REGISTRY.items():
        registry_desc.append(f'  "{key}": {info["name"]} - {info["description"]}')
    registry_text = "\n".join(registry_desc)

    factors_text = []
    for f in factors:
        factors_text.append(f"  - {f.get('name')}: 方向={f.get('direction')}, 影响={f.get('impact_level')}, 权重={f.get('weight')}")
    factors_text = "\n".join(factors_text)

    system_prompt = f"""你是一位量化金融分析师。你需要将定性的黄金影响因素映射到可量化的金融数据代理指标。

以下是所有可用的代理指标（proxy_id: 名称 - 说明）:
{registry_text}

你必须严格按照以下JSON格式返回（XXX为占位符）:
{{
  "selected_proxies": [
    {{
      "proxy_id": "XXX从上面的列表中选择",
      "mapped_factor": "XXX对应的定性因素名称",
      "direction_on_gold": "positive或negative",
      "ai_weight": 1到10的整数,
      "reasoning": "XXX为什么选这个代理指标"
    }}
  ],
  "unmapped_factors": ["XXX无法用代理指标量化的因素名称"]
}}

注意事项:
1. 从可用列表中选择 8-15 个最相关的代理指标，尽量覆盖不同分类
2. proxy_id 必须是上面列表中存在的 key，不能自己编造
3. direction_on_gold: 该代理指标数值上升时对金价的影响方向
   - 例如 VIX 上升 → 利多黄金 → "positive"
   - 例如美元指数上升 → 利空黄金 → "negative"
4. ai_weight 反映该指标在当前市场环境下的重要性
5. 不同日期应该有不同的权重分配
6. 除了JSON之外不要输出任何其他文字"""

    user_prompt = f"""当前精确时间: {current_date}
预测目标日期: {target_date}

历史价格摘要:
{price_context}

AI 识别的定性因素:
{factors_text}

请从可用代理指标中选择最相关的 8-15 个，尽量覆盖不同分类（利率、汇率、地缘、情绪、ETF等），并分配权重。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        result = chat_completion_json(messages, temperature=0.3)
        selected = result.get("selected_proxies", [])
        # 验证 proxy_id 都存在
        valid = []
        for s in selected:
            if isinstance(s, dict) and s.get("proxy_id") in FACTOR_PROXY_REGISTRY:
                valid.append(s)
        result["selected_proxies"] = valid
        return result
    except Exception as e:
        # fallback: 使用默认的核心指标
        return {
            "selected_proxies": [
                {"proxy_id": "us_10y_yield", "mapped_factor": "利率", "direction_on_gold": "negative", "ai_weight": 8, "reasoning": "fallback"},
                {"proxy_id": "dxy", "mapped_factor": "美元", "direction_on_gold": "negative", "ai_weight": 7, "reasoning": "fallback"},
                {"proxy_id": "vix", "mapped_factor": "风险", "direction_on_gold": "positive", "ai_weight": 7, "reasoning": "fallback"},
                {"proxy_id": "tips_etf", "mapped_factor": "通胀", "direction_on_gold": "positive", "ai_weight": 6, "reasoning": "fallback"},
                {"proxy_id": "crude_oil", "mapped_factor": "地缘", "direction_on_gold": "positive", "ai_weight": 6, "reasoning": "fallback"},
                {"proxy_id": "sp500", "mapped_factor": "股市", "direction_on_gold": "negative", "ai_weight": 5, "reasoning": "fallback"},
            ],
            "unmapped_factors": [],
            "error": str(e),
        }


def fetch_proxy_data(
    proxy_ids: List[str],
    end_date: str = None,
    lookback_days: int = 365,
) -> pd.DataFrame:
    """
    批量爬取代理指标的日度数据，返回一个以日期为索引、各指标为列的 DataFrame。
    对于 proxy_id 含 "volume" 的指标，取成交量而非收盘价。

    Args:
        proxy_ids: 代理指标 ID 列表
        end_date: 截止日期 "YYYY-MM-DD"。如果为 None，获取到当前最新可用数据。
        lookback_days: 回溯天数
    """
    # 需要取成交量而非收盘价的 proxy_id
    VOLUME_PROXIES = {"gld_volume", "gold_futures_volume"}

    if end_date is None:
        end = pd.Timestamp.now()
    else:
        end = pd.Timestamp(end_date)
    start = end - pd.Timedelta(days=lookback_days + 30)  # 多取30天用于计算滚动特征

    # 按 ticker 分组，避免同一个 ticker 重复请求
    ticker_to_pids: Dict[str, List[str]] = {}
    for pid in proxy_ids:
        info = FACTOR_PROXY_REGISTRY.get(pid)
        if not info:
            continue
        tk = info["ticker"]
        ticker_to_pids.setdefault(tk, []).append(pid)

    all_data = {}
    for ticker_symbol, pids in ticker_to_pids.items():
        try:
            ticker = yf.Ticker(ticker_symbol)
            hist_kwargs = {"start": start.strftime("%Y-%m-%d")}
            if end_date is not None:
                hist_kwargs["end"] = end.strftime("%Y-%m-%d")
            df = ticker.history(**hist_kwargs)
            if df.empty:
                print(f"  [警告] {ticker_symbol} ({', '.join(pids)}) 无数据")
                continue

            df = df.reset_index()
            dates = pd.to_datetime(df["Date"])
            try:
                if getattr(dates.dt, "tz", None) is not None:
                    dates = dates.dt.tz_convert(None)
            except Exception:
                pass
            df["Date"] = dates
            df = df.set_index("Date")

            for pid in pids:
                if pid in VOLUME_PROXIES:
                    if "Volume" in df.columns:
                        all_data[pid] = df["Volume"]
                else:
                    if "Close" in df.columns:
                        all_data[pid] = df["Close"]

        except Exception as e:
            print(f"  [警告] 获取 {ticker_symbol} ({', '.join(pids)}) 失败: {e}")
            continue

    if not all_data:
        return pd.DataFrame()

    result = pd.DataFrame(all_data)
    result = result.sort_index()
    # 截止到 end_date
    result = result[result.index <= end]
    # 前向填充缺失值（节假日等）
    result = result.ffill()
    return result


def build_feature_matrix(
    proxy_data: pd.DataFrame,
    gold_prices: pd.DataFrame,
    selected_proxies: List[Dict[str, Any]],
    forecast_horizon: int = 1,
) -> pd.DataFrame:
    """
    构建特征矩阵：
    - X: 每个代理指标的日度变化率、5日变化率、20日变化率、当前值相对均值的偏离
    - Y: 未来 forecast_horizon 天黄金价格是否上涨 (1=涨, 0=跌)

    Args:
        proxy_data: 代理指标日度数据
        gold_prices: 黄金价格 DataFrame (需要有 Date 和 Close 列)
        selected_proxies: AI 选择的代理指标列表
        forecast_horizon: 预测未来几天

    Returns:
        包含特征和标签的 DataFrame
    """
    # 准备黄金价格序列
    gold = gold_prices[["Date", "Close"]].copy()
    gold["Date"] = pd.to_datetime(gold["Date"])
    try:
        if getattr(gold["Date"].dt, "tz", None) is not None:
            gold["Date"] = gold["Date"].dt.tz_convert(None)
    except Exception:
        pass
    gold = gold.set_index("Date").sort_index()
    gold.columns = ["gold_close"]

    # 计算黄金未来收益标签
    gold["future_return"] = gold["gold_close"].shift(-forecast_horizon) / gold["gold_close"] - 1
    gold["target"] = (gold["future_return"] > 0).astype(int)

    # 构建特征
    features = pd.DataFrame(index=proxy_data.index)

    proxy_weight_map = {}
    proxy_direction_map = {}
    for sp in selected_proxies:
        pid = sp.get("proxy_id")
        proxy_weight_map[pid] = sp.get("ai_weight", 5)
        proxy_direction_map[pid] = 1.0 if sp.get("direction_on_gold") == "positive" else -1.0

    for pid in proxy_data.columns:
        series = proxy_data[pid]
        direction = proxy_direction_map.get(pid, 1.0)

        # 日度变化率
        features[f"{pid}_d1_chg"] = series.pct_change(1) * direction
        # 5日变化率
        features[f"{pid}_d5_chg"] = series.pct_change(5) * direction
        # 20日变化率
        features[f"{pid}_d20_chg"] = series.pct_change(20) * direction
        # 相对20日均值的偏离
        ma20 = series.rolling(20).mean()
        features[f"{pid}_ma20_dev"] = ((series - ma20) / ma20) * direction
        # 波动率（20日滚动标准差）
        features[f"{pid}_vol20"] = series.pct_change().rolling(20).std()

    # 合并黄金数据
    merged = features.join(gold[["target", "future_return"]], how="inner")
    # 去掉 NaN
    merged = merged.dropna()

    return merged
