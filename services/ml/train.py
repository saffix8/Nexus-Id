"""
train.py — Generate synthetic training data and train the NexusID fraud model.

Run:
    python train.py

Output:
    data/synthetic_training.csv   — generated dataset
    models/fraud_model.pkl        — trained model artifact
"""

from __future__ import annotations

import logging
import os
import random
from pathlib import Path

import numpy as np
import pandas as pd

from model import FEATURE_COLUMNS, FraudDetectionModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Reproducibility
SEED: int = 42
random.seed(SEED)
np.random.seed(SEED)

DATA_PATH: str = "data/synthetic_training.csv"
MODEL_PATH: str = "models/fraud_model.pkl"

# Target class distribution: 5 % fraud
N_TOTAL: int = 1000
N_FRAUD: int = 50
N_NORMAL: int = N_TOTAL - N_FRAUD


# ── Synthetic data generators ────────────────────────────────────────────────

def _normal_event() -> dict[str, float | int]:
    """Realistic parameters for a legitimate verification event."""
    hour = int(np.random.choice(
        range(24),
        p=_hour_distribution(),
    ))
    dow = int(np.random.choice(range(7), p=[0.17, 0.17, 0.17, 0.17, 0.15, 0.09, 0.08]))
    return {
        "hour_of_day": hour,
        "day_of_week": dow,
        "is_weekend": int(dow >= 5),
        "verifications_last_1h": int(np.random.choice([0, 1, 2], p=[0.70, 0.25, 0.05])),
        "verifications_last_24h": int(np.random.poisson(1.5)),
        "verifications_last_7d": int(np.random.poisson(5.0)),
        "credential_age_days": int(np.random.exponential(180)),  # avg ~6 months
        "credential_use_count": int(np.random.poisson(3.0)),
        "is_first_time_verifier": int(np.random.choice([0, 1], p=[0.70, 0.30])),
        "new_device": int(np.random.choice([0, 1], p=[0.92, 0.08])),
        "fields_requested_count": int(np.random.choice([1, 2, 3, 4], p=[0.40, 0.35, 0.20, 0.05])),
        "is_high_sensitivity_request": int(np.random.choice([0, 1], p=[0.75, 0.25])),
        "label": 0,
    }


def _fraud_event() -> dict[str, float | int]:
    """
    Anomalous parameters that represent likely fraud patterns:
    - Burst of verifications in a short window
    - Unusual hours
    - New device + first-time verifier combo
    - High sensitivity fields
    - Very fresh or very old credentials
    """
    fraud_pattern = random.choice(["burst", "unusual_hour", "new_device_sensitive", "credential_abuse"])

    base = _normal_event()
    base["label"] = 1

    if fraud_pattern == "burst":
        base["verifications_last_1h"] = int(np.random.randint(5, 20))
        base["verifications_last_24h"] = int(np.random.randint(20, 60))
        base["verifications_last_7d"] = int(np.random.randint(40, 120))

    elif fraud_pattern == "unusual_hour":
        base["hour_of_day"] = int(np.random.choice([1, 2, 3, 4]))  # 1–4 AM
        base["is_first_time_verifier"] = 1
        base["new_device"] = 1
        base["is_high_sensitivity_request"] = 1

    elif fraud_pattern == "new_device_sensitive":
        base["new_device"] = 1
        base["is_first_time_verifier"] = 1
        base["is_high_sensitivity_request"] = 1
        base["fields_requested_count"] = int(np.random.randint(4, 7))
        base["verifications_last_1h"] = int(np.random.randint(3, 10))

    elif fraud_pattern == "credential_abuse":
        base["credential_age_days"] = int(np.random.choice([0, 1]))  # brand-new cred
        base["credential_use_count"] = int(np.random.randint(15, 50))  # used many times fast
        base["verifications_last_24h"] = int(np.random.randint(15, 40))
        base["is_high_sensitivity_request"] = 1

    return base


def _hour_distribution() -> list[float]:
    """Rough probability distribution across 24 hours for normal traffic."""
    # Low at night, peak 9–18
    weights = [
        0.005, 0.003, 0.002, 0.002, 0.003, 0.008,  # 0–5
        0.020, 0.040, 0.060, 0.080, 0.085, 0.085,  # 6–11
        0.080, 0.075, 0.075, 0.070, 0.065, 0.055,  # 12–17
        0.050, 0.045, 0.040, 0.030, 0.020, 0.010,  # 18–23
    ]
    total = sum(weights)
    return [w / total for w in weights]


# ── Main ─────────────────────────────────────────────────────────────────────

def generate_dataset() -> pd.DataFrame:
    logger.info("Generating %d normal events and %d fraud events…", N_NORMAL, N_FRAUD)
    rows = [_normal_event() for _ in range(N_NORMAL)] + [_fraud_event() for _ in range(N_FRAUD)]
    random.shuffle(rows)
    df = pd.DataFrame(rows)
    # Ensure correct column order
    ordered_cols = FEATURE_COLUMNS + ["label"]
    df = df[ordered_cols]
    # Clip obviously out-of-range generated values
    df["hour_of_day"] = df["hour_of_day"].clip(0, 23)
    df["day_of_week"] = df["day_of_week"].clip(0, 6)
    df["credential_age_days"] = df["credential_age_days"].clip(0, 3650)
    logger.info("Dataset shape: %s | Fraud rate: %.1f%%", df.shape, df["label"].mean() * 100)
    return df


def main() -> None:
    # 1. Generate data
    df = generate_dataset()
    os.makedirs("data", exist_ok=True)
    df.to_csv(DATA_PATH, index=False)
    logger.info("Training data saved to %s.", DATA_PATH)

    # 2. Train model
    model = FraudDetectionModel()
    model.train(DATA_PATH)

    # 3. Quick sanity check
    sample_normal = {col: float(df[df["label"] == 0][col].median()) for col in FEATURE_COLUMNS}
    sample_fraud  = {col: float(df[df["label"] == 1][col].median()) for col in FEATURE_COLUMNS}
    pred_normal = model.predict(sample_normal)
    pred_fraud  = model.predict(sample_fraud)
    logger.info("Sanity — normal median: %s", pred_normal)
    logger.info("Sanity — fraud  median: %s", pred_fraud)

    # 4. Save model
    os.makedirs("models", exist_ok=True)
    model.save(MODEL_PATH)
    logger.info("Done. Model artifact at %s.", MODEL_PATH)


if __name__ == "__main__":
    main()
