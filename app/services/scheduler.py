"""Lightweight background scheduler for channel auto-generation.

Runs a single daemon thread that wakes every 60 seconds, checks
which channels have their schedule due, and fires video generation
tasks for each.

No external dependencies — uses only stdlib threading + time.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from app.models.schema import VideoParams
from app.services import channel_store

# Avoid a circular import: import task lazily inside the function body
_lock = threading.Lock()
_thread: Optional[threading.Thread] = None
_running = False

DAY_ABBRS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # weekday() == 0..6


def _channel_is_due(channel: dict) -> bool:
    """Return True if this channel should generate right now (within this minute)."""
    if not channel.get("schedule_enabled"):
        return False

    schedule_time = (channel.get("schedule_time") or "").strip()  # "HH:MM"
    schedule_days = (channel.get("schedule_days") or "").strip()  # "mon,wed,fri"

    now = datetime.now()
    current_hhmm = now.strftime("%H:%M")

    # Check time window — must be within the current minute
    if schedule_time and schedule_time != current_hhmm:
        return False

    # Check day of week
    if schedule_days:
        allowed = [d.strip().lower() for d in schedule_days.split(",") if d.strip()]
        today = DAY_ABBRS[now.weekday()]
        if allowed and today not in allowed:
            return False

    return True


def _generate_for_channel(channel: dict) -> None:
    """Fire a background video generation task for the given channel."""
    from app.services import task as tm
    from app.services import state as sm
    from app.models import const

    videos_per_day = max(1, int(channel.get("videos_per_day") or 1))

    for _ in range(videos_per_day):
        task_id = str(uuid.uuid4())
        sm.state.update_task(task_id, state=const.TASK_STATE_QUEUED, progress=0)

        # Build VideoParams from channel settings
        params = VideoParams(
            video_subject=channel.get("niche") or channel.get("name") or "auto",
            channel_name=channel.get("name", ""),
            voice_name=channel.get("voice_name", ""),
            video_language=channel.get("language", "en"),
            video_source=channel.get("video_source", "pexels"),
            video_aspect=channel.get("video_aspect", "9:16"),
            video_concat_mode=channel.get("video_concat_mode", "random"),
            video_clip_duration=channel.get("clip_duration", 3),
            paragraph_number=channel.get("paragraph_number", 1),
            subtitle_enabled=bool(channel.get("subtitle_enabled", True)),
            subtitle_position=channel.get("subtitle_position", "bottom"),
            custom_system_prompt=channel.get("script_prompt", ""),
            llm_provider_override=channel.get("script_llm_provider", ""),
            llm_model_override=channel.get("script_llm_model", ""),
            avatar_enabled=bool(channel.get("avatar_enabled", False)),
            avatar_provider=channel.get("avatar_provider", ""),
            avatar_id=channel.get("avatar_id", ""),
            avatar_voice_id=channel.get("avatar_voice_id", ""),
            avatar_intro_script=channel.get("avatar_intro_script", ""),
            youtube_enabled=bool(channel.get("youtube_enabled", False)),
            youtube_privacy_status=channel.get("youtube_privacy_status", "unlisted"),
            youtube_playlist_id=channel.get("youtube_playlist_id", ""),
        )

        logger.info(
            f"[scheduler] starting auto task {task_id} for channel '{channel.get('name')}'"
        )
        t = threading.Thread(
            target=tm.start,
            args=(task_id, params),
            daemon=True,
            name=f"auto-{task_id[:8]}",
        )
        t.start()


def _scheduler_loop() -> None:
    global _running
    logger.info("[scheduler] background scheduler started")
    while _running:
        try:
            channels = channel_store.list_channels()
            for ch in channels:
                if _channel_is_due(ch):
                    logger.info(
                        f"[scheduler] channel '{ch.get('name')}' is due — generating"
                    )
                    _generate_for_channel(ch)
        except Exception as e:
            logger.error(f"[scheduler] error in loop: {e}")

        # Sleep 60 s in small increments so we can stop quickly
        for _ in range(60):
            if not _running:
                break
            time.sleep(1)

    logger.info("[scheduler] background scheduler stopped")


def start() -> None:
    global _thread, _running
    with _lock:
        if _running:
            return
        _running = True
        _thread = threading.Thread(
            target=_scheduler_loop, daemon=True, name="channel-scheduler"
        )
        _thread.start()


def stop() -> None:
    global _running
    with _lock:
        _running = False
