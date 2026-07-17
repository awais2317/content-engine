# Product Intelligence Layer Implementation

## ✅ Completed Features

### 1. **Product Research Service** (`app/services/product_research.py`)
Researches products using LLM for any query.

**Functions:**
- `research_products(query, count, provider_override, model_override)` → Structured product data
- `extract_search_keywords(products)` → Keywords for image fetching

**Output:**
```json
{
  "status": "success",
  "query": "top 5 cloud couches 2026",
  "products": [
    {
      "rank": 1,
      "name": "Cloud Couch",
      "brand": "Article",
      "price": "$1,299",
      "specs": {"material": "polyester", "depth": "40 inches"},
      "pros": ["Comfortable", "Durable", "Good support"],
      "cons": ["Heavy", "Expensive"],
      "description": "Premium cloud couch with excellent comfort",
      "best_for": "Luxury home comfort",
      "where_to_find": ["article.com", "wayfair.com"]
    }
  ]
}
```

---

### 2. **Image Fetcher Service** (`app/services/image_fetcher.py`)
Fetches real product images from DuckDuckGo with Pexels fallback.

**Functions:**
- `fetch_product_images(search_query, count)` → Image URLs
- `batch_fetch_product_images(products, images_per_product)` → Images for multiple products

**Output:**
```json
{
  "status": "success",
  "query": "Cloud Couch",
  "source": "duckduckgo",
  "images": [
    {"url": "https://...", "alt": "Cloud Couch"},
    {"url": "https://...", "alt": "Cloud Couch"}
  ]
}
```

---

### 3. **Scene Planner Service** (`app/services/scene_planner.py`)
Structures product research into video scenes with voice scripts, timing, and visuals.

**Functions:**
- `plan_scenes(research_data, video_type, video_length)` → Scene structure
- `validate_scene_plan(scene_plan)` → Validation report
- `get_scene_visuals(scene, products_with_images)` → Visual assets per scene

**Supported Video Types:**
- `comparison` - Compare multiple products
- `top_n` - Ranked "top N" videos
- `deep_dive` - Deep review of single product
- `single_product` - Product showcase

**Output:**
```json
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
      "voice_script": "Today we're comparing the best couches...",
      "visual_description": "Fast-paced intro with product montage",
      "motion_type": "zoom",
      "products_featured": [1, 2, 3]
    }
  ]
}
```

---

### 4. **Product Content Generator** (`app/services/product_content_generator.py`)
Orchestrates the complete end-to-end pipeline: research → images → scenes → video.

**Functions:**
- `generate_product_review_video(channel_config, query, video_type, video_length)` → Complete video
- `generate_batch_product_reviews(channel_config, queries, batch_size)` → Multiple videos

**Usage Example:**
```python
from app.services.product_content_generator import generate_product_review_video

result = generate_product_review_video(
    channel_config={
        "name": "Furniture Reviews",
        "voice_name": "ElevenLabs:en_us-male",
        "llm_provider_override": "openai",
        "llm_model_override": "gpt-4"
    },
    query="top 5 cloud couches 2026",
    video_type="top_n",
    video_length=60
)
```

---

### 5. **API Endpoints** (`app/controllers/v1/content.py`)

#### **POST** `/api/v1/content/research-products`
Research products for a query.
```bash
curl -X POST "http://localhost:8080/api/v1/content/research-products" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "top 5 cloud couches 2026",
    "count": 5,
    "provider": "openai",
    "model": "gpt-4"
  }'
```

#### **POST** `/api/v1/content/fetch-images`
Fetch product images.
```bash
curl -X POST "http://localhost:8080/api/v1/content/fetch-images" \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "Cloud Couch Article",
    "count": 5
  }'
```

#### **POST** `/api/v1/content/batch-fetch-images`
Batch fetch images for multiple products.
```bash
curl -X POST "http://localhost:8080/api/v1/content/batch-fetch-images" \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {"name": "Cloud Couch", "brand": "Article"},
      {"name": "Outdoor Couch", "brand": "IKEA"}
    ],
    "images_per_product": 3
  }'
```

#### **POST** `/api/v1/content/plan-scenes`
Plan video scenes from research.
```bash
curl -X POST "http://localhost:8080/api/v1/content/plan-scenes" \
  -H "Content-Type: application/json" \
  -d '{
    "research_data": {...},
    "video_type": "comparison",
    "video_length": 60
  }'
```

#### **POST** `/api/v1/content/end-to-end-content-pipeline`
Complete end-to-end pipeline in one call.
```bash
curl -X POST "http://localhost:8080/api/v1/content/end-to-end-content-pipeline" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "top 5 cloud couches 2026",
    "video_type": "comparison",
    "video_length": 60,
    "product_count": 5,
    "images_per_product": 3
  }'
```

---

### 6. **Schema Updates** (`app/models/schema.py`)
Added new `VideoParams` fields:
- `video_type` - Video generation type (comparison, top_n, deep_dive, single_product, generic)
- `product_research_enabled` - Enable product research pipeline
- `product_research_llm_provider` - LLM for product research
- `product_research_llm_model` - Model for product research
- `image_sources` - Where to fetch images (pexels, scraped, ai_generated, custom)
- `video_sources` - Where to fetch videos (stock, ai_generated, scraped)
- `scene_planning_enabled` - Enable structured scene planning
- `avatar_enabled` - Enable avatar/HeyGen
- `avatar_provider` - Avatar provider (heygen, hedra, etc)

---

### 7. **Task Pipeline Integration** (`app/services/task.py`)
The main task execution `start()` function now checks for `product_research_enabled`:
- If `product_research_enabled=True`: Uses product content generator pipeline
- Otherwise: Falls back to regular script-based generation

This allows channels to automatically use product intelligence when configured.

---

## 🚀 How to Use (For End Users)

### **Workflow 1: Create a Product Review Video (Single Query)**

**Through API:**
```bash
POST /api/v1/content/end-to-end-content-pipeline
{
  "query": "top 5 cloud couches 2026",
  "video_type": "comparison",
  "video_length": 60
}
```

Response includes:
- Product research data (5 couches with specs, pros, cons, pricing)
- Product images (3+ images per product)
- Scene structure (intro, product showcases, comparison, CTA)
- Voice scripts for each scene

**Then generate video through `/api/v1/tasks` with:**
```json
{
  "video_subject": "top 5 cloud couches 2026",
  "video_type": "comparison",
  "product_research_enabled": true,
  "product_research_llm_provider": "openai",
  "product_research_llm_model": "gpt-4",
  "channel_name": "Furniture Reviews"
}
```

---

### **Workflow 2: Set Up a Channel for Auto Product Reviews**

In the dashboard → Channels → Create/Edit:
- Enable "Product Research"
- Select LLM provider for product research (e.g., GPT-4)
- Select image sources (Pexels, DuckDuckGo, etc.)
- Set schedule (e.g., "Generate 1 video daily")

Then in scheduling:
- Channel will automatically generate "top 5 couches this week"
- System researches, fetches images, plans scenes
- Video renders automatically
- Saved to AWS with metadata

---

## 📋 Architecture Flow

```
User Input (e.g., "top 5 couches")
    ↓
[Product Research Service]
    → LLM researches products
    → Returns: name, price, specs, pros, cons, retailers
    ↓
[Image Fetcher Service]
    → Searches for each product
    → Returns: real product images + video clips
    ↓
[Scene Planner Service]
    → Structures into scenes (intro, product A, product B, etc)
    → LLM writes voice scripts per scene
    → Assigns motion types, timing
    ↓
[Video Generation Service]
    → Fetches images/audio
    → Uses existing moviepy/Remotion pipeline
    → Renders final video
    ↓
[S3 Upload]
    → Saves to AWS with metadata
    → Non-expiring signed URLs
    → Tagged with content ID
```

---

## 🔧 Next Steps (Phase 1 Remaining)

1. **HeyGen/Avatar Integration** (2 days)
   - Generate talking head intro clips
   - Integrate with video assembly pipeline

2. **YouTube Upload** (1 day)
   - Auto-upload generated videos
   - Schedule publishing

3. **Remote Testing** (1 day)
   - Test with real product queries
   - Validate image quality and scene structure
   - Tune LLM prompts for better product research

4. **Analytics Dashboard** (1 day)
   - View products researched
   - Track video generation success rate
   - Monitor LLM costs

---

## ✨ Key Features Implemented

✅ **100% Product-Driven** - Not generic videos, real products with real images
✅ **Structured Scenes** - Videos have clear narrative structure
✅ **Multi-LLM Support** - Use different LLMs for research vs. scripting
✅ **Fallback Image Sources** - DuckDuckGo → Pexels if needed
✅ **Batch Processing** - Generate multiple videos in parallel
✅ **Validation** - Scene plans are validated for completeness
✅ **Extensible Architecture** - Easy to add HeyGen, Remotion, more image sources

---

## 📊 Status

- ✅ Deployed to production (187.124.158.203)
- ✅ All services running and healthy
- ✅ Scheduler active
- ✅ API endpoints accessible at `/api/v1/content/*`

---

## 🧪 Testing

Try this quick test:
```bash
# Test product research
curl -X POST "http://localhost:8080/api/v1/content/research-products?query=best+gaming+chairs&count=5"

# Test full pipeline
curl -X POST "http://localhost:8080/api/v1/content/end-to-end-content-pipeline?query=top+3+ergonomic+office+chairs&video_type=top_n&video_length=60"
```

Check API docs at: `http://localhost:8080/docs`

---

**Commit Hash:** `3742e43`
**Deployed:** 2026-07-17
