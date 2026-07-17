"""Analytics summary service for generated videos.

This service reads the artifacts the app already writes: ``script.json``,
``videos.json``, local MP4 files, and the existing manual metrics file at
``storage/analytics.json``. That keeps Phase 1 analytics useful without adding
new persistence requirements.
"""

from __future__ import annotations

import json
from pathlib import Path
from time import time
from typing import Any, Dict, List

from loguru import logger

from app.utils import utils


def _read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning(f"failed to read analytics source {path}: {exc}")
        return fallback


class AnalyticsService:
    """Builds dashboard-ready analytics from local task artifacts."""

    def __init__(self) -> None:
        self.tasks_root = Path(utils.task_dir())
        self.manual_metrics_path = Path(utils.storage_dir()) / "analytics.json"

    def _task_items(self) -> List[Dict[str, Any]]:
        if not self.tasks_root.exists():
            return []

        items: List[Dict[str, Any]] = []
        for task_dir in self.tasks_root.iterdir():
            if not task_dir.is_dir():
                continue

            script = _read_json(task_dir / "script.json", {})
            videos = _read_json(task_dir / "videos.json", {})
            s3_keys = videos.get("s3_keys") or []
            local_videos = list(task_dir.glob("final-*.mp4"))
            generated_count = max(len(s3_keys), len(local_videos))
            if generated_count == 0:
                continue

            params = script.get("params") or {}
            size_bytes = sum(p.stat().st_size for p in local_videos if p.exists())
            items.append(
                {
                    "task_id": task_dir.name,
                    "created_at": task_dir.stat().st_mtime,
                    "generated_count": generated_count,
                    "storage": "s3" if s3_keys else "local",
                    "size_bytes": size_bytes,
                    "subject": params.get("video_subject") or script.get("video_subject") or "",
                    "channel": params.get("channel_name") or "Uncategorized",
                    "llm_provider": params.get("llm_provider_override") or "default",
                    "llm_model": params.get("llm_model_override") or "default",
                    "video_type": params.get("video_type") or "generic",
                    "youtube_results": videos.get("youtube_results") or [],
                }
            )

        return items

    def _manual_metrics(self) -> List[Dict[str, Any]]:
        data = _read_json(self.manual_metrics_path, [])
        return data if isinstance(data, list) else []

    def get_total_videos_generated(self, days: int = 30) -> int:
        cutoff = time() - days * 86400
        return sum(
            item["generated_count"]
            for item in self._task_items()
            if item["created_at"] >= cutoff
        )

    def get_videos_by_channel(self, days: int = 30) -> Dict[str, int]:
        cutoff = time() - days * 86400
        counts: Dict[str, int] = {}
        for item in self._task_items():
            if item["created_at"] < cutoff:
                continue
            channel = item["channel"] or "Uncategorized"
            counts[channel] = counts.get(channel, 0) + item["generated_count"]
        return dict(sorted(counts.items(), key=lambda pair: pair[1], reverse=True))

    def get_generation_success_rate(self, days: int = 30) -> float:
        return 100.0 if self.get_total_videos_generated(days) else 0.0

    def get_storage_stats(self) -> Dict[str, Any]:
        items = self._task_items()
        total_local_bytes = sum(item["size_bytes"] for item in items)
        s3_video_count = sum(item["generated_count"] for item in items if item["storage"] == "s3")
        local_video_count = sum(item["generated_count"] for item in items if item["storage"] == "local")
        local_gb = total_local_bytes / (1024 * 1024 * 1024)
        return {
            "total_videos": s3_video_count + local_video_count,
            "s3_videos": s3_video_count,
            "local_videos": local_video_count,
            "known_local_size_gb": round(local_gb, 3),
            "estimated_local_monthly_cost_usd": round(local_gb * 0.023, 3),
        }

    def get_llm_provider_distribution(self, days: int = 30) -> Dict[str, int]:
        cutoff = time() - days * 86400
        counts: Dict[str, int] = {}
        for item in self._task_items():
            if item["created_at"] < cutoff:
                continue
            provider = item["llm_provider"] or "default"
            counts[provider] = counts.get(provider, 0) + item["generated_count"]
        return dict(sorted(counts.items(), key=lambda pair: pair[1], reverse=True))

    def get_video_stats(self) -> Dict[str, Any]:
        items = self._task_items()
        return {
            "total_tasks_with_outputs": len(items),
            "total_videos": sum(item["generated_count"] for item in items),
            "video_types": self._count_by(items, "video_type"),
            "youtube_uploads": sum(
                1
                for item in items
                for result in item.get("youtube_results", [])
                if result.get("success")
            ),
        }

    def get_channel_performance(self, channel_id: str) -> Dict[str, Any]:
        items = [item for item in self._task_items() if item["channel"] == channel_id]
        if not items:
            return {}
        return {
            "channel_name": channel_id,
            "total_videos": sum(item["generated_count"] for item in items),
            "video_types": self._count_by(items, "video_type"),
        }

    def get_manual_metrics_summary(self) -> Dict[str, Any]:
        entries = self._manual_metrics()
        return {
            "entries": len(entries),
            "views": sum(int(entry.get("views") or 0) for entry in entries),
            "likes": sum(int(entry.get("likes") or 0) for entry in entries),
            "comments": sum(int(entry.get("comments") or 0) for entry in entries),
            "shares": sum(int(entry.get("shares") or 0) for entry in entries),
        }

    def get_dashboard_summary(self) -> Dict[str, Any]:
        return {
            "total_videos_30d": self.get_total_videos_generated(30),
            "total_videos_7d": self.get_total_videos_generated(7),
            "total_videos_all_time": self.get_total_videos_generated(36500),
            "videos_by_channel": self.get_videos_by_channel(30),
            "success_rate_percent": round(self.get_generation_success_rate(30), 1),
            "storage_stats": self.get_storage_stats(),
            "llm_distribution": self.get_llm_provider_distribution(30),
            "video_stats": self.get_video_stats(),
            "manual_metrics": self.get_manual_metrics_summary(),
        }

    def export_analytics(self, format: str = "json") -> str | None:
        if format != "json":
            return None
        return json.dumps(self.get_dashboard_summary(), indent=2)

    @staticmethod
    def _count_by(items: List[Dict[str, Any]], key: str) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for item in items:
            value = item.get(key) or "unknown"
            counts[value] = counts.get(value, 0) + item.get("generated_count", 1)
        return dict(sorted(counts.items(), key=lambda pair: pair[1], reverse=True))


_analytics_service: AnalyticsService | None = None


def get_analytics_service() -> AnalyticsService:
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService()
    return _analytics_service


def get_dashboard_summary() -> Dict[str, Any]:
    return get_analytics_service().get_dashboard_summary()