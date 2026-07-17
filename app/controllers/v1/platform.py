"""
API endpoints for Phase 1 features:
- HeyGen Avatar Integration
- YouTube Auto-Upload
- Analytics Dashboard
"""

from fastapi import APIRouter, HTTPException
from loguru import logger
from typing import Optional, Dict, Any

from app.models.schema import VideoParams
from app.services import avatar_generator, youtube_uploader, analytics


router = APIRouter(prefix="/api/v1/platform", tags=["platform"])


# ==================== AVATAR ENDPOINTS ====================

@router.post("/avatar/generate")
async def generate_avatar(
    script: str,
    avatar_id: Optional[str] = None,
    voice_id: Optional[str] = None,
):
    """
    Generate a talking head avatar video.
    
    Args:
        script: The speech script for the avatar
        avatar_id: Optional HeyGen avatar ID
        voice_id: Optional HeyGen voice ID
        
    Returns:
        Video file path and metadata
    """
    try:
        generator = avatar_generator.get_avatar_generator()
        
        if not generator.is_enabled():
            raise HTTPException(
                status_code=400,
                detail="HeyGen is not enabled or configured"
            )
        
        video_path = generator.generate_avatar_video(
            script_text=script,
            avatar_id=avatar_id,
            voice_id=voice_id,
        )
        
        if not video_path:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate avatar video"
            )
        
        return {
            "status": "success",
            "video_path": video_path,
            "message": "Avatar video generated successfully"
        }
        
    except Exception as e:
        logger.error(f"Error generating avatar: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avatar/avatars")
async def list_avatars():
    """List available HeyGen avatars."""
    try:
        generator = avatar_generator.get_avatar_generator()
        
        if not generator.is_enabled():
            raise HTTPException(
                status_code=400,
                detail="HeyGen is not enabled"
            )
        
        avatars = generator.get_available_avatars()
        
        return {
            "status": "success",
            "avatars": avatars or [],
            "count": len(avatars) if avatars else 0
        }
        
    except Exception as e:
        logger.error(f"Error listing avatars: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avatar/voices")
async def list_voices():
    """List available HeyGen voices."""
    try:
        generator = avatar_generator.get_avatar_generator()
        
        if not generator.is_enabled():
            raise HTTPException(
                status_code=400,
                detail="HeyGen is not enabled"
            )
        
        voices = generator.get_available_voices()
        
        return {
            "status": "success",
            "voices": voices or [],
            "count": len(voices) if voices else 0
        }
        
    except Exception as e:
        logger.error(f"Error listing voices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== YOUTUBE ENDPOINTS ====================

@router.post("/youtube/upload")
async def upload_to_youtube(
    video_path: str,
    title: str,
    description: Optional[str] = "",
    tags: Optional[list] = None,
    thumbnail_path: Optional[str] = None,
    privacy_status: Optional[str] = None,
):
    """
    Upload a video to YouTube.
    
    Args:
        video_path: Path to the video file
        title: Video title
        description: Video description
        tags: List of tags
        thumbnail_path: Path to thumbnail
        privacy_status: 'public', 'unlisted', or 'private'
        
    Returns:
        YouTube video ID and metadata
    """
    try:
        uploader = youtube_uploader.get_youtube_uploader()
        
        if not uploader.is_enabled():
            raise HTTPException(
                status_code=400,
                detail="YouTube upload is not enabled or configured"
            )
        
        video_id = uploader.upload_video(
            video_path=video_path,
            title=title,
            description=description,
            tags=tags,
            thumbnail_path=thumbnail_path,
            privacy_status=privacy_status,
        )
        
        if not video_id:
            raise HTTPException(
                status_code=500,
                detail="Failed to upload video to YouTube"
            )
        
        return {
            "status": "success",
            "video_id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "message": "Video uploaded to YouTube successfully"
        }
        
    except Exception as e:
        logger.error(f"Error uploading to YouTube: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/youtube/status/{video_id}")
async def get_youtube_video_status(video_id: str):
    """Get YouTube video status and statistics."""
    try:
        uploader = youtube_uploader.get_youtube_uploader()
        
        if not uploader.is_enabled():
            raise HTTPException(
                status_code=400,
                detail="YouTube is not enabled"
            )
        
        status = uploader.get_video_status(video_id)
        
        if not status:
            raise HTTPException(
                status_code=404,
                detail=f"Video {video_id} not found"
            )
        
        return {
            "status": "success",
            "video_id": video_id,
            "data": status
        }
        
    except Exception as e:
        logger.error(f"Error getting YouTube status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANALYTICS ENDPOINTS ====================

@router.get("/analytics/dashboard")
async def get_analytics_dashboard():
    """Get analytics dashboard summary with all key metrics."""
    try:
        service = analytics.get_analytics_service()
        summary = service.get_dashboard_summary()
        
        return {
            "status": "success",
            "analytics": summary
        }
        
    except Exception as e:
        logger.error(f"Error getting analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/videos")
async def get_analytics_videos():
    """Get video generation statistics."""
    try:
        service = analytics.get_analytics_service()
        
        return {
            "status": "success",
            "data": {
                "total_30d": service.get_total_videos_generated(30),
                "total_7d": service.get_total_videos_generated(7),
                "by_channel": service.get_videos_by_channel(30),
                "success_rate_percent": round(service.get_generation_success_rate(30), 1),
                "video_stats": service.get_video_stats(),
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting video analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/storage")
async def get_analytics_storage():
    """Get storage usage and cost estimates."""
    try:
        service = analytics.get_analytics_service()
        
        return {
            "status": "success",
            "data": service.get_storage_stats()
        }
        
    except Exception as e:
        logger.error(f"Error getting storage analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/llm")
async def get_analytics_llm():
    """Get LLM provider usage distribution."""
    try:
        service = analytics.get_analytics_service()
        
        return {
            "status": "success",
            "data": service.get_llm_provider_distribution(30)
        }
        
    except Exception as e:
        logger.error(f"Error getting LLM analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/channel/{channel_id}")
async def get_channel_analytics(channel_id: str):
    """Get analytics for a specific channel."""
    try:
        service = analytics.get_analytics_service()
        
        data = service.get_channel_performance(channel_id)
        
        if not data:
            raise HTTPException(
                status_code=404,
                detail=f"Channel {channel_id} not found"
            )
        
        return {
            "status": "success",
            "data": data
        }
        
    except Exception as e:
        logger.error(f"Error getting channel analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/export")
async def export_analytics(format: str = "json"):
    """Export analytics data."""
    try:
        service = analytics.get_analytics_service()
        
        data = service.export_analytics(format=format)
        
        if not data:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format: {format}"
            )
        
        return {
            "status": "success",
            "format": format,
            "data": data
        }
        
    except Exception as e:
        logger.error(f"Error exporting analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
