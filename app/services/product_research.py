"""
Product Intelligence Layer - LLM-based product research & data structuring.

This service researches products using LLM, structures the data, and returns
product information including specs, pros, cons, and where to find them.
"""

import json
from typing import List, Dict, Any, Optional
from app.services.llm import _generate_response


def research_products(
    query: str,
    count: int = 5,
    provider_override: str = "",
    model_override: str = "",
) -> Dict[str, Any]:
    """
    Research products for a given query using LLM.

    Args:
        query: Product query (e.g., "top 5 cloud couches 2026")
        count: Number of products to research
        provider_override: Override LLM provider
        model_override: Override LLM model

    Returns:
        {
            "status": "success",
            "query": "...",
            "products": [
                {
                    "rank": 1,
                    "name": "Product Name",
                    "price": "$XXX",
                    "brand": "Brand Name",
                    "specs": {"key": "value", ...},
                    "pros": ["pro1", "pro2", ...],
                    "cons": ["con1", "con2", ...],
                    "description": "Short description",
                    "best_for": "Target audience",
                    "where_to_find": ["amazon.com", "brandsite.com"],
                }
            ]
        }
    """
    try:
        prompt = f"""
Research the following product query and return structured JSON data:

Query: {query}
Number of products: {count}

For each product, research and provide:
1. Product name
2. Brand
3. Current approximate price (USD)
4. Key specifications (as key-value pairs)
5. Top 3-5 pros
6. Top 3-5 cons
7. Short description (1-2 sentences)
8. Best suited for (target audience/use case)
9. Where to find it (retailer websites)

Return ONLY valid JSON in this exact format:
{{
    "products": [
        {{
            "rank": 1,
            "name": "Product Name",
            "brand": "Brand",
            "price": "$XXX",
            "specs": {{"key": "value"}},
            "pros": ["pro1", "pro2", "pro3"],
            "cons": ["con1", "con2", "con3"],
            "description": "...",
            "best_for": "...",
            "where_to_find": ["retailer1.com", "retailer2.com"]
        }}
    ]
}}

Make sure the JSON is valid and parseable. Focus on accuracy and real products.
"""

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
                "raw_response": response_text[:200],
            }

        json_str = response_text[json_start:json_end]
        data = json.loads(json_str)

        return {
            "status": "success",
            "query": query,
            "count": len(data.get("products", [])),
            "products": data.get("products", []),
        }

    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "message": f"Failed to parse JSON: {str(e)}",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Product research failed: {str(e)}",
        }


def extract_search_keywords(products: List[Dict[str, Any]]) -> List[str]:
    """
    Extract search keywords from product research for image fetching.

    Args:
        products: List of product dicts from research_products()

    Returns:
        List of search terms (e.g., ["Cloud Couch", "IKEA Söderhamn"])
    """
    keywords = []
    for product in products:
        name = product.get("name", "")
        brand = product.get("brand", "")

        if brand and name:
            keywords.append(f"{brand} {name}")
        elif name:
            keywords.append(name)

    return keywords
