"""
HeyGen Avatar Video Generator

Integrates with HeyGen API to generate talking head intro videos.
Uses HeyGen's AI avatars to create professional-looking intro clips.

Required config.toml settings:
    [heygen]
    api_key = "your-heygen-api-key"
    enabled = true
    default_avatar = "amanda-en"  # Avatar ID
    default_voice = "en-US-SarahNeural"  # Voice ID
    video_duration = 15  # Seconds (max 60)
"""

import json
import os
import time
import requests
from typing import Optional, Dict, Any
from pathlib import Path
from loguru import logger

from app.config import config
from app.utils import utils


class HeyGenAvatarGenerator:
    """Manages HeyGen API interactions for avatar video generation."""

    def __init__(self):
        heygen_cfg = getattr(config, "_cfg", {}).get("heygen", {})
        self.api_key = os.getenv("HEYGEN_API_KEY", heygen_cfg.get("api_key", config.app.get("heygen_api_key", ""))).strip()
        self.enabled = bool(heygen_cfg.get("enabled", config.app.get("heygen_enabled", False)))
        self.base_url = "https://api.heygen.com/v1"
        self.default_avatar = heygen_cfg.get("default_avatar", config.app.get("heygen_default_avatar", "amanda-en"))
        self.default_voice = heygen_cfg.get("default_voice", config.app.get("heygen_default_voice", "en-US-SarahNeural"))
        self.video_duration = heygen_cfg.get("video_duration", config.app.get("heygen_video_duration", 15))
        self.timeout = 60

        if not self.enabled:
            logger.warning("HeyGen is disabled in config")

    def is_enabled(self) -> bool:
        """Check if HeyGen is properly configured and enabled."""
        return self.enabled and bool(self.api_key)

    def _get_headers(self) -> Dict[str, str]:
        """Get authorization headers for HeyGen API."""
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def generate_avatar_video(
        self,
        script_text: str,
        avatar_id: Optional[str] = None,
        voice_id: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Generate an avatar video from a script.

        Args:
            script_text: The speech script for the avatar
            avatar_id: HeyGen avatar ID (uses default if not provided)
            voice_id: HeyGen voice ID (uses default if not provided)
            task_id: Optional task ID for organizing outputs

        Returns:
            Path to generated video file, or None if failed
        """
        if not self.is_enabled():
            logger.warning("HeyGen is not enabled or configured")
            return None

        avatar_id = avatar_id or self.default_avatar
        voice_id = voice_id or self.default_voice

        try:
            # Step 1: Create video generation job
            job_id = self._create_video_job(
                script_text=script_text,
                avatar_id=avatar_id,
                voice_id=voice_id,
            )

            if not job_id:
                logger.error("Failed to create HeyGen video job")
                return None

            logger.info(f"Created HeyGen job: {job_id}")

            # Step 2: Poll for completion
            video_url = self._wait_for_video_completion(job_id)

            if not video_url:
                logger.error(f"HeyGen video generation failed for job {job_id}")
                return None

            logger.info(f"HeyGen video generated: {video_url}")

            # Step 3: Download video
            output_file = self._download_video(
                video_url=video_url,
                task_id=task_id,
                job_id=job_id,
            )

            if output_file and os.path.exists(output_file):
                logger.success(f"Avatar video saved: {output_file}")
                return output_file
            else:
                logger.error("Failed to download HeyGen video")
                return None

        except Exception as e:
            logger.error(f"Error generating avatar video: {e}")
            return None

    def _create_video_job(
        self,
        script_text: str,
        avatar_id: str,
        voice_id: str,
    ) -> Optional[str]:
        """Create a video generation job via HeyGen API."""
        try:
            # Prepare API payload
            payload = {
                "video_inputs": [
                    {
                        "character": {
                            "type": "avatar",
                            "avatar_id": avatar_id,
                        },
                        "voice": {
                            "type": "text",
                            "input_text": script_text,
                            "voice_id": voice_id,
                        },
                        "background": {
                            "type": "color",
                            "color": "#FFFFFF",
                        },
                    }
                ],
                "quality": "1080p",
                "aspect_ratio": "9:16",  # Vertical for social media
                "output_format": "mp4",
            }

            url = f"{self.base_url}/video_generate"
            response = requests.post(
                url=url,
                headers=self._get_headers(),
                json=payload,
                timeout=self.timeout,
            )

            if response.status_code == 200:
                result = response.json()
                job_id = result.get("data", {}).get("job_id")
                return job_id
            else:
                logger.error(
                    f"HeyGen API error ({response.status_code}): {response.text}"
                )
                return None

        except Exception as e:
            logger.error(f"Error creating HeyGen job: {e}")
            return None

    def _wait_for_video_completion(
        self,
        job_id: str,
        max_attempts: int = 60,
        poll_interval: int = 2,
    ) -> Optional[str]:
        """
        Poll HeyGen API until video is ready.

        Args:
            job_id: The HeyGen job ID
            max_attempts: Maximum polling attempts (60 * 2s = 2 minutes default)
            poll_interval: Seconds between polls

        Returns:
            Video URL if successful, None otherwise
        """
        try:
            url = f"{self.base_url}/video_status"

            for attempt in range(max_attempts):
                response = requests.get(
                    url=url,
                    headers=self._get_headers(),
                    params={"job_id": job_id},
                    timeout=self.timeout,
                )

                if response.status_code == 200:
                    result = response.json()
                    data = result.get("data", {})
                    status = data.get("status")

                    if status == "completed":
                        video_url = data.get("video_url")
                        return video_url

                    elif status == "failed":
                        logger.error(
                            f"HeyGen job {job_id} failed: {data.get('error_message')}"
                        )
                        return None

                    elif status == "processing":
                        logger.debug(
                            f"HeyGen job {job_id} processing... (attempt {attempt + 1}/{max_attempts})"
                        )
                        time.sleep(poll_interval)

                else:
                    logger.warning(
                        f"HeyGen status check failed ({response.status_code})"
                    )
                    time.sleep(poll_interval)

            logger.error(f"HeyGen job {job_id} timed out after {max_attempts} attempts")
            return None

        except Exception as e:
            logger.error(f"Error polling HeyGen status: {e}")
            return None

    def _download_video(
        self,
        video_url: str,
        task_id: Optional[str] = None,
        job_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Download video from HeyGen URL to local file.

        Args:
            video_url: The HeyGen video URL
            task_id: Optional task ID for organizing in output directory
            job_id: Optional job ID to use in filename

        Returns:
            Path to downloaded file, or None if failed
        """
        try:
            # Determine output directory
            if task_id:
                output_dir = utils.task_dir(task_id)
            else:
                output_dir = Path(utils.task_dir("avatar-cache"))
                output_dir.mkdir(parents=True, exist_ok=True)

            # Generate filename
            if job_id:
                filename = f"avatar-{job_id}.mp4"
            else:
                filename = f"avatar-{int(time.time())}.mp4"

            output_file = os.path.join(output_dir, filename)

            # Download video
            response = requests.get(video_url, timeout=300, stream=True)

            if response.status_code == 200:
                with open(output_file, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)

                logger.info(f"Downloaded avatar video: {output_file}")
                return output_file
            else:
                logger.error(f"Failed to download video ({response.status_code})")
                return None

        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            return None

    def get_available_avatars(self) -> Optional[list]:
        """
        Fetch list of available avatars from HeyGen API.

        Returns:
            List of avatar objects, or None if failed
        """
        if not self.is_enabled():
            return None

        try:
            url = f"{self.base_url}/avatar_list"
            response = requests.get(
                url=url,
                headers=self._get_headers(),
                timeout=self.timeout,
            )

            if response.status_code == 200:
                result = response.json()
                avatars = result.get("data", {}).get("avatars", [])
                return avatars
            else:
                logger.warning(
                    f"Failed to fetch avatars ({response.status_code})"
                )
                return None

        except Exception as e:
            logger.error(f"Error fetching avatars: {e}")
            return None

    def get_available_voices(self) -> Optional[list]:
        """
        Fetch list of available voices from HeyGen API.

        Returns:
            List of voice objects, or None if failed
        """
        if not self.is_enabled():
            return None

        try:
            url = f"{self.base_url}/voice_list"
            response = requests.get(
                url=url,
                headers=self._get_headers(),
                timeout=self.timeout,
            )

            if response.status_code == 200:
                result = response.json()
                voices = result.get("data", {}).get("voices", [])
                return voices
            else:
                logger.warning(
                    f"Failed to fetch voices ({response.status_code})"
                )
                return None

        except Exception as e:
            logger.error(f"Error fetching voices: {e}")
            return None


# Global instance
_avatar_generator = None


def get_avatar_generator() -> HeyGenAvatarGenerator:
    """Get or create the global HeyGen avatar generator instance."""
    global _avatar_generator
    if _avatar_generator is None:
        _avatar_generator = HeyGenAvatarGenerator()
    return _avatar_generator


def generate_avatar_video(
    script_text: str,
    task_id: Optional[str] = None,
    avatar_id: Optional[str] = None,
    voice_id: Optional[str] = None,
) -> Optional[str]:
    """
    Convenience function to generate an avatar video.

    Args:
        script_text: The speech script
        task_id: Optional task ID for organizing output
        avatar_id: Optional avatar ID override
        voice_id: Optional voice ID override

    Returns:
        Path to generated video file, or None if failed
    """
    generator = get_avatar_generator()
    return generator.generate_avatar_video(
        script_text=script_text,
        avatar_id=avatar_id,
        voice_id=voice_id,
        task_id=task_id,
    )
