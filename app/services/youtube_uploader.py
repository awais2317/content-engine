"""
YouTube Auto-Upload Service

Integrates with YouTube Data API v3 to directly publish videos.
Handles OAuth authentication, metadata mapping, and scheduled publishing.

Required config.toml settings:
    [youtube]
    enabled = true
    api_key = "your-youtube-api-key"
    client_id = "your-client-id"
    client_secret = "your-client-secret"
    refresh_token = "your-refresh-token"  # Set via OAuth flow
"""

import os
import json
import time
from typing import Optional, Dict, Any
from pathlib import Path
from datetime import datetime
from loguru import logger

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload
except ImportError:
    logger.warning("Google API libraries not installed. Install with: pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client")

from app.config import config
from app.utils import utils


class YouTubeUploader:
    """Manages YouTube API interactions for video uploads and publishing."""

    def __init__(self):
        youtube_cfg = getattr(config, "_cfg", {}).get("youtube", {})
        self.enabled = bool(youtube_cfg.get("enabled", config.app.get("youtube_enabled", False)))
        self.api_key = os.getenv("YOUTUBE_API_KEY", youtube_cfg.get("api_key", config.app.get("youtube_api_key", ""))).strip()
        self.client_id = os.getenv("YOUTUBE_CLIENT_ID", youtube_cfg.get("client_id", config.app.get("youtube_client_id", ""))).strip()
        self.client_secret = os.getenv("YOUTUBE_CLIENT_SECRET", youtube_cfg.get("client_secret", config.app.get("youtube_client_secret", ""))).strip()
        self.refresh_token = os.getenv("YOUTUBE_REFRESH_TOKEN", youtube_cfg.get("refresh_token", config.app.get("youtube_refresh_token", ""))).strip()
        self.privacy_status = config.app.get(
            "youtube_privacy_status", youtube_cfg.get("privacy_status", "unlisted")
        )  # public, unlisted, private
        self.auto_publish = bool(youtube_cfg.get("auto_publish", config.app.get("youtube_auto_publish", False)))
        
        self.service = None
        self.credentials = None

        if self.enabled:
            self._initialize_service()

    def _initialize_service(self):
        """Initialize YouTube service with authentication."""
        try:
            if self.refresh_token:
                # Use refresh token for authentication
                self.credentials = self._get_credentials_from_refresh_token()
                if self.credentials:
                    self.service = build(
                        "youtube",
                        "v3",
                        credentials=self.credentials,
                        cache_discovery=False,
                    )
                    logger.info("YouTube service initialized with refresh token")
            else:
                logger.warning(
                    "YouTube enabled but no refresh_token configured. OAuth setup required."
                )

        except Exception as e:
            logger.error(f"Failed to initialize YouTube service: {e}")
            self.enabled = False

    def _get_credentials_from_refresh_token(self) -> Optional[Credentials]:
        """Get fresh credentials from refresh token."""
        try:
            creds_dict = {
                "type": "authorized_user",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
            }

            creds = Credentials.from_authorized_user_info(creds_dict)

            # Refresh to ensure valid access token
            request = Request()
            creds.refresh(request)

            return creds

        except Exception as e:
            logger.error(f"Failed to get credentials from refresh token: {e}")
            return None

    def is_enabled(self) -> bool:
        """Check if YouTube upload is properly configured."""
        return (
            self.enabled
            and bool(self.service)
            and bool(self.refresh_token)
        )

    def upload_video(
        self,
        video_path: str,
        title: str,
        description: str = "",
        tags: list = None,
        thumbnail_path: Optional[str] = None,
        publish_at: Optional[datetime] = None,
        privacy_status: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload a video to YouTube.

        Args:
            video_path: Path to the video file
            title: Video title
            description: Video description
            tags: List of tags/keywords
            thumbnail_path: Path to thumbnail image
            publish_at: Scheduled publish time (if not provided, publishes immediately)
            privacy_status: 'public', 'unlisted', or 'private'

        Returns:
            Video ID if successful, None otherwise
        """
        if not self.is_enabled():
            logger.warning("YouTube upload not enabled or configured")
            return None

        if not os.path.exists(video_path):
            logger.error(f"Video file not found: {video_path}")
            return None

        try:
            privacy_status = privacy_status or self.privacy_status
            tags = tags or []

            # Prepare metadata
            body = {
                "snippet": {
                    "title": title[:100],  # YouTube limit
                    "description": description[:5000],  # YouTube limit
                    "tags": tags[:500],
                    "categoryId": "22",  # People & Blogs category
                    "defaultLanguage": "en",
                    "defaultAudioLanguage": "en",
                },
                "status": {
                    "privacyStatus": privacy_status,
                    "selfDeclaredMadeForKids": False,
                },
            }

            # Set scheduling if provided
            if publish_at:
                body["status"]["publishAt"] = publish_at.isoformat() + "Z"

            # Prepare media upload
            media = MediaFileUpload(
                video_path,
                mimetype="video/mp4",
                chunksize=256 * 1024,  # 256KB chunks
                resumable=True,
            )

            # Execute upload request
            logger.info(f"Uploading video to YouTube: {title}")
            request = self.service.videos().insert(
                part="snippet,status",
                body=body,
                media_body=media,
            )

            response = None
            while response is None:
                try:
                    status, response = request.next_chunk()
                    if status:
                        progress = int(
                            status.progress() * 100
                        )
                        logger.debug(f"Upload progress: {progress}%")
                except HttpError as e:
                    logger.error(f"HTTP error during upload: {e}")
                    return None

            video_id = response.get("id")
            logger.success(f"Video uploaded successfully: {video_id}")

            # Upload thumbnail if provided
            if thumbnail_path and os.path.exists(thumbnail_path):
                self._set_thumbnail(video_id, thumbnail_path)

            return video_id

        except HttpError as e:
            logger.error(f"YouTube API error: {e}")
            return None
        except Exception as e:
            logger.error(f"Error uploading video: {e}")
            return None

    def _set_thumbnail(self, video_id: str, thumbnail_path: str) -> bool:
        """
        Set custom thumbnail for a video.

        Args:
            video_id: YouTube video ID
            thumbnail_path: Path to thumbnail image

        Returns:
            True if successful, False otherwise
        """
        try:
            media = MediaFileUpload(
                thumbnail_path,
                mimetype="image/jpeg",
            )

            self.service.thumbnails().set(
                videoId=video_id,
                media_body=media,
            ).execute()

            logger.info(f"Thumbnail set for video {video_id}")
            return True

        except HttpError as e:
            logger.warning(f"Failed to set thumbnail: {e}")
            return False
        except Exception as e:
            logger.warning(f"Error setting thumbnail: {e}")
            return False

    def get_video_status(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get status information about a video."""
        try:
            request = self.service.videos().list(
                part="status,statistics",
                id=video_id,
            )
            response = request.execute()

            if response.get("items"):
                video = response["items"][0]
                return {
                    "status": video.get("status", {}).get("privacyStatus"),
                    "views": video.get("statistics", {}).get("viewCount", 0),
                    "likes": video.get("statistics", {}).get("likeCount", 0),
                    "comments": video.get("statistics", {}).get("commentCount", 0),
                }

            return None

        except Exception as e:
            logger.error(f"Error getting video status: {e}")
            return None

    def add_to_playlist(self, video_id: str, playlist_id: str) -> bool:
        """Add a video to a playlist."""
        try:
            body = {
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {
                        "kind": "youtube#video",
                        "videoId": video_id,
                    },
                }
            }

            self.service.playlistItems().insert(
                part="snippet",
                body=body,
            ).execute()

            logger.info(f"Video {video_id} added to playlist {playlist_id}")
            return True

        except Exception as e:
            logger.warning(f"Failed to add video to playlist: {e}")
            return False

    def setup_oauth(self, credentials_file: str = "oauth_credentials.json"):
        """
        Interactive OAuth setup for YouTube credentials.

        This should be run once to generate and store the refresh token.

        Args:
            credentials_file: Path to store OAuth credentials
        """
        try:
            SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

            flow = InstalledAppFlow.from_client_secrets_file(
                credentials_file,
                SCOPES,
            )

            creds = flow.run_local_server(port=0)

            # Extract refresh token
            refresh_token = creds.refresh_token
            logger.info(f"Refresh token: {refresh_token}")
            logger.info(
                "Add this to your config.toml: [youtube] refresh_token = '...'"
            )

            return refresh_token

        except Exception as e:
            logger.error(f"OAuth setup failed: {e}")
            return None


# Global instance
_youtube_uploader = None


def get_youtube_uploader() -> YouTubeUploader:
    """Get or create the global YouTube uploader instance."""
    global _youtube_uploader
    if _youtube_uploader is None:
        _youtube_uploader = YouTubeUploader()
    return _youtube_uploader


def upload_video(
    video_path: str,
    title: str,
    description: str = "",
    tags: list = None,
    thumbnail_path: Optional[str] = None,
) -> Optional[str]:
    """
    Convenience function to upload a video to YouTube.

    Args:
        video_path: Path to the video file
        title: Video title
        description: Video description
        tags: List of tags
        thumbnail_path: Path to thumbnail

    Returns:
        YouTube video ID if successful, None otherwise
    """
    uploader = get_youtube_uploader()
    return uploader.upload_video(
        video_path=video_path,
        title=title,
        description=description,
        tags=tags,
        thumbnail_path=thumbnail_path,
    )
