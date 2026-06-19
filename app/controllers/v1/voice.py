"""
Voice utilities — preview synthesis so users can hear a voice before generating a full video.

Exposes:
    POST /api/v1/voice/preview   → returns audio/mpeg (mp3) bytes
"""

from __future__ import annotations

import os
import uuid
from typing import Optional

from fastapi import HTTPException
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel, Field

from app.controllers.v1.base import new_router
from app.services import voice as voice_service
from app.utils import utils

router = new_router()


class VoicePreviewRequest(BaseModel):
    voice_name: str = Field(..., min_length=1)
    text: Optional[str] = Field(
        default=None,
        description="Sample text. If omitted, a short default sentence is used.",
    )
    voice_rate: float = Field(default=1.0, ge=0.5, le=2.0)
    voice_volume: float = Field(default=1.0, ge=0.0, le=2.0)


_DEFAULT_TEXT = (
    "Hi there — this is a quick preview of how the selected voice will sound in your videos."
)


def _preview_dir() -> str:
    path = os.path.join(utils.storage_dir("temp"), "voice_preview")
    os.makedirs(path, exist_ok=True)
    return path


def _prune_old_previews(directory: str, keep_latest: int = 10) -> None:
    try:
        files = [
            os.path.join(directory, f)
            for f in os.listdir(directory)
            if f.lower().endswith(".mp3")
        ]
        files.sort(key=os.path.getmtime, reverse=True)
        for stale in files[keep_latest:]:
            try:
                os.remove(stale)
            except OSError:
                pass
    except OSError:
        pass


@router.post("/voice/preview", summary="Synthesize a short voice sample")
def preview_voice(body: VoicePreviewRequest):
    text = (body.text or _DEFAULT_TEXT).strip()
    if len(text) > 400:
        text = text[:400]

    directory = _preview_dir()
    out_path = os.path.join(directory, f"{uuid.uuid4().hex}.mp3")

    try:
        sub_maker = voice_service.tts(
            text=text,
            voice_name=body.voice_name,
            voice_rate=body.voice_rate,
            voice_volume=body.voice_volume,
            voice_file=out_path,
        )
    except Exception as exc:  # noqa: BLE001 — surface upstream provider errors
        logger.exception("voice preview failed")
        raise HTTPException(status_code=502, detail=f"TTS failed: {exc}") from exc

    if sub_maker is None or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        raise HTTPException(
            status_code=502,
            detail="TTS returned no audio — check that the voice name and API keys are valid.",
        )

    _prune_old_previews(directory)

    return FileResponse(
        out_path,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
