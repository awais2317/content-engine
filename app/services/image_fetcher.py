"""
Image Fetcher - Retrieve product images from DuckDuckGo and fallback sources.

Uses DuckDuckGo (no API key required) to search for product images,
with fallback to generic stock footage (Pexels).
"""

import requests
from typing import List, Dict, Any, Optional
from urllib.parse import quote
import json


def fetch_product_images(
    search_query: str,
    count: int = 5,
    fallback_to_generic: bool = True,
) -> Dict[str, Any]:
    """
    Fetch product images for a search query using DuckDuckGo.

    Args:
        search_query: Product name/query (e.g., "Cloud Couch")
        count: Number of images to fetch
        fallback_to_generic: If product search fails, use generic stock footage

    Returns:
        {
            "status": "success",
            "query": "...",
            "source": "duckduckgo",
            "images": [
                {"url": "...", "alt": "..."}
            ],
            "count": 3
        }
    """
    try:
        # Try DuckDuckGo image search
        image_urls = _search_duckduckgo_images(search_query, count)

        if image_urls:
            return {
                "status": "success",
                "query": search_query,
                "source": "duckduckgo",
                "images": [{"url": url, "alt": search_query} for url in image_urls],
                "count": len(image_urls),
            }

        # Fallback to generic stock footage if product search fails
        if fallback_to_generic:
            generic_images = _get_pexels_images(search_query, count)
            if generic_images:
                return {
                    "status": "success",
                    "query": search_query,
                    "source": "pexels_fallback",
                    "images": generic_images,
                    "count": len(generic_images),
                    "note": "Product-specific images unavailable, using generic stock footage",
                }

        return {
            "status": "warning",
            "query": search_query,
            "images": [],
            "message": "No images found for this product",
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Image fetching failed: {str(e)}",
        }


def _search_duckduckgo_images(
    search_query: str, count: int = 5
) -> List[str]:
    """
    Search DuckDuckGo for images.

    Note: DuckDuckGo doesn't have an official API, so this uses
    a lightweight request-based approach. For production, consider:
    - Using Bing Image Search API (free tier)
    - Using Google Custom Search (with image search enabled)
    """
    try:
        # DuckDuckGo API endpoint
        url = "https://api.duckduckgo.com/"
        params = {
            "q": f"{search_query} product review",
            "format": "json",
            "kp": 1,
        }

        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()

        data = response.json()

        # Extract image URLs from related searches and results
        image_urls = []

        # Try to get images from related topics
        for topic in data.get("RelatedTopics", [])[:count]:
            if "Image" in topic:
                image_urls.append(topic["Image"])

        # Alternative: Use text results to construct image search URLs
        if not image_urls:
            # Return search-able URLs for fallback
            encoded_query = quote(search_query)
            image_urls = [
                f"https://duckduckgo.com/?q={encoded_query}&iax=images&ia=images&atb=v1"
            ]

        return image_urls[:count]

    except Exception as e:
        print(f"DuckDuckGo image search failed: {e}")
        return []


def _get_pexels_images(search_query: str, count: int = 3) -> List[Dict[str, str]]:
    """
    Get generic stock footage from Pexels as fallback.

    This is a simplified version - your existing Pexels integration
    can be reused here.
    """
    try:
        # Use your existing Pexels API key from config
        from app.services.broll import _search_pexels

        results = _search_pexels(search_query, count)

        images = []
        for result in results[:count]:
            if isinstance(result, dict) and "url" in result:
                images.append({"url": result["url"], "alt": search_query})
            elif isinstance(result, str):
                images.append({"url": result, "alt": search_query})

        return images

    except Exception as e:
        print(f"Pexels fallback failed: {e}")
        return []


def batch_fetch_product_images(
    products: List[Dict[str, Any]],
    images_per_product: int = 3,
) -> Dict[str, Any]:
    """
    Batch fetch images for multiple products.

    Args:
        products: List of product dicts from research_products()
        images_per_product: Number of images per product

    Returns:
        {
            "status": "success",
            "products_with_images": [
                {
                    "name": "Product Name",
                    "images": [{"url": "...", "alt": "..."}]
                }
            ]
        }
    """
    try:
        products_with_images = []

        for product in products:
            search_query = product.get("name", "")
            if not search_query:
                continue

            result = fetch_product_images(search_query, images_per_product)

            if result["status"] == "success":
                products_with_images.append(
                    {
                        "name": product["name"],
                        "brand": product.get("brand", ""),
                        "images": result.get("images", []),
                        "image_source": result.get("source", "unknown"),
                    }
                )

        return {
            "status": "success",
            "total_products": len(products_with_images),
            "products_with_images": products_with_images,
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Batch image fetching failed: {str(e)}",
        }
