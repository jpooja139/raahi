"""Storage seam — the future-proof boundary.

Everything above this file talks JSON documents by key. Below it, the backend
is whatever the deployment offers: GCS on Cloud Run (persistent across
revisions), a local directory in dev. Swapping to Firestore/Spanner later
touches only this file.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

_BUCKET = os.getenv("CONTEXT_BUCKET", "")
_LOCAL_DIR = Path(__file__).resolve().parent.parent / "data"

_gcs_client = None


def _safe(key: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.@-]", "_", key)


def _gcs():
    global _gcs_client
    if _gcs_client is None:
        from google.cloud import storage

        _gcs_client = storage.Client()
    return _gcs_client


def get(key: str) -> dict | None:
    key = _safe(key)
    if _BUCKET:
        try:
            blob = _gcs().bucket(_BUCKET).blob(f"{key}.json")
            if not blob.exists():
                return None
            return json.loads(blob.download_as_text())
        except Exception:
            return None
    f = _LOCAL_DIR / f"{key}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text())
    except Exception:
        return None


def put(key: str, doc: dict) -> bool:
    key = _safe(key)
    payload = json.dumps(doc, ensure_ascii=False)
    if _BUCKET:
        try:
            _gcs().bucket(_BUCKET).blob(f"{key}.json").upload_from_string(
                payload, content_type="application/json"
            )
            return True
        except Exception as e:
            print(f"[store] GCS write FAILED for {key}: {type(e).__name__}: {e}", flush=True)
            return False
    try:
        _LOCAL_DIR.mkdir(exist_ok=True)
        (_LOCAL_DIR / f"{key}.json").write_text(payload)
        return True
    except Exception as e:
        print(f"[store] local write FAILED for {key}: {type(e).__name__}: {e}", flush=True)
        return False


def backend() -> str:
    return f"gcs:{_BUCKET}" if _BUCKET else "local"
