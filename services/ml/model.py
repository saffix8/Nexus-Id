"""
model.py — Fraud detection model for NexusID.

Two-stage approach:
  1. IsolationForest   → unsupervised anomaly detection (catches novel patterns)
  2. RandomForest      → supervised classification (calibrated risk score)

The final risk_score is a weighted blend of both signals.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)

# Feature column order — MUST be consistent across train / predict
FEATURE_COLUMNS: list[str] = [
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "verifications_last_1h",
    "verifications_last_24h",
    "verifications_last_7d",
    "credential_age_days",
    "credential_use_count",
    "is_first_time_verifier",
    "new_device",
    "fields_requested_count",
    "is_high_sensitivity_request",
]

# Risk thresholds
RISK_LOW_MAX: float = 30.0
RISK_HIGH_MIN: float = 70.0

# Weight split between the two model signals
_ISO_WEIGHT: float = 0.35
_RF_WEIGHT: float = 0.65


class FraudDetectionModel:
    """
    Encapsulates training, prediction, persistence, and loading of the
    two-stage fraud detection model.
    """

    def __init__(self) -> None:
        self._iso_forest: IsolationForest | None = None
        self._rf_classifier: RandomForestClassifier | None = None
        self._scaler: MinMaxScaler | None = None
        self._is_trained: bool = False

    # ── Public API ────────────────────────────────────────────────────────────

    def train(self, training_data_path: str) -> None:
        """
        Train both models from a CSV at *training_data_path*.

        Expected CSV columns: all FEATURE_COLUMNS + 'label' (0 = normal, 1 = fraud).
        """
        path = Path(training_data_path)
        if not path.exists():
            raise FileNotFoundError(f"Training data not found: {path}")

        df = pd.read_csv(path)
        _validate_columns(df)

        X: np.ndarray = df[FEATURE_COLUMNS].values.astype(float)
        y: np.ndarray = df["label"].values.astype(int)

        # Scale features for IsolationForest (RF is tree-based, scale-invariant)
        self._scaler = MinMaxScaler()
        X_scaled: np.ndarray = self._scaler.fit_transform(X)

        # ── Stage 1: IsolationForest (unsupervised) ───────────────────────
        # contamination = estimated fraud rate in real traffic (~5 %)
        self._iso_forest = IsolationForest(
            n_estimators=200,
            contamination=0.05,
            max_samples="auto",
            random_state=42,
        )
        self._iso_forest.fit(X_scaled)
        logger.info("IsolationForest trained on %d samples.", len(X))

        # ── Stage 2: RandomForestClassifier (supervised) ──────────────────
        fraud_count = int(y.sum())
        normal_count = len(y) - fraud_count
        class_weight = {0: 1.0, 1: normal_count / max(fraud_count, 1)}

        self._rf_classifier = RandomForestClassifier(
            n_estimators=300,
            max_depth=8,
            min_samples_leaf=5,
            class_weight=class_weight,
            random_state=42,
            n_jobs=-1,
        )
        self._rf_classifier.fit(X, y)
        logger.info(
            "RandomForestClassifier trained. Fraud samples: %d / %d.",
            fraud_count, len(y),
        )

        self._is_trained = True

    def predict(self, features: dict[str, Any]) -> dict[str, Any]:
        """
        Predict fraud risk for a single feature vector.

        Parameters
        ----------
        features:
            Dict with keys matching FEATURE_COLUMNS. Missing keys default to 0.

        Returns
        -------
        {
            risk_score:  float  (0–100),
            risk_level:  str    ('LOW' | 'MEDIUM' | 'HIGH'),
            is_anomaly:  bool,
        }
        """
        self._require_trained()

        X = _features_to_array(features)                  # (1, n_features)
        X_scaled = self._scaler.transform(X)              # type: ignore[union-attr]

        # ── Stage 1 score (IsolationForest) ──────────────────────────────
        # decision_function returns negative anomaly score; lower = more anomalous
        iso_raw: float = float(self._iso_forest.decision_function(X_scaled)[0])  # type: ignore[union-attr]
        # Normalise to [0, 1] where 1 = most anomalous
        # Typical range: −0.5 … +0.5
        iso_norm: float = float(np.clip(0.5 - iso_raw, 0.0, 1.0))
        is_anomaly: bool = self._iso_forest.predict(X_scaled)[0] == -1  # type: ignore[union-attr]

        # ── Stage 2 score (RandomForest) ─────────────────────────────────
        rf_proba: float = float(self._rf_classifier.predict_proba(X)[0][1])  # type: ignore[union-attr]

        # ── Blend ─────────────────────────────────────────────────────────
        blended: float = (_ISO_WEIGHT * iso_norm + _RF_WEIGHT * rf_proba) * 100.0
        risk_score: float = round(float(np.clip(blended, 0.0, 100.0)), 2)

        risk_level: str = _score_to_level(risk_score)

        return {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "is_anomaly": is_anomaly,
        }

    def save(self, path: str) -> None:
        """Persist trained models + scaler to *path* (a .pkl file)."""
        self._require_trained()
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        payload = {
            "iso_forest": self._iso_forest,
            "rf_classifier": self._rf_classifier,
            "scaler": self._scaler,
            "feature_columns": FEATURE_COLUMNS,
        }
        joblib.dump(payload, path)
        logger.info("Model saved to %s.", path)

    def load(self, path: str) -> None:
        """Load previously saved models + scaler from *path*."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"Model file not found: {path}")
        payload: dict[str, Any] = joblib.load(path)
        self._iso_forest = payload["iso_forest"]
        self._rf_classifier = payload["rf_classifier"]
        self._scaler = payload["scaler"]
        _cols = payload.get("feature_columns", FEATURE_COLUMNS)
        if _cols != FEATURE_COLUMNS:
            logger.warning("Loaded model has different feature columns. Re-train recommended.")
        self._is_trained = True
        logger.info("Model loaded from %s.", path)

    # ── Private ───────────────────────────────────────────────────────────────

    def _require_trained(self) -> None:
        if not self._is_trained:
            raise RuntimeError("Model is not trained. Call train() or load() first.")


# ── Module-level helpers ──────────────────────────────────────────────────────

def _features_to_array(features: dict[str, Any]) -> np.ndarray:
    """Convert feature dict → (1, n_features) float array in canonical column order."""
    row = [float(features.get(col, 0)) for col in FEATURE_COLUMNS]
    return np.array([row], dtype=float)


def _score_to_level(score: float) -> str:
    if score >= RISK_HIGH_MIN:
        return "HIGH"
    if score >= RISK_LOW_MAX:
        return "MEDIUM"
    return "LOW"


def _validate_columns(df: pd.DataFrame) -> None:
    required = set(FEATURE_COLUMNS) | {"label"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Training CSV is missing columns: {missing}")
