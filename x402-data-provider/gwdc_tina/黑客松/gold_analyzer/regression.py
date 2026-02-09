"""
时间序列回归模块
使用 Logistic 回归对黄金价格涨跌进行概率预测。
支持 AI 动态权重调整。
"""
import sys
import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# 让 Windsurf 直接运行时也能找到其他模块
if __name__ == "__main__" and __package__ is None:
    _pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _pkg_root not in sys.path:
        sys.path.insert(0, _pkg_root)


def _safe_import_sklearn():
    """延迟导入 sklearn，避免未安装时直接报错"""
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import TimeSeriesSplit
        from sklearn.metrics import accuracy_score, log_loss
        return LogisticRegression, StandardScaler, TimeSeriesSplit, accuracy_score, log_loss
    except ImportError:
        raise ImportError("请先安装 scikit-learn: pip install scikit-learn")


def train_and_predict(
    feature_matrix: pd.DataFrame,
    selected_proxies: List[Dict[str, Any]],
    forecast_horizon: int = 1,
) -> Dict[str, Any]:
    """
    使用 Logistic 回归训练模型并预测最后一天的涨跌概率。

    Args:
        feature_matrix: 由 build_feature_matrix 生成的特征矩阵（含 target 列）
        selected_proxies: AI 选择的代理指标（含 ai_weight）
        forecast_horizon: 预测天数

    Returns:
        包含概率、模型信息、特征重要性的字典
    """
    LogisticRegression, StandardScaler, TimeSeriesSplit, accuracy_score, log_loss = _safe_import_sklearn()

    if len(feature_matrix) < 60:
        return {"error": "数据不足，至少需要60个交易日", "data_points": len(feature_matrix)}

    # 分离特征和标签
    feature_cols = [c for c in feature_matrix.columns if c not in ("target", "future_return")]
    X = feature_matrix[feature_cols].values
    y = feature_matrix["target"].values

    # 用最后一行作为预测输入（最新日期）
    X_train = X[:-1]
    y_train = y[:-1]
    X_latest = X[-1:].copy()

    # 构建 AI 权重向量：对每个特征列，根据其对应的 proxy_id 分配权重
    proxy_weight_map = {}
    for sp in selected_proxies:
        proxy_weight_map[sp.get("proxy_id", "")] = float(sp.get("ai_weight", 5))

    feature_weights = np.ones(len(feature_cols))
    for i, col in enumerate(feature_cols):
        # 特征列名格式: {proxy_id}_{suffix}
        pid = col.rsplit("_", 2)[0] if "_d1_" in col or "_d5_" in col or "_d20_" in col or "_ma20_" in col or "_vol20" in col else col
        # 尝试匹配 proxy_id
        for key in proxy_weight_map:
            if col.startswith(key + "_"):
                feature_weights[i] = proxy_weight_map[key] / 5.0  # 归一化到 ~1
                break

    # 标准化
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_latest_scaled = scaler.transform(X_latest)

    # 应用 AI 权重：将特征乘以权重
    X_train_weighted = X_train_scaled * feature_weights
    X_latest_weighted = X_latest_scaled * feature_weights

    # 时间序列交叉验证评估
    n_splits = min(5, max(2, len(X_train) // 50))
    tscv = TimeSeriesSplit(n_splits=n_splits)
    cv_scores = []
    cv_losses = []

    for train_idx, val_idx in tscv.split(X_train_weighted):
        X_cv_train, X_cv_val = X_train_weighted[train_idx], X_train_weighted[val_idx]
        y_cv_train, y_cv_val = y_train[train_idx], y_train[val_idx]

        model_cv = LogisticRegression(
            C=1.0, max_iter=1000, solver="lbfgs", random_state=42
        )
        model_cv.fit(X_cv_train, y_cv_train)
        y_pred = model_cv.predict(X_cv_val)
        y_prob = model_cv.predict_proba(X_cv_val)

        cv_scores.append(accuracy_score(y_cv_val, y_pred))
        try:
            cv_losses.append(log_loss(y_cv_val, y_prob))
        except Exception:
            pass

    # 用全部训练数据训练最终模型
    model = LogisticRegression(
        C=1.0, max_iter=1000, solver="lbfgs", random_state=42
    )
    model.fit(X_train_weighted, y_train)

    # 预测最新一天
    prob = model.predict_proba(X_latest_weighted)[0]
    classes = model.classes_

    # 解析概率
    prob_up = float(prob[list(classes).index(1)]) if 1 in classes else 0.5
    prob_down = 1.0 - prob_up

    # 特征重要性（系数绝对值）
    coefs = model.coef_[0]
    feature_importance = []
    for i, col in enumerate(feature_cols):
        feature_importance.append({
            "feature": col,
            "coefficient": round(float(coefs[i]), 6),
            "abs_importance": round(abs(float(coefs[i])) * feature_weights[i], 6),
            "ai_weight_multiplier": round(float(feature_weights[i]), 4),
        })
    feature_importance.sort(key=lambda x: x["abs_importance"], reverse=True)

    # 训练集上的基准
    train_up_ratio = float(y_train.mean())

    return {
        "probability_up": round(prob_up, 4),
        "probability_down": round(prob_down, 4),
        "prediction": "上涨" if prob_up > 0.5 else "下跌",
        "confidence": round(abs(prob_up - 0.5) * 2, 4),  # 0~1, 越高越有信心
        "forecast_horizon_days": forecast_horizon,
        "model_info": {
            "algorithm": "Logistic Regression (AI-weighted features)",
            "training_samples": len(X_train),
            "features_count": len(feature_cols),
            "cv_accuracy_mean": round(float(np.mean(cv_scores)), 4) if cv_scores else None,
            "cv_accuracy_std": round(float(np.std(cv_scores)), 4) if cv_scores else None,
            "cv_log_loss_mean": round(float(np.mean(cv_losses)), 4) if cv_losses else None,
            "train_up_ratio": round(train_up_ratio, 4),
        },
        "top_features": feature_importance[:10],
    }


def compute_combined_probability(
    regression_result: Dict[str, Any],
    ai_qualitative_bias: str,
    ai_confidence: str,
) -> Dict[str, Any]:
    """
    将回归模型的概率与 AI 定性判断结合，输出最终概率。

    Args:
        regression_result: train_and_predict 的输出
        ai_qualitative_bias: AI 的定性判断 ("bullish"/"bearish"/"neutral")
        ai_confidence: AI 的置信度 ("high"/"medium"/"low")

    Returns:
        包含最终概率的字典
    """
    reg_prob_up = regression_result.get("probability_up", 0.5)

    # AI 定性判断转为概率偏移
    bias_map = {"bullish": 0.65, "bearish": 0.35, "neutral": 0.50}
    conf_weight_map = {"high": 0.35, "medium": 0.25, "low": 0.15}

    ai_prob = bias_map.get(ai_qualitative_bias, 0.5)
    ai_weight = conf_weight_map.get(ai_confidence, 0.2)

    # 加权融合: regression_weight + ai_weight = 1
    reg_weight = 1.0 - ai_weight
    final_prob_up = reg_weight * reg_prob_up + ai_weight * ai_prob
    final_prob_down = 1.0 - final_prob_up

    return {
        "final_probability_up": round(final_prob_up, 4),
        "final_probability_down": round(final_prob_down, 4),
        "final_prediction": "上涨" if final_prob_up > 0.5 else "下跌",
        "components": {
            "regression_prob_up": round(reg_prob_up, 4),
            "regression_weight": round(reg_weight, 4),
            "ai_qualitative_prob_up": round(ai_prob, 4),
            "ai_qualitative_weight": round(ai_weight, 4),
            "ai_bias": ai_qualitative_bias,
            "ai_confidence": ai_confidence,
        },
    }
