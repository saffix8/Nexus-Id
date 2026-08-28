"""
features.py — Feature extraction for NexusID fraud detection.
Converts a raw verification event into a numeric feature vector.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

HIGH_SENSITIVITY_FIELDS: frozenset[str] = frozenset({"cnic", "date_of_birth"})


def extract_features(event: dict[str, Any], db_connection: Any) -> dict[str, int | float]:
    """
    Extract fraud-detection features from a verification event.

    Parameters
    ----------
    event:
        Raw event dict with keys:
            user_id, credential_id, verifier_id, timestamp (ISO-8601),
            requested_fields (list[str]), device_fingerprint (str | None),
            credential_issued_at (ISO-8601, optional)
    db_connection:
        An open psycopg2 (or compatible) connection. Used only for read queries.

    Returns
    -------
    dict with exactly 12 integer/float features.
    """
    try:
        ts = _parse_timestamp(event.get("timestamp") or datetime.now(timezone.utc).isoformat())
    except ValueError:
        logger.warning("Unparseable timestamp '%s'; using now.", event.get("timestamp"))
        ts = datetime.now(timezone.utc)

    user_id: str = event.get("user_id", "")
    credential_id: str = event.get("credential_id", "")
    verifier_id: str = event.get("verifier_id", "")
    requested_fields: list[str] = event.get("requested_fields") or []
    device_fingerprint: str | None = event.get("device_fingerprint")

    # ── Time features ────────────────────────────────────────────────────────
    hour_of_day: int = ts.hour
    day_of_week: int = ts.weekday()          # 0 = Monday … 6 = Sunday
    is_weekend: int = int(day_of_week >= 5)

    # ── DB-backed frequency features ─────────────────────────────────────────
    verifications_last_1h: int = _count_recent_verifications(db_connection, user_id, ts, hours=1)
    verifications_last_24h: int = _count_recent_verifications(db_connection, user_id, ts, hours=24)
    verifications_last_7d: int = _count_recent_verifications(db_connection, user_id, ts, hours=168)

    # ── Credential age ───────────────────────────────────────────────────────
    credential_age_days: int = _credential_age(event.get("credential_issued_at"), ts)

    # ── Credential use count ─────────────────────────────────────────────────
    credential_use_count: int = _credential_use_count(db_connection, credential_id, ts)

    # ── First-time verifier ──────────────────────────────────────────────────
    is_first_time_verifier: int = _is_first_time_verifier(db_connection, user_id, verifier_id)

    # ── Device novelty ───────────────────────────────────────────────────────
    new_device: int = _is_new_device(db_connection, user_id, device_fingerprint)

    # ── Request composition ──────────────────────────────────────────────────
    fields_requested_count: int = len(requested_fields)
    is_high_sensitivity_request: int = int(
        bool(HIGH_SENSITIVITY_FIELDS.intersection(requested_fields))
    )

    return {
        "hour_of_day": hour_of_day,
        "day_of_week": day_of_week,
        "is_weekend": is_weekend,
        "verifications_last_1h": verifications_last_1h,
        "verifications_last_24h": verifications_last_24h,
        "verifications_last_7d": verifications_last_7d,
        "credential_age_days": credential_age_days,
        "credential_use_count": credential_use_count,
        "is_first_time_verifier": is_first_time_verifier,
        "new_device": new_device,
        "fields_requested_count": fields_requested_count,
        "is_high_sensitivity_request": is_high_sensitivity_request,
    }


# ── Private helpers ───────────────────────────────────────────────────────────

def _parse_timestamp(raw: str) -> datetime:
    """Parse ISO-8601 string; attach UTC if naive."""
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    raise ValueError(f"Cannot parse timestamp: {raw}")


def _count_recent_verifications(
    conn: Any, user_id: str, reference_ts: datetime, *, hours: int
) -> int:
    """Count completed/pending verifications for *user_id* in the last *hours* hours."""
    if conn is None or not user_id:
        return 0
    try:
        sql = """
            SELECT COUNT(*)
            FROM   verification_requests vr
            JOIN   verification_results  vrr ON vrr.request_id = vr.id
            WHERE  vrr.verified_at >= (%(ref)s::timestamptz - (%(h)s * interval '1 hour'))
              AND  vrr.verified_at <= %(ref)s::timestamptz
        """
        # Note: NexusID stores the subject hash, not user_id, in verification_results.
        # We approximate via audit_logs which tracks user context.
        sql_audit = """
            SELECT COUNT(*)
            FROM   audit_logs
            WHERE  event_type = 'proof_verified'
              AND  metadata->>'user_id' = %(uid)s
              AND  created_at >= (%(ref)s::timestamptz - (%(h)s * interval '1 hour'))
              AND  created_at <= %(ref)s::timestamptz
        """
        with conn.cursor() as cur:
            cur.execute(sql_audit, {"uid": user_id, "ref": reference_ts.isoformat(), "h": hours})
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as exc:
        logger.warning("DB query failed (recent verifications): %s", exc)
        return 0


def _credential_age(issued_at_raw: str | None, reference_ts: datetime) -> int:
    """Days between credential issuance and the reference timestamp."""
    if not issued_at_raw:
        return 0
    try:
        issued_at = _parse_timestamp(issued_at_raw)
        delta = reference_ts - issued_at
        return max(0, delta.days)
    except ValueError:
        return 0


def _credential_use_count(conn: Any, credential_id: str, reference_ts: datetime) -> int:
    """How many times *credential_id* has been used in verified results."""
    if conn is None or not credential_id:
        return 0
    try:
        sql = """
            SELECT COUNT(*)
            FROM   audit_logs
            WHERE  event_type = 'proof_verified'
              AND  metadata->>'credential_id' = %(cid)s
              AND  created_at <= %(ref)s::timestamptz
        """
        with conn.cursor() as cur:
            cur.execute(sql, {"cid": credential_id, "ref": reference_ts.isoformat()})
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as exc:
        logger.warning("DB query failed (credential use count): %s", exc)
        return 0


def _is_first_time_verifier(conn: Any, user_id: str, verifier_id: str) -> int:
    """1 if this user has never approved a request from *verifier_id* before."""
    if conn is None or not user_id or not verifier_id:
        return 1
    try:
        sql = """
            SELECT COUNT(*)
            FROM   audit_logs
            WHERE  event_type = 'proof_verified'
              AND  metadata->>'user_id'    = %(uid)s
              AND  metadata->>'verifier_id' = %(vid)s
        """
        with conn.cursor() as cur:
            cur.execute(sql, {"uid": user_id, "vid": verifier_id})
            row = cur.fetchone()
            return int(row[0] == 0) if row else 1
    except Exception as exc:
        logger.warning("DB query failed (first-time verifier): %s", exc)
        return 1


def _is_new_device(conn: Any, user_id: str, device_fingerprint: str | None) -> int:
    """1 if *device_fingerprint* has not been seen for this user before."""
    if conn is None or not user_id or not device_fingerprint:
        return 0  # no fingerprint = cannot determine; default safe
    try:
        sql = """
            SELECT COUNT(*)
            FROM   audit_logs
            WHERE  event_type IN ('proof_verified', 'verification_request_created')
              AND  metadata->>'user_id'            = %(uid)s
              AND  metadata->>'device_fingerprint' = %(fp)s
        """
        with conn.cursor() as cur:
            cur.execute(sql, {"uid": user_id, "fp": device_fingerprint})
            row = cur.fetchone()
            return int(row[0] == 0) if row else 0
    except Exception as exc:
        logger.warning("DB query failed (new device): %s", exc)
        return 0
