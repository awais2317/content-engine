# Boston's Studio — Content Engine

AI short-form video engine. Drafts narrated scripts, picks stock B-roll, and
renders ready-to-publish vertical videos for Shorts, Reels, and TikTok.

## What it does

1. Takes a subject (or a script you write yourself).
2. Drafts the script and search keywords with an LLM (any OpenAI-compatible
   provider, Ollama, or Pollinations).
3. Synthesises a voiceover with Edge TTS.
4. Pulls matching B-roll from Pexels / Pixabay (or your own local materials).
5. Transcribes the voiceover with Whisper to get word-accurate subtitles.
6. Stitches everything together with background music, subtitles, and a final
   ffmpeg encode.

The result is a final-1.mp4 (and final-2, final-3, … if you ask for
variations) in `storage/tasks/<task_id>/`.

## Layout

```
app/             FastAPI backend (controllers, services, schema)
  controllers/   HTTP routes (videos, tasks, library, channels, settings, voice, …)
  services/      LLM, voice, subtitle, video, task, state
  models/        Pydantic schema + constants
dashboard/       Next.js 16 dashboard (the studio UI)
webui/           Legacy Streamlit UI (kept for reference)
resource/        Fonts, songs, public landing page
storage/         Runtime artifacts (tasks, cache, temp, studio.db)
config.toml      Runtime config (LLM provider, API keys, defaults)
main.py          FastAPI entry point
cli.py           CLI for batch / scripted renders
```

## Running it

### Backend (FastAPI on port 8080)

```powershell
uv sync --frozen
uv run python main.py
```

API docs are then at <http://127.0.0.1:8080/docs>.

### Dashboard (Next.js on port 3000)

```powershell
cd dashboard
npm install
npm run dev      # or: npm run build && npm start for production
```

The dashboard proxies `/api/*` to the FastAPI backend, so both run on the same
origin in the browser.

### CLI (one-shot render)

```powershell
uv run python cli.py --video-subject "why memory foam couches are worth the price"
```

## Configuration

All defaults live in `config.toml`. Important keys:

- `[app] llm_provider` — `openai`, `pollinations`, `ollama`, `gemini`, …
- `[app] openai_base_url` / `openai_api_key` / `openai_model_name` — for the
  OpenAI-compatible providers (including the local Copilot tunnel).
- `[app] pexels_api_keys` / `pixabay_api_keys` — stock video sources.
- `[app] voice_name` — default Edge TTS voice (e.g. `en-AU-NatashaNeural-Female`).

Settings can also be edited live from the dashboard's Settings page; changes
are persisted back to `config.toml`.

## Notes

- Whisper models live under `models/` and are downloaded on first use.
- Render artifacts (`audio.mp3`, `combined-*.mp4`, `final-*.mp4`, `subtitle.srt`)
  are written under `storage/tasks/<task_id>/` and surfaced by the Library page.
- The dashboard is the supported UI; the Streamlit UI under `webui/` is kept
  as a fallback only.
