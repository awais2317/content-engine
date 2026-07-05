"""Analytics endpoint — manual entry of video performance metrics.

Stores per-video metrics (views, CTR, retention, notes) in a JSON file
at storage/analytics.json. Phase 2 will replace with real YouTube API ingestion.
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel

from app.controllers.v1.base import new_router
from app.utils import utils

router = new_router()

ANALYTICS_FILE = Path(utils.storage_dir()) / "analytics.json"


class MetricEntry(BaseModel):
    task_id: str
    platform: str = "youtube"
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    ctr: float = 0.0  # click-through rate as percentage (e.g. 4.5 = 4.5%)
    retention: float = 0.0  # average view duration as percentage (e.g. 65.0 = 65%)
    notes: str = ""
    updated_at: Optional[float] = None


class MetricUpdate(BaseModel):
    platform: str = "youtube"
    views: Optional[int] = None
    likes: Optional[int] = None
    comments: Optional[int] = None
    shares: Optional[int] = None
    ctr: Optional[float] = None
    retention: Optional[float] = None
    notes: Optional[str] = None


def _load() -> List[Dict[str, Any]]:
    if not ANALYTICS_FILE.exists():
        return []
    try:
        return json.loads(ANALYTICS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def _save(data: List[Dict[str, Any]]) -> None:
    ANALYTICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    ANALYTICS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


@router.get("/analytics", summary="List all analytics entries")
def list_analytics() -> Dict[str, Any]:
    return {"data": _load()}


@router.get("/analytics/{task_id}", summary="Get analytics for a specific video")
def get_analytics(task_id: str) -> Dict[str, Any]:
    entries = _load()
    matches = [e for e in entries if e.get("task_id") == task_id]
    if not matches:
        return {"data": None}
    return {"data": matches[0]}


@router.put("/analytics/{task_id}", summary="Create or update analytics for a video")
def upsert_analytics(task_id: str, body: MetricUpdate) -> Dict[str, Any]:
    safe = "".join(ch for ch in task_id if ch.isalnum() or ch in ("-", "_"))
    if safe != task_id or not safe:
        raise HTTPException(status_code=400, detail="invalid task id")

    entries = _load()
    existing = next((e for e in entries if e.get("task_id") == task_id), None)

    if existing:
        # Patch only provided fields
        patch = body.model_dump(exclude_none=True)
        existing.update(patch)
        existing["updated_at"] = time.time()
    else:
        entry = MetricEntry(
            task_id=task_id,
            updated_at=time.time(),
            **body.model_dump(exclude_none=True),
        )
        entries.append(entry.model_dump())

    _save(entries)
    updated = next(e for e in entries if e.get("task_id") == task_id)
    return {"data": updated}


@router.delete("/analytics/{task_id}", summary="Delete analytics for a video")
def delete_analytics(task_id: str) -> Dict[str, Any]:
    entries = _load()
    before = len(entries)
    entries = [e for e in entries if e.get("task_id") != task_id]
    if len(entries) == before:
        raise HTTPException(status_code=404, detail="no analytics for this task")
    _save(entries)
    return {"data": {"task_id": task_id, "deleted": True}}
