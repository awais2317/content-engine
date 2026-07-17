"""
Product Intelligence API Endpoints

Routes for product research, image fetching, and scene planning.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from app.services import product_research, image_fetcher, scene_planner

router = APIRouter(prefix="/api/v1/content", tags=["Product Intelligence"])


@router.post("/research-products")
async def research_products_endpoint(
    query: str = Query(..., min_length=1, max_length=500),
    count: int = Query(5, ge=1, le=20),
    provider: Optional[str] = Query(""),
    model: Optional[str] = Query(""),
) -> Dict[str, Any]:
    """
    Research products using LLM.

    Args:
        query: Product query (e.g., "top 5 cloud couches 2026")
        count: Number of products to research
        provider: Override LLM provider
        model: Override LLM model

    Returns:
        Structured product data with specs, pros, cons, pricing
    """
    try:
        result = product_research.research_products(
            query=query,
            count=count,
            provider_override=provider,
            model_override=model,
        )

        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-images")
async def fetch_images_endpoint(
    search_query: str = Query(..., min_length=1, max_length=200),
    count: int = Query(5, ge=1, le=20),
) -> Dict[str, Any]:
    """
    Fetch product images for a search query.

    Uses DuckDuckGo with Pexels fallback.

    Args:
        search_query: Product name or query
        count: Number of images

    Returns:
        List of image URLs with metadata
    """
    try:
        result = image_fetcher.fetch_product_images(
            search_query=search_query,
            count=count,
            fallback_to_generic=True,
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-fetch-images")
async def batch_fetch_images_endpoint(
    products: List[Dict[str, Any]],
    images_per_product: int = Query(3, ge=1, le=10),
) -> Dict[str, Any]:
    """
    Batch fetch images for multiple products.

    Args:
        products: List of product dicts from research endpoint
        images_per_product: Images per product

    Returns:
        Products with images attached
    """
    try:
        result = image_fetcher.batch_fetch_product_images(
            products=products,
            images_per_product=images_per_product,
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plan-scenes")
async def plan_scenes_endpoint(
    research_data: Dict[str, Any],
    video_type: str = Query("comparison"),
    video_length: int = Query(60, ge=15, le=300),
    provider: Optional[str] = Query(""),
    model: Optional[str] = Query(""),
) -> Dict[str, Any]:
    """
    Plan video scenes based on product research.

    Args:
        research_data: Output from research-products endpoint
        video_type: "comparison", "top_n", "deep_dive", "single_product"
        video_length: Target video length in seconds
        provider: Override LLM provider
        model: Override LLM model

    Returns:
        Scene structure with voice scripts, timing, and visuals
    """
    try:
        result = scene_planner.plan_scenes(
            research_data=research_data,
            video_type=video_type,
            video_length_seconds=video_length,
            provider_override=provider,
            model_override=model,
        )

        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))

        # Validate the scene plan
        validation = scene_planner.validate_scene_plan(result)
        result["validation"] = validation

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-scene-plan")
async def validate_scene_plan_endpoint(
    scene_plan: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate a scene plan for consistency.

    Returns:
        Validation report with warnings/errors
    """
    try:
        validation = scene_planner.validate_scene_plan(scene_plan)
        return validation

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end-to-end-content-pipeline")
async def end_to_end_pipeline(
    query: str = Query(..., min_length=1, max_length=500),
    video_type: str = Query("comparison"),
    video_length: int = Query(60, ge=15, le=300),
    product_count: int = Query(5, ge=1, le=20),
    images_per_product: int = Query(3, ge=1, le=10),
    research_provider: Optional[str] = Query(""),
    research_model: Optional[str] = Query(""),
    planning_provider: Optional[str] = Query(""),
    planning_model: Optional[str] = Query(""),
) -> Dict[str, Any]:
    """
    Complete end-to-end pipeline: research → fetch images → plan scenes.

    This is a convenience endpoint that runs all three steps in sequence.

    Args:
        query: Product query
        video_type: Video type
        video_length: Target length
        product_count: Number of products to research
        images_per_product: Images per product
        research_provider: LLM provider for research
        research_model: LLM model for research
        planning_provider: LLM provider for planning
        planning_model: LLM model for planning

    Returns:
        Complete pipeline output with research, images, and scenes
    """
    try:
        # Step 1: Research products
        research_result = product_research.research_products(
            query=query,
            count=product_count,
            provider_override=research_provider,
            model_override=research_model,
        )

        if research_result.get("status") == "error":
            return {"status": "error", "step": "research", "message": research_result.get("message")}

        # Step 2: Fetch images
        image_result = image_fetcher.batch_fetch_product_images(
            products=research_result.get("products", []),
            images_per_product=images_per_product,
        )

        # Step 3: Plan scenes
        scene_result = scene_planner.plan_scenes(
            research_data=research_result,
            video_type=video_type,
            video_length_seconds=video_length,
            provider_override=planning_provider,
            model_override=planning_model,
        )

        if scene_result.get("status") == "error":
            return {"status": "error", "step": "planning", "message": scene_result.get("message")}

        # Combine all results
        return {
            "status": "success",
            "query": query,
            "video_type": video_type,
            "pipeline": {
                "research": research_result,
                "images": image_result,
                "scenes": scene_result,
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
