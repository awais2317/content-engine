"""Library endpoint — lists every generated video on disk.

The built-in /api/v1/tasks endpoint only returns in-memory state, which is lost
on backend restart. The dashboard needs a *persistent* list, so we scan the
``storage/tasks/`` directory directly.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.controllers.v1.base import new_router
from app.utils import utils

router = new_router()


class LibraryItem(BaseModel):
    task_id: str
    final_path: str
    final_url: str
    download_url: str
    size_bytes: int
    created_at: float
    subject: str = ""
    script: str = ""
    duration: float = 0.0
    thumbnail_url: str = ""


class LibraryResponse(BaseModel):
    data: List[LibraryItem]


def _read_script(task_dir: Path) -> Dict[str, Any]:
    script_file = task_dir / "script.json"
    if not script_file.exists():
        return {}
    try:
        return json.loads(script_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _scan_library() -> List[LibraryItem]:
    root = Path(utils.task_dir())
    if not root.exists():
        return []

    items: List[LibraryItem] = []
    for task_dir in root.iterdir():
        if not task_dir.is_dir():
            continue
        # Pick the newest final-*.mp4 in the folder (some tasks generate
        # multiple variants; we surface the most recent).
        finals = sorted(
            task_dir.glob("final-*.mp4"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not finals:
            continue
        final = finals[0]
        rel = f"{task_dir.name}/{final.name}"
        script_data = _read_script(task_dir)
        items.append(
            LibraryItem(
                task_id=task_dir.name,
                final_path=str(final),
                final_url=f"/api/v1/stream/{rel}",
                download_url=f"/api/v1/download/{rel}",
                size_bytes=final.stat().st_size,
                created_at=final.stat().st_mtime,
                subject=str(script_data.get("video_subject", ""))[:200],
                script=str(script_data.get("video_script", ""))[:1000],
                duration=float(script_data.get("video_duration", 0) or 0),
                thumbnail_url=f"/api/v1/library/thumbnail/{task_dir.name}",
            )
        )
    items.sort(key=lambda i: i.created_at, reverse=True)
    return items


@router.get(
    "/library",
    response_model=LibraryResponse,
    summary="List every generated video on disk",
)
def list_library() -> LibraryResponse:
    return LibraryResponse(data=_scan_library())


@router.delete(
    "/library/{task_id}",
    summary="Delete a generated video task and all its files",
)
def delete_library_item(task_id: str) -> Dict[str, Any]:
    safe = "".join(ch for ch in task_id if ch.isalnum() or ch in ("-", "_"))
    if safe != task_id or not safe:
        raise HTTPException(status_code=400, detail="invalid task id")

    target = Path(utils.task_dir()) / safe
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="task not found")

    import shutil

    shutil.rmtree(target)
    return {"data": {"task_id": safe, "deleted": True}}


@router.get(
    "/library/thumbnail/{task_id}",
    summary="Return a thumbnail (or video poster) for a task",
)
def thumbnail(task_id: str) -> Any:
    safe = "".join(ch for ch in task_id if ch.isalnum() or ch in ("-", "_"))
    if safe != task_id or not safe:
        raise HTTPException(status_code=400, detail="invalid task id")

    task_dir = Path(utils.task_dir()) / safe
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="task not found")

    # Prefer an explicit thumbnail file; fall back to streaming the final
    # video so the browser can extract its own poster frame.
    for name in ("thumbnail.jpg", "thumbnail.png", "poster.jpg"):
        candidate = task_dir / name
        if candidate.exists():
            return FileResponse(str(candidate))

    finals = sorted(
        task_dir.glob("final-*.mp4"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if finals:
        return FileResponse(
            str(finals[0]),
            media_type="video/mp4",
            headers={"Content-Disposition": "inline"},
        )
    raise HTTPException(status_code=404, detail="no media for task")
