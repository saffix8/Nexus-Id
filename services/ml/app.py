"""
app.py — NexusID ML Fraud Detection Flask API.
Runs on PORT 5001 (configurable via ML_PORT env var).

Endpoints:
    POST /predict-fraud-risk
    GET  /health
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request

from features import extract_features
from model import FEATURE_COLUMNS, FraudDetectionModel

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger("nexusid.ml")

# ── App init ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

PORT: int = int(os.getenv("ML_PORT", "5001"))
MODEL_PATH: str = os.getenv("ML_MODEL_PATH", "models/fraud_model.pkl")

# ── Model singleton ───────────────────────────────────────────────────────────
_model: FraudDetectionModel = FraudDetectionModel()
_model_loaded: bool = False


def _ensure_model_loaded() -> None:
    global _model, _model_loaded
    if _model_loaded:
        return
    if os.path.exists(MODEL_PATH):
        logger.info("Loading model from %s …", MODEL_PATH)
        _model.load(MODEL_PATH)
        _model_loaded = True
        logger.info("Model ready.")
    else:
        logger.warning(
            "Model file not found at '%s'. "
            "Run train.py first. Predictions will fail until model is loaded.",
            MODEL_PATH,
        )


# ── Request validation ────────────────────────────────────────────────────────

_REQUIRED_EVENT_FIELDS: frozenset[str] = frozenset(
    {"user_id", "credential_id", "verifier_id", "timestamp", "requested_fields"}
)


def _validate_event(event: Any) -> list[str]:
    """Return a list of validation error strings (empty = valid)."""
    errors: list[str] = []
    if not isinstance(event, dict):
        return ["'verification_event' must be a JSON object."]
    missing = _REQUIRED_EVENT_FIELDS - set(event.keys())
    if missing:
        errors.append(f"Missing required fields: {sorted(missing)}")
    if "requested_fields" in event and not isinstance(event["requested_fields"], list):
        errors.append("'requested_fields' must be a JSON array.")
    return errors


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/predict-fraud-risk")
def predict_fraud_risk() -> Response:
    """
    Predict fraud risk for a verification event.

    Body (JSON):
    {
      "verification_event": {
        "user_id":            string,
        "credential_id":      string,
        "verifier_id":        string,
        "timestamp":          string  (ISO-8601),
        "requested_fields":   string[],
        "device_fingerprint": string | null,
        "credential_issued_at": string | null  (ISO-8601, optional)
      }
    }

    Returns:
    {
      "risk_score":  float  (0–100),
      "risk_level":  string ('LOW' | 'MEDIUM' | 'HIGH'),
      "is_anomaly":  bool,
      "features":    { ... },
      "processed_at": string
    }
    """
    t_start = time.perf_counter()

    body: dict[str, Any] = request.get_json(silent=True) or {}
    event: Any = body.get("verification_event")

    errors = _validate_event(event)
    if errors:
        return jsonify({"success": False, "errors": errors}), 400  # type: ignore[return-value]

    # Ensure model is available
    _ensure_model_loaded()
    if not _model_loaded:
        return jsonify({  # type: ignore[return-value]
            "success": False,
            "error": "Model not yet trained. Run train.py to generate the model artifact.",
        }), 503

    # ── Feature extraction (no DB in standalone mode) ─────────────────────
    db_conn = _get_db_connection()
    try:
        features: dict[str, Any] = extract_features(event, db_conn)
    except Exception as exc:
        logger.exception("Feature extraction failed: %s", exc)
        return jsonify({"success": False, "error": "Feature extraction failed.", "detail": str(exc)}), 500  # type: ignore[return-value]
    finally:
        if db_conn is not None:
            try:
                db_conn.close()
            except Exception:
                pass

    # ── Prediction ─────────────────────────────────────────────────────────
    try:
        prediction: dict[str, Any] = _model.predict(features)
    except Exception as exc:
        logger.exception("Prediction failed: %s", exc)
        return jsonify({"success": False, "error": "Prediction failed.", "detail": str(exc)}), 500  # type: ignore[return-value]

    t_ms = round((time.perf_counter() - t_start) * 1000, 1)

    logger.info(
        "user=%s verifier=%s risk=%s (%.0f) latency=%sms",
        event.get("user_id", "?"),
        event.get("verifier_id", "?"),
        prediction["risk_level"],
        prediction["risk_score"],
        t_ms,
    )

    return jsonify({
        "success": True,
        "risk_score": prediction["risk_score"],
        "risk_level": prediction["risk_level"],
        "is_anomaly": prediction["is_anomaly"],
        "features": features,
        "latency_ms": t_ms,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/health")
def health() -> Response:
    return jsonify({
        "status": "ok",
        "model_loaded": _model_loaded,
        "model_path": MODEL_PATH,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/model/features")
def model_features() -> Response:
    """Return the expected feature columns — useful for integration testing."""
    return jsonify({"feature_columns": FEATURE_COLUMNS})


# ── Error handlers ────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_: Any) -> Response:
    return jsonify({"success": False, "error": "Endpoint not found."}), 404  # type: ignore[return-value]


@app.errorhandler(405)
def method_not_allowed(_: Any) -> Response:
    return jsonify({"success": False, "error": "Method not allowed."}), 405  # type: ignore[return-value]


@app.errorhandler(500)
def internal_error(exc: Any) -> Response:
    logger.exception("Unhandled exception: %s", exc)
    return jsonify({"success": False, "error": "Internal server error."}), 500  # type: ignore[return-value]


# ── DB helper (optional — falls back gracefully when no DB is configured) ─────

def _get_db_connection() -> Any | None:
    """
    Returns a psycopg2 connection if DATABASE_URL is configured, else None.
    Feature extraction degrades gracefully to zero-valued DB features when None.
    """
    database_url: str | None = os.getenv("DATABASE_URL")
    if not database_url:
        return None
    try:
        import psycopg2  # type: ignore[import]
        conn = psycopg2.connect(database_url)
        conn.set_session(readonly=True, autocommit=True)
        return conn
    except Exception as exc:
        logger.warning("Could not connect to database: %s. DB-backed features will be 0.", exc)
        return None


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _ensure_model_loaded()
    debug: bool = os.getenv("NODE_ENV", "development") == "development"
    logger.info("Starting NexusID ML service on port %d (debug=%s).", PORT, debug)
    app.run(host="0.0.0.0", port=PORT, debug=debug)
