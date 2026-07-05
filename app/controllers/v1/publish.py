"""Publish endpoint — cross-post videos to YouTube/TikTok/Instagram via Upload-Post."""

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel

from app.controllers.v1.base import new_router
from app.services.upload_post import cross_post_video, upload_post_service
from app.utils import utils

router = new_router()


class PublishRequest(BaseModel):
    task_id: str
    title: str = ""
    platforms: Optional[List[str]] = None
    youtube_title: Optional[str] = None
    youtube_description: Optional[str] = None
    tags: Optional[List[str]] = None
    privacy_status: str = "public"


class PublishStatusRequest(BaseModel):
    request_id: str


@router.post("/publish", summary="Publish a video to social platforms via Upload-Post")
def publish_video(req: PublishRequest) -> Dict[str, Any]:
    """Cross-post a rendered video to YouTube / TikTok / Instagram."""
    if not upload_post_service.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Upload-Post not configured. Set upload_post_api_key, upload_post_username, and upload_post_enabled in Settings.",
        )

    # Validate task exists + has a final video
    safe = "".join(ch for ch in req.task_id if ch.isalnum() or ch in ("-", "_"))
    if safe != req.task_id or not safe:
        raise HTTPException(status_code=400, detail="invalid task id")

    task_dir = Path(utils.task_dir()) / safe
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="task not found")

    finals = sorted(
        task_dir.glob("final-*.mp4"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not finals:
        raise HTTPException(status_code=404, detail="no final video in this task")

    video_path = str(finals[0])
    title = req.title or finals[0].stem

    youtube_extra = None
    if req.youtube_title or req.youtube_description or req.tags:
        youtube_extra = {
            "youtube_title": req.youtube_title or title,
            "youtube_description": req.youtube_description or "",
            "tags": req.tags or [],
            "privacyStatus": req.privacy_status,
        }

    result = cross_post_video(
        video_path=video_path,
        title=title,
        platforms=req.platforms,
        youtube_extra=youtube_extra,
    )

    if not result.get("success", False):
        raise HTTPException(
            status_code=502,
            detail=result.get("error") or result.get("message") or "Upload-Post failed",
        )

    return {"data": result}


@router.get("/publish/status", summary="Check if Upload-Post is configured")
def publish_status() -> Dict[str, Any]:
    return {
        "data": {
            "configured": upload_post_service.is_configured(),
            "platforms": upload_post_service.platforms if upload_post_service.is_configured() else [],
            "auto_upload": upload_post_service.auto_upload,
        }
    }


@router.post("/publish/check", summary="Check status of a publish request")
def publish_check(req: PublishStatusRequest) -> Dict[str, Any]:
    result = upload_post_service.check_status(req.request_id)
    return {"data": result}
