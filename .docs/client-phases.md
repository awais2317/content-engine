# Boston777 / Content Engine V4.1 — Phased Scope

## Final agreed proposal (Awais → Boston777)

### Phase 1 — $100, 1 week (MVP)
1. Channel definition UI (React/Next.js dashboard)
2. Rule storage layer (**Postgres**)
3. ONE end-to-end video pipeline:
   - **Hedra** talking head
   - **ElevenLabs** voice
   - **Pexels** stock B-roll
   - **Remotion** assembly
   - **YouTube** upload
4. LLM routing via Copilot models (Opus 4.6/4.7, GPT-5.5, Sonnet 4.6) — free via Pro
5. Basic analytics view (manual entry)
6. Deployment on Hostinger VPS

### Phase 2 — $200, ~2 weeks
- Video-generator router (VEO 3 / Kling / Luma / Runway via Replicate or fal.ai)
- Image-generator router (multi-model, per-channel)
- Multi-platform posting (TikTok + Instagram + YouTube)
- Real YouTube analytics ingestion + "Larry's Marketing Experiments" feedback loop

### Phase 3 — $100, ~1 week
- Adaptive learning loop (rules auto-update from analytics)
- Advanced rule engine + memory system (vector DB)
- Long-form auto-generated video pipeline

### Final optimization — $100
- Quality refinement, more channels, fix-as-scale issues

## Monthly run-cost (client's account)
- Hedra Creator: $29/mo
- ElevenLabs Creator: $22/mo
- Pexels / YouTube API / Copilot / VPS: $0
- Realistic min: $27–$51/mo

## V4.1 north-star vision
Channel-driven content OS — user only manages channels (identity, character,
content type, frequency, goal). System owns plan / create / improve / edit /
track / learn.

Key principles:
- Identity fixed at channel layer
- Execution fully abstracted from tools
- Tools are interchangeable plugins behind adapters
- Immutable **core rules** + AI-tunable **adaptive rules**
- Learning happens offline & safely
- Never modifies core channel identity

## V4.1 architecture layers
UI → Agent Meta Orchestrator → Intent Engine → Content Spec → Channel Rule
Engine → Capability Compilation → Execution Router → Tool Adapter Layer →
Normalized Artifact Layer → Content Assembly → Final Package → Distribution →
Analytics → Memory + Learning → Control Feedback Loop
