"""SQLite-backed channel store for Boston's Studio dashboard.

Tables are created on first use. Schema kept deliberately small and
forward-compatible — any new field can be added by extending the
``_SCHEMA_MIGRATIONS`` list without breaking existing rows.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils import utils

_DB_LOCK = threading.Lock()
_DB_PATH: Optional[Path] = None


_SCHEMA_MIGRATIONS = [
    """
    CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        niche TEXT NOT NULL DEFAULT '',
        voice_name TEXT NOT NULL DEFAULT 'en-AU-NatashaNeural-Female',
        language TEXT NOT NULL DEFAULT 'en',
        video_source TEXT NOT NULL DEFAULT 'pexels',
        video_aspect TEXT NOT NULL DEFAULT '9:16',
        video_concat_mode TEXT NOT NULL DEFAULT 'random',
        clip_duration INTEGER NOT NULL DEFAULT 3,
        target_duration INTEGER NOT NULL DEFAULT 60,
        paragraph_number INTEGER NOT NULL DEFAULT 1,
        subtitle_position TEXT NOT NULL DEFAULT 'bottom',
        script_prompt TEXT NOT NULL DEFAULT '',
        subtitle_enabled INTEGER NOT NULL DEFAULT 1,
        extra_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )
    """,
    "ALTER TABLE channels ADD COLUMN subtitle_enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE channels ADD COLUMN script_llm_provider TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN script_llm_model TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE channels ADD COLUMN videos_per_day INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE channels ADD COLUMN schedule_days TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN schedule_time TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN avatar_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE channels ADD COLUMN avatar_provider TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN avatar_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN avatar_voice_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN avatar_intro_script TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE channels ADD COLUMN youtube_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE channels ADD COLUMN youtube_privacy_status TEXT NOT NULL DEFAULT 'unlisted'",
    "ALTER TABLE channels ADD COLUMN youtube_playlist_id TEXT NOT NULL DEFAULT ''",
    """
    CREATE TABLE IF NOT EXISTS content_sequence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL DEFAULT 0
    )
    """,
]


def _db_path() -> Path:
    global _DB_PATH
    if _DB_PATH is None:
        root = Path(utils.storage_dir()) if hasattr(utils, "storage_dir") else Path("storage")
        root.mkdir(parents=True, exist_ok=True)
        _DB_PATH = root / "studio.db"
    return _DB_PATH


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _ensure_schema() -> None:
    with _DB_LOCK, _connect() as conn:
        for stmt in _SCHEMA_MIGRATIONS:
            try:
                conn.execute(stmt)
            except Exception:
                pass
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    extra = d.pop("extra_json", "{}") or "{}"
    try:
        d["extra"] = json.loads(extra)
    except json.JSONDecodeError:
        d["extra"] = {}
    return d


def list_channels() -> List[Dict[str, Any]]:
    _ensure_schema()
    with _DB_LOCK, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM channels ORDER BY updated_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_channel(channel_id: str) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    with _DB_LOCK, _connect() as conn:
        row = conn.execute(
            "SELECT * FROM channels WHERE id = ?", (channel_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


_ALLOWED_FIELDS = {
    "name",
    "description",
    "niche",
    "voice_name",
    "language",
    "video_source",
    "video_aspect",
    "video_concat_mode",
    "clip_duration",
    "target_duration",
    "paragraph_number",
    "subtitle_position",
    "script_prompt",
    "subtitle_enabled",
    "script_llm_provider",
    "script_llm_model",
    "schedule_enabled",
    "videos_per_day",
    "schedule_days",
    "schedule_time",
    "avatar_enabled",
    "avatar_provider",
    "avatar_id",
    "avatar_voice_id",
    "avatar_intro_script",
    "youtube_enabled",
    "youtube_privacy_status",
    "youtube_playlist_id",
}


def _normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in payload.items():
        if k in _ALLOWED_FIELDS and v is not None:
            out[k] = v
    extra = payload.get("extra")
    if isinstance(extra, dict):
        out["extra_json"] = json.dumps(extra)
    return out


def next_content_id() -> int:
    _ensure_schema()
    import time
    with _DB_LOCK, _connect() as conn:
        cur = conn.execute(
            'INSERT INTO content_sequence (created_at) VALUES (?)',
            (int(time.time()),)
        )
        conn.commit()
        return cur.lastrowid


def create_channel(payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_schema()
    data = _normalize_payload(payload)
    if not data.get("name"):
        raise ValueError("name is required")

    now = int(time.time())
    channel_id = str(uuid.uuid4())
    columns = ["id", "created_at", "updated_at"] + list(data.keys())
    values = [channel_id, now, now] + list(data.values())
    placeholders = ",".join(["?"] * len(columns))
    sql = f"INSERT INTO channels ({','.join(columns)}) VALUES ({placeholders})"

    with _DB_LOCK, _connect() as conn:
        conn.execute(sql, values)
        conn.commit()

    result = get_channel(channel_id)
    assert result is not None
    return result


def update_channel(channel_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    _ensure_schema()
    data = _normalize_payload(payload)
    if not data:
        return get_channel(channel_id)

    data["updated_at"] = int(time.time())
    set_clause = ", ".join(f"{k} = ?" for k in data.keys())
    sql = f"UPDATE channels SET {set_clause} WHERE id = ?"

    with _DB_LOCK, _connect() as conn:
        cur = conn.execute(sql, list(data.values()) + [channel_id])
        conn.commit()
        if cur.rowcount == 0:
            return None
    return get_channel(channel_id)


def delete_channel(channel_id: str) -> bool:
    _ensure_schema()
    with _DB_LOCK, _connect() as conn:
        cur = conn.execute("DELETE FROM channels WHERE id = ?", (channel_id,))
        conn.commit()
        return cur.rowcount > 0
