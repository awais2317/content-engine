import json
import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.controllers.v1.base import new_router
from app.services import s3_storage as _s3
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
    storage: str = "local"
    content_id: str = ""


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


def _read_videos_meta(task_dir: Path) -> Dict[str, Any]:
    f = task_dir / "videos.json"
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _scan_library() -> List[LibraryItem]:
    root = Path(utils.task_dir())
    if not root.exists():
        return []

    s3_svc = _s3.get_s3_storage()
    items: List[LibraryItem] = []

    for task_dir in root.iterdir():
        if not task_dir.is_dir():
            continue

        script_data = _read_script(task_dir)
        videos_meta = _read_videos_meta(task_dir)
        s3_keys = videos_meta.get("s3_keys", [])

        # --- S3-backed videos ---
        if s3_keys and s3_svc.enabled:
            for s3_key in s3_keys:
                fresh_url = s3_svc.get_signed_url(s3_key) or ""
                # estimate size (0 if unknown — we deleted local file)
                items.append(
                    LibraryItem(
                        task_id=task_dir.name,
                        final_path=s3_key,
                        final_url=fresh_url,
                        download_url=fresh_url,
                        size_bytes=0,
                        created_at=task_dir.stat().st_mtime,
                        subject=str(script_data.get("video_subject", ""))[:200],
                        script=str(script_data.get("video_script", ""))[:1000],
                        duration=float(script_data.get("video_duration", 0) or 0),
                        thumbnail_url=f"/api/v1/library/thumbnail/{task_dir.name}",
                        storage="s3",
                        content_id=str(videos_meta.get("content_id", "")),
                    )
                )
            continue  # skip local scan for this task

        # --- Local videos (fallback / S3 disabled) ---
        finals = sorted(
            task_dir.glob("final-*.mp4"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not finals:
            continue
        final = finals[0]
        rel = f"{task_dir.name}/{final.name}"
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
                storage="local",
                content_id="",
            )
        )

    items.sort(key=lambda i: i.created_at, reverse=True)
    return items


@router.get(
    "/library",
    response_model=LibraryResponse,
    summary="List every generated video",
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


@router.get(
    "/library/signed-url/{task_id}",
    summary="Get a fresh access URL for a video task (S3 or local fallback)",
)
def get_signed_url(task_id: str) -> Dict[str, Any]:
    safe = "".join(ch for ch in task_id if ch.isalnum() or ch in ("-", "_"))
    if safe != task_id or not safe:
        raise HTTPException(status_code=400, detail="invalid task id")

    task_dir = Path(utils.task_dir()) / safe
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="task not found")

    # Always generate a FRESH signed URL from the stored s3_key
    videos_meta_file = task_dir / "videos.json"
    if videos_meta_file.exists():
        try:
            metadata = json.loads(videos_meta_file.read_text(encoding="utf-8"))
            s3_keys = metadata.get("s3_keys", [])
            # Also support legacy s3_urls format (old videos)
            s3_uris = metadata.get("s3_urls", [])
            s3_svc = _s3.get_s3_storage()
            if s3_keys and s3_svc.enabled:
                fresh_url = s3_svc.get_signed_url(s3_keys[0])
                if fresh_url:
                    return {"data": {"url": fresh_url, "source": "s3", "s3_key": s3_keys[0]}}
            if s3_uris and s3_svc.enabled:
                # Legacy: these were old signed URLs — try to extract key and regenerate
                first = s3_uris[0]
                if first.startswith("s3://"):
                    fresh_url = s3_svc.url_from_uri(first)
                    if fresh_url:
                        return {"data": {"url": fresh_url, "source": "s3"}}
                elif "s3.amazonaws.com" in first:
                    # Old-style presigned URL — return as-is (may be expired)
                    return {"data": {"url": first, "source": "s3", "warning": "legacy_url_may_be_expired"}}
        except (OSError, json.JSONDecodeError):
            pass

    # Fallback: local file
    finals = sorted(
        task_dir.glob("final-*.mp4"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if finals:
        rel = f"{task_dir.name}/{finals[0].name}"
        return {"data": {"url": f"/api/v1/stream/{rel}", "source": "local"}}

    raise HTTPException(status_code=404, detail="no video found for task")
