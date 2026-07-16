"""Channels REST endpoints for Boston's Studio dashboard."""

import threading
import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.controllers.v1.base import new_router
from app.services import channel_store

router = new_router()


class ChannelPayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    niche: Optional[str] = None
    voice_name: Optional[str] = None
    language: Optional[str] = None
    video_source: Optional[str] = None
    video_aspect: Optional[str] = None
    video_concat_mode: Optional[str] = None
    clip_duration: Optional[int] = None
    target_duration: Optional[int] = None
    paragraph_number: Optional[int] = None
    subtitle_position: Optional[str] = None
    script_prompt: Optional[str] = None
    subtitle_enabled: Optional[bool] = None
    script_llm_provider: Optional[str] = None
    script_llm_model: Optional[str] = None
    schedule_enabled: Optional[bool] = None
    videos_per_day: Optional[int] = None
    schedule_days: Optional[str] = None
    schedule_time: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


class ChannelListResponse(BaseModel):
    data: List[Dict[str, Any]]


class ChannelResponse(BaseModel):
    data: Dict[str, Any]


@router.get(
    "/channels",
    response_model=ChannelListResponse,
    summary="List channels",
)
def list_channels() -> ChannelListResponse:
    return ChannelListResponse(data=channel_store.list_channels())


@router.post(
    "/channels",
    response_model=ChannelResponse,
    summary="Create a channel",
)
def create_channel(payload: ChannelPayload) -> ChannelResponse:
    body = payload.model_dump(exclude_none=True)
    if not body.get("name"):
        raise HTTPException(status_code=400, detail="name is required")
    try:
        created = channel_store.create_channel(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ChannelResponse(data=created)


@router.get(
    "/channels/{channel_id}",
    response_model=ChannelResponse,
    summary="Get a single channel",
)
def get_channel(channel_id: str) -> ChannelResponse:
    found = channel_store.get_channel(channel_id)
    if not found:
        raise HTTPException(status_code=404, detail="channel not found")
    return ChannelResponse(data=found)


@router.patch(
    "/channels/{channel_id}",
    response_model=ChannelResponse,
    summary="Update a channel",
)
def update_channel(channel_id: str, payload: ChannelPayload) -> ChannelResponse:
    body = payload.model_dump(exclude_none=True)
    updated = channel_store.update_channel(channel_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="channel not found")
    return ChannelResponse(data=updated)


@router.delete(
    "/channels/{channel_id}",
    summary="Delete a channel",
)
def delete_channel(channel_id: str) -> Dict[str, Any]:
    ok = channel_store.delete_channel(channel_id)
    if not ok:
        raise HTTPException(status_code=404, detail="channel not found")
    return {"data": {"id": channel_id, "deleted": True}}


@router.post(
    "/channels/{channel_id}/generate",
    summary="Instantly generate a video for this channel (ignores schedule)",
)
def generate_now(channel_id: str) -> Dict[str, Any]:
    """Trigger immediate video generation for a channel using its saved settings."""
    from app.models import const
    from app.models.schema import VideoParams
    from app.services import task as tm
    from app.services import state as sm

    ch = channel_store.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="channel not found")

    task_id = str(uuid.uuid4())
    sm.state.update_task(task_id, state=const.TASK_STATE_QUEUED, progress=0)

    params = VideoParams(
        video_subject=ch.get("niche") or ch.get("name") or "auto-generated video",
        channel_name=ch.get("name", ""),
        voice_name=ch.get("voice_name", ""),
        video_language=ch.get("language", "en"),
        video_source=ch.get("video_source", "pexels"),
        video_aspect=ch.get("video_aspect", "9:16"),
        video_concat_mode=ch.get("video_concat_mode", "random"),
        video_clip_duration=ch.get("clip_duration", 3),
        paragraph_number=ch.get("paragraph_number", 1),
        subtitle_enabled=bool(ch.get("subtitle_enabled", True)),
        subtitle_position=ch.get("subtitle_position", "bottom"),
        custom_system_prompt=ch.get("script_prompt", ""),
        llm_provider_override=ch.get("script_llm_provider", ""),
        llm_model_override=ch.get("script_llm_model", ""),
    )

    t = threading.Thread(
        target=tm.start,
        args=(task_id, params),
        daemon=True,
        name=f"manual-{task_id[:8]}",
    )
    t.start()

    return {"data": {"task_id": task_id, "channel_id": channel_id, "status": "started"}}
