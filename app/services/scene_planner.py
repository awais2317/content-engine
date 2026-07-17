"""
Scene Planner - Convert product research into structured video scenes.

Takes research data and video type, then uses LLM to structure the video
into scenes with voice scripts, timing, and visual assignments.
"""

import json
from typing import List, Dict, Any
from app.services.llm import _generate_response


def plan_scenes(
    research_data: Dict[str, Any],
    video_type: str = "comparison",
    video_length_seconds: int = 60,
    provider_override: str = "",
    model_override: str = "",
) -> Dict[str, Any]:
    """
    Plan video scenes based on product research and video type.

    Args:
        research_data: Output from product_research.research_products()
        video_type: "comparison", "top_n", "deep_dive", "single_product"
        video_length_seconds: Target video length
        provider_override: Override LLM provider
        model_override: Override LLM model

    Returns:
        {
            "status": "success",
            "video_type": "comparison",
            "total_duration": 60,
            "scenes": [
                {
                    "scene_id": 1,
                    "type": "intro",
                    "duration": 10,
                    "title": "Hook",
                    "voice_script": "...",
                    "visual_description": "...",
                    "motion_type": "zoom",
                    "products_featured": []
                }
            ]
        }
    """
    try:
        products = research_data.get("products", [])
        if not products:
            return {
                "status": "error",
                "message": "No products in research data",
            }

        query = research_data.get("query", "products")

        # Build prompt based on video type
        prompt = _build_scene_planning_prompt(
            products=products,
            query=query,
            video_type=video_type,
            target_length=video_length_seconds,
        )

        response_text = _generate_response(
            prompt,
            provider_override=provider_override,
            model_override=model_override,
        )

        # Parse JSON from response
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1

        if json_start == -1 or json_end <= json_start:
            return {
                "status": "error",
                "message": "LLM response did not contain valid JSON",
            }

        json_str = response_text[json_start:json_end]
        scene_data = json.loads(json_str)

        # Calculate total duration from scenes
        total_duration = sum(scene.get("duration", 0) for scene in scene_data.get("scenes", []))

        return {
            "status": "success",
            "video_type": video_type,
            "query": query,
            "total_duration": total_duration,
            "target_duration": video_length_seconds,
            "scene_count": len(scene_data.get("scenes", [])),
            "scenes": scene_data.get("scenes", []),
        }

    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "message": f"Failed to parse scene JSON: {str(e)}",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Scene planning failed: {str(e)}",
        }


def _build_scene_planning_prompt(
    products: List[Dict[str, Any]],
    query: str,
    video_type: str,
    target_length: int,
) -> str:
    """Build LLM prompt for scene planning."""

    products_json = json.dumps(products, indent=2)

    type_instructions = {
        "comparison": """
For a comparison video:
- Intro hook scene that establishes the topic
- Individual product showcase scenes (visual + description)
- Direct comparison scenes highlighting differences
- Final recommendation/verdict scene
Structure to be engaging and educational.
""",
        "top_n": """
For a top-N video:
- Strong hook introducing the ranking
- Countdown scenes (each product in rank order)
- Each product gets visual showcase + key highlights
- Final recommendation and call-to-action
Make it feel like a legitimate ranking with clear reasoning.
""",
        "deep_dive": """
For a deep-dive review:
- Hook introducing the single product
- Feature breakdown (visuals for each key feature)
- Pros/cons discussion with product visuals
- Personal assessment and verdict
- Closing with where to buy
Keep it thorough but engaging.
""",
        "single_product": """
For a single product showcase:
- Quick hook (5-10 sec)
- Product overview with multiple angles
- Key features highlighted with visuals
- Perfect for / best use case
- Call-to-action
Keep it snappy and persuasive.
""",
    }

    instructions = type_instructions.get(video_type, type_instructions["comparison"])

    prompt = f"""
You are a video scene planner. Analyze these products and create a detailed scene breakdown for a {video_type} video.

Query: {query}
Target video length: {target_length} seconds

Products to feature:
{products_json}

Video type guidelines:
{instructions}

Plan scenes that are:
1. Engaging and structured
2. Have clear voice-over scripts
3. Assign specific products to scenes
4. Include motion types (zoom, pan, fade, parallax)
5. Fit within the target length

Return ONLY valid JSON in this exact format:
{{
    "scenes": [
        {{
            "scene_id": 1,
            "type": "intro",
            "duration": 10,
            "title": "Hook Title",
            "voice_script": "Your opening hook here...",
            "visual_description": "What visuals should appear",
            "motion_type": "zoom",
            "products_featured": [1],
            "notes": "Additional production notes"
        }},
        {{
            "scene_id": 2,
            "type": "product",
            "duration": 15,
            "title": "Product 1 Showcase",
            "voice_script": "Tell me about product 1...",
            "visual_description": "Product images with parallax effect",
            "motion_type": "parallax",
            "products_featured": [1],
            "notes": ""
        }}
    ]
}}

Make the JSON valid and parseable. Ensure all durations add up to approximately {target_length} seconds.
"""

    return prompt


def get_scene_visuals(
    scene: Dict[str, Any],
    products_with_images: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Retrieve visual assets for a specific scene.

    Args:
        scene: Scene dict from plan_scenes()
        products_with_images: Output from image_fetcher.batch_fetch_product_images()

    Returns:
        {
            "scene_id": 1,
            "images": [{"url": "...", "alt": "..."}],
            "video_clips": [...]
        }
    """
    scene_id = scene.get("scene_id")
    products_featured = scene.get("products_featured", [])

    images = []

    # Collect images for products featured in this scene
    for product_idx in products_featured:
        for prod in products_with_images.get("products_with_images", []):
            # Match by product index (assuming order is preserved)
            product_images = prod.get("images", [])
            if product_images:
                images.extend(product_images)

    return {
        "scene_id": scene_id,
        "scene_type": scene.get("type"),
        "images": images,
        "visual_description": scene.get("visual_description"),
        "motion_type": scene.get("motion_type"),
    }


def validate_scene_plan(scene_plan: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate scene plan for consistency and completeness.

    Returns validation report with warnings/errors.
    """
    issues = []
    warnings = []

    scenes = scene_plan.get("scenes", [])

    if not scenes:
        issues.append("No scenes found in plan")

    total_duration = sum(s.get("duration", 0) for s in scenes)
    target_duration = scene_plan.get("target_duration", 60)

    duration_diff = abs(total_duration - target_duration)
    if duration_diff > 5:
        warnings.append(
            f"Scene total duration ({total_duration}s) differs from target ({target_duration}s) by {duration_diff}s"
        )

    # Check for missing voice scripts
    for scene in scenes:
        if not scene.get("voice_script"):
            issues.append(f"Scene {scene.get('scene_id')} missing voice_script")

        if not scene.get("visual_description"):
            warnings.append(f"Scene {scene.get('scene_id')} missing visual_description")

    return {
        "is_valid": len(issues) == 0,
        "issues": issues,
        "warnings": warnings,
        "total_scenes": len(scenes),
        "total_duration": total_duration,
    }
