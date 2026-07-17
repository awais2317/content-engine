"""
Product Content Generator - Orchestrates end-to-end product-driven video generation.

This module coordinates:
1. Product research
2. Image fetching
3. Scene planning
4. Video generation with structured scenes

Used when a channel has product_research_enabled=True
"""

import os
from typing import Dict, Any, Optional
from app.services import product_research, image_fetcher, scene_planner
from app.services.task import _generate_video_from_script
import json


def generate_product_review_video(
    channel_config: Dict[str, Any],
    query: str,
    video_type: str = "comparison",
    video_length: int = 60,
) -> Dict[str, Any]:
    """
    Generate a complete product review video using product intelligence pipeline.

    Args:
        channel_config: Channel settings with LLM and source preferences
        query: Product query (e.g., "top 5 couches 2026")
        video_type: Video type (comparison, top_n, deep_dive, single_product)
        video_length: Target video length in seconds

    Returns:
        {
            "status": "success",
            "video_path": "...",
            "metadata": {...},
            "pipeline_steps": {...}
        }
    """
    try:
        pipeline_steps = {}

        # Step 1: Research products
        research_result = product_research.research_products(
            query=query,
            count=5,
            provider_override=channel_config.get("product_research_llm_provider", ""),
            model_override=channel_config.get("product_research_llm_model", ""),
        )

        pipeline_steps["research"] = research_result

        if research_result.get("status") != "success":
            return {
                "status": "error",
                "step": "research",
                "message": research_result.get("message"),
            }

        # Step 2: Fetch images
        image_result = image_fetcher.batch_fetch_product_images(
            products=research_result.get("products", []),
            images_per_product=3,
        )

        pipeline_steps["images"] = image_result

        if image_result.get("status") != "success":
            return {
                "status": "error",
                "step": "images",
                "message": image_result.get("message"),
            }

        # Step 3: Plan scenes
        scene_result = scene_planner.plan_scenes(
            research_data=research_result,
            video_type=video_type,
            video_length_seconds=video_length,
            provider_override=channel_config.get("llm_provider_override", ""),
            model_override=channel_config.get("llm_model_override", ""),
        )

        pipeline_steps["scenes"] = scene_result

        if scene_result.get("status") != "success":
            return {
                "status": "error",
                "step": "scenes",
                "message": scene_result.get("message"),
            }

        # Step 4: Generate video from scene plan
        voice_script = _build_voice_script_from_scenes(scene_result.get("scenes", []))

        # Create video parameters from scene plan
        from app.models.schema import VideoParams

        video_params = VideoParams(
            video_subject=query,
            video_script=voice_script,
            video_aspect=channel_config.get("video_aspect", "9:16"),
            voice_name=channel_config.get("voice_name", ""),
            bgm_type=channel_config.get("bgm_type", "random"),
            channel_name=channel_config.get("name", ""),
            llm_provider_override=channel_config.get("llm_provider_override", ""),
            llm_model_override=channel_config.get("llm_model_override", ""),
            video_type=video_type,
            subtitle_enabled=channel_config.get("subtitle_enabled", True),
        )

        # Generate video (this uses existing pipeline)
        video_result = _generate_video_from_script(video_params)

        return {
            "status": "success",
            "video_path": video_result.get("video_path"),
            "query": query,
            "video_type": video_type,
            "pipeline_steps": pipeline_steps,
            "metadata": {
                "product_count": len(research_result.get("products", [])),
                "scene_count": len(scene_result.get("scenes", [])),
                "total_duration": scene_result.get("total_duration"),
            },
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Product review generation failed: {str(e)}",
        }


def _build_voice_script_from_scenes(scenes: list) -> str:
    """
    Combine voice scripts from all scenes into one continuous script.

    Args:
        scenes: List of scene dicts from scene_planner.plan_scenes()

    Returns:
        Concatenated voice script
    """
    scripts = []
    for scene in scenes:
        voice_script = scene.get("voice_script", "")
        if voice_script:
            scripts.append(voice_script)

    return "\n\n".join(scripts)


def generate_batch_product_reviews(
    channel_config: Dict[str, Any],
    queries: list,
    video_type: str = "comparison",
    batch_size: int = 5,
) -> Dict[str, Any]:
    """
    Generate multiple product review videos in batch.

    Args:
        channel_config: Channel settings
        queries: List of product queries
        video_type: Video type
        batch_size: Process N videos in parallel

    Returns:
        {
            "status": "success",
            "total": 5,
            "successful": 5,
            "failed": 0,
            "videos": [...]
        }
    """
    import threading

    results = []
    lock = threading.Lock()

    def _generate_wrapper(query: str):
        try:
            result = generate_product_review_video(
                channel_config=channel_config,
                query=query,
                video_type=video_type,
            )
            with lock:
                results.append(result)
        except Exception as e:
            with lock:
                results.append({"status": "error", "query": query, "message": str(e)})

    # Create threads for batch processing
    threads = []
    for query in queries[:batch_size]:
        t = threading.Thread(target=_generate_wrapper, args=(query,))
        threads.append(t)
        t.start()

    # Wait for all threads
    for t in threads:
        t.join()

    successful = sum(1 for r in results if r.get("status") == "success")
    failed = len(results) - successful

    return {
        "status": "success" if failed == 0 else "partial",
        "total": len(results),
        "successful": successful,
        "failed": failed,
        "videos": results,
    }
