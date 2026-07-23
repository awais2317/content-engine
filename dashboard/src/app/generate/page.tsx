"use client";

import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import {
  bgmApi,
  type BgmFile,
  channelsApi,
  type Channel,
  streamUrl,
  downloadUrl,
  previewVoice,
  scriptApi,
  tasksApi,
  type TaskSummary,
} from "@/lib/api";

const VOICES = [
  "en-AU-NatashaNeural-Female",
  "en-AU-WilliamNeural-Male",
  "en-US-AriaNeural-Female",
  "en-US-GuyNeural-Male",
  "en-US-JennyNeural-Female",
  "en-GB-SoniaNeural-Female",
  "en-GB-RyanNeural-Male",
];

interface FormState {
  // Stage 1 — Brief
  channelId: string;
  subject: string;
  language: string;
  targetDuration: number;

  // Stage 2 — Editable creative
  script: string;
  keywords: string; // comma-separated, easy to edit in a single input

  // Stage 3 — Render settings
  voice: string;
  voiceVolume: number;
  voiceRate: number;
  source: "pexels" | "pixabay" | "replicate" | "local";
  replicateModel: string;
  aspect: "9:16" | "16:9" | "1:1";
  clipDuration: number;
  videoCount: number;
  bgmType: "random" | "" | "custom";
  bgmFile: string;
  bgmVolume: number;
  subtitlesEnabled: boolean;
  subtitlePosition: "top" | "center" | "bottom";
}

const DEFAULT_FORM: FormState = {
  channelId: "",
  subject: "",
  language: "en",
  targetDuration: 60,
  script: "",
  keywords: "",
  voice: "en-AU-NatashaNeural-Female",
  voiceVolume: 1.0,
  voiceRate: 1.0,
  source: "pexels",
  replicateModel: "",
  aspect: "9:16",
  clipDuration: 3,
  videoCount: 1,
  bgmType: "random",
  bgmFile: "",
  bgmVolume: 0.2,
  subtitlesEnabled: true,
  subtitlePosition: "bottom",
};

type Phase = "idle" | "starting" | "running" | "done" | "error";

export default function GeneratePage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [bgmFiles, setBgmFiles] = useState<BgmFile[]>([]);

  // Script-stage state
  const [draftingScript, setDraftingScript] = useState(false);
  const [draftingTerms, setDraftingTerms] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Render-stage state
  const [phase, setPhase] = useState<Phase>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Voice preview
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Load channels + BGM
  useEffect(() => {
    channelsApi
      .list()
      .then((list) => setChannels(list))
      .catch(() => setChannels([]));
    bgmApi
      .list()
      .then((files) => setBgmFiles(files))
      .catch(() => setBgmFiles([]));
  }, []);

  // Apply channel preset
  useEffect(() => {
    if (!form.channelId) return;
    const ch = channels.find((c) => c.id === form.channelId);
    if (!ch) return;
    setForm((prev) => ({
      ...prev,
      voice: ch.voice_name || prev.voice,
      language: ch.language || prev.language,
      source: (ch.video_source as FormState["source"]) || prev.source,
      aspect: (ch.video_aspect as FormState["aspect"]) || prev.aspect,
      clipDuration: ch.clip_duration || prev.clipDuration,
      targetDuration: ch.target_duration || prev.targetDuration,
      subtitlePosition:
        (ch.subtitle_position as FormState["subtitlePosition"]) ||
        prev.subtitlePosition,
    }));
  }, [form.channelId, channels]);

  // Poll task status
  useEffect(() => {
    if (!taskId) return;
    const tick = async () => {
      try {
        const res = await tasksApi.get(taskId);
        const data = res;
        setTask(data);
        if (
          (data.videos && data.videos.length) ||
          data.combined_videos?.length
        ) {
          setPhase("done");
        }
        if (data.error) {
          setErrorMsg(data.error);
          setPhase("error");
        }
      } catch {
        /* swallow transient polling errors */
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId]);

  useEffect(() => {
    if ((phase === "done" || phase === "error") && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [phase]);

  // Revoke preview Blob URLs on unmount/swap
  useEffect(() => {
    previewUrlRef.current = previewUrl;
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [previewUrl]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  // ----- Stage 1 → 2: Draft script and keywords ---------------------------

  async function onDraft() {
    if (!form.subject.trim()) {
      setDraftError("Enter a subject first.");
      return;
    }
    setDraftError(null);
    setDraftingScript(true);
    try {
      const script = await scriptApi.draft({
        video_subject: form.subject.trim(),
        video_language: form.language,
        target_duration: form.targetDuration,
      });
      setForm((s) => ({ ...s, script }));
      setHasDraft(true);

      // Immediately follow with keyword generation
      setDraftingTerms(true);
      try {
        const terms = await scriptApi.terms({
          video_subject: form.subject.trim(),
          video_script: script,
          amount: 5,
        });
        setForm((s) => ({ ...s, keywords: terms.join(", ") }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDraftError(`Keywords failed: ${msg}`);
      } finally {
        setDraftingTerms(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDraftError(msg);
    } finally {
      setDraftingScript(false);
    }
  }

  async function onRegenerateScript() {
    setDraftError(null);
    setDraftingScript(true);
    try {
      const script = await scriptApi.draft({
        video_subject: form.subject.trim(),
        video_language: form.language,
        target_duration: form.targetDuration,
      });
      setForm((s) => ({ ...s, script }));
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftingScript(false);
    }
  }

  async function onRegenerateKeywords() {
    if (!form.script.trim()) {
      setDraftError("Need a script first.");
      return;
    }
    setDraftError(null);
    setDraftingTerms(true);
    try {
      const terms = await scriptApi.terms({
        video_subject: form.subject.trim() || form.script.slice(0, 80),
        video_script: form.script,
        amount: 5,
      });
      setForm((s) => ({ ...s, keywords: terms.join(", ") }));
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftingTerms(false);
    }
  }

  function onSkipToManual() {
    setHasDraft(true); // exposes the Stage 2 editor with empty fields
  }

  // ----- Voice preview ----------------------------------------------------

  async function onPreviewVoice() {
    setPreviewError(null);
    setPreviewing(true);
    try {
      const url = await previewVoice({
        voice_name: form.voice,
        voice_rate: form.voiceRate,
        voice_volume: form.voiceVolume,
        text: form.script.trim() || form.subject.trim() || undefined,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  }

  // ----- Stage 3: Render --------------------------------------------------

  async function onRender(e: React.FormEvent) {
    e.preventDefault();
    if (!form.script.trim()) {
      setErrorMsg("Draft or write a script before rendering.");
      return;
    }
    setErrorMsg(null);
    setTask(null);
    setPhase("starting");
    try {
      const keywordList = form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const selectedChannel = channels.find((c) => c.id === form.channelId);
      const res = await tasksApi.create({
        video_subject: form.subject.trim() || form.script.slice(0, 80),
        video_script: form.script.trim(),
        video_terms: keywordList.length ? keywordList : undefined,
        video_language: form.language,
        target_duration: form.targetDuration,
        channel_name: selectedChannel?.name || "",
        llm_provider_override: selectedChannel?.script_llm_provider || "",
        llm_model_override: selectedChannel?.script_llm_model || "",
        voice_name: form.voice,
        voice_volume: form.voiceVolume,
        voice_rate: form.voiceRate,
        video_source: form.source,
        replicate_model: form.replicateModel,
        video_aspect: form.aspect,
        video_clip_duration: form.clipDuration,
        video_count: form.videoCount,
        bgm_type: form.bgmType,
        bgm_file: form.bgmType === "custom" ? form.bgmFile : "",
        bgm_volume: form.bgmType === "" ? 0 : form.bgmVolume,
        subtitle_enabled: form.subtitlesEnabled,
        subtitle_position: form.subtitlePosition,
      });
      setTaskId(res.task_id);
      setPhase("running");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function resetForNewRender() {
    setPhase("idle");
    setTask(null);
    setTaskId(null);
  }

  const finalVideo = task?.videos?.[0] || task?.combined_videos?.[0];
  const progress = typeof task?.progress === "number" ? task.progress : 0;
  const canRender = hasDraft && form.script.trim().length > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Generate"
        subtitle="Draft a script with AI, edit it to taste, then render the video."
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* =============== LEFT COLUMN — form =============== */}
        <div className="space-y-6">
          {/* -------- Stage 1: Brief -------- */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-3">
                  <StepDot n={1} active />
                  Brief
                </span>
              }
              description="What's the video about?"
            />

            <div className="space-y-5">
              {channels.length > 0 && (
                <div>
                  <Label>Channel preset</Label>
                  <Select
                    value={form.channelId}
                    onChange={(e) => update("channelId", e.target.value)}
                  >
                    <option value="">— None (manual) —</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.niche ? ` · ${c.niche}` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <Label>Subject</Label>
                <Input
                  placeholder="e.g. why memory-foam couches are worth the price"
                  value={form.subject}
                  onChange={(e) => update("subject", e.target.value)}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label>Language</Label>
                  <Select
                    value={form.language}
                    onChange={(e) => update("language", e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                  </Select>
                </div>
                <div>
                  <Label>Target Duration (seconds)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={300}
                    step={30}
                    value={form.targetDuration}
                    onChange={(e) =>
                      update("targetDuration", Number(e.target.value) || 60)
                    }
                  />
                  <p className="mt-1 text-xs text-muted">
                    Estimated script length: ~{Math.max(50, form.targetDuration * 1.5)} words
                  </p>
                </div>
              </div>

              {draftError && (
                <div className="rounded-md border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
                  {draftError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={onDraft}
                  loading={draftingScript || draftingTerms}
                  disabled={!form.subject.trim()}
                >
                  {draftingScript
                    ? "Drafting script…"
                    : draftingTerms
                      ? "Finding keywords…"
                      : hasDraft
                        ? "Draft again"
                        : "Draft script with AI"}
                </Button>
                {!hasDraft && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onSkipToManual}
                    disabled={draftingScript || draftingTerms}
                  >
                    Skip — I&apos;ll write it myself
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* -------- Stage 2: Script + Keywords -------- */}
          {hasDraft && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-3">
                    <StepDot n={2} active />
                    Script &amp; keywords
                  </span>
                }
                description="Edit anything. These drive the voiceover and which stock clips get picked."
                action={
                  <Badge tone={form.script.trim() ? "success" : "warning"}>
                    {form.script.trim() ? "Ready" : "Empty"}
                  </Badge>
                }
              />

              <div className="space-y-5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label className="mb-0">Script</Label>
                    <button
                      type="button"
                      onClick={onRegenerateScript}
                      disabled={draftingScript || !form.subject.trim()}
                      className="text-xs text-gold-soft hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {draftingScript ? "Regenerating…" : "↻ Regenerate"}
                    </button>
                  </div>
                  <Textarea
                    value={form.script}
                    onChange={(e) => update("script", e.target.value)}
                    placeholder="The exact words that will be spoken in the video."
                    className="min-h-[160px]"
                  />
                  <p className="mt-1 text-xs text-muted">
                    {form.script.trim().length} characters · approx{" "}
                    {Math.max(
                      1,
                      Math.round(form.script.trim().split(/\s+/).length / 2.5)
                    )}
                    s spoken
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label className="mb-0">Stock clip keywords</Label>
                    <button
                      type="button"
                      onClick={onRegenerateKeywords}
                      disabled={draftingTerms || !form.script.trim()}
                      className="text-xs text-gold-soft hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {draftingTerms ? "Regenerating…" : "↻ Regenerate"}
                    </button>
                  </div>
                  <Input
                    value={form.keywords}
                    onChange={(e) => update("keywords", e.target.value)}
                    placeholder="couch, living room, comfort, design, modern"
                  />
                  <p className="mt-1 text-xs text-muted">
                    Comma-separated. Each term is searched on{" "}
                    {form.source === "pexels"
                      ? "Pexels"
                      : form.source === "pixabay"
                        ? "Pixabay"
                        : form.source === "replicate"
                          ? "Replicate AI (generated)"
                          : "your local library"}{" "}
                    to pick B-roll.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* -------- Stage 3: Render settings -------- */}
          {hasDraft && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-3">
                    <StepDot n={3} active={canRender} />
                    Render settings
                  </span>
                }
                description="How should the final video look and sound?"
              />

              <form onSubmit={onRender} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label>Voice</Label>
                    <Select
                      value={form.voice}
                      onChange={(e) => update("voice", e.target.value)}
                    >
                      {VOICES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>B-roll source</Label>
                    <Select
                      value={form.source}
                      onChange={(e) =>
                        update("source", e.target.value as FormState["source"])
                      }
                    >
                      <option value="pexels">Pexels</option>
                      <option value="pixabay">Pixabay</option>
                      <option value="replicate">Replicate AI</option>
                      <option value="local">Local materials</option>
                    </Select>
                  </div>
                  {form.source === "replicate" && (
                    <div>
                      <Label>Replicate AI Model</Label>
                      <Select
                        value={form.replicateModel}
                        onChange={(e) => update("replicateModel", e.target.value)}
                      >
                        <option value="">Select a model...</option>
                        <option value="styledrop/styledrop">
                          StylDrop (text-to-styled-video)
                        </option>
                        <option value="timothybrooks/frame-interpolation">
                          Frame Interpolation (smooth frames)
                        </option>
                      </Select>
                      <p className="mt-1 text-xs text-muted">
                        Generates AI videos matching your keywords
                      </p>
                    </div>
                  )}
                  <div>
                    <Label>Aspect</Label>
                    <Select
                      value={form.aspect}
                      onChange={(e) =>
                        update("aspect", e.target.value as FormState["aspect"])
                      }
                    >
                      <option value="9:16">9:16 — Vertical (Shorts/Reels)</option>
                      <option value="16:9">16:9 — Horizontal (YouTube)</option>
                      <option value="1:1">1:1 — Square (IG feed)</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Clip duration (sec)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={form.clipDuration}
                      onChange={(e) =>
                        update("clipDuration", Number(e.target.value) || 3)
                      }
                    />
                  </div>
                </div>

                {/* Voice tuning + preview */}
                <div className="rounded-lg border border-border bg-surface-2/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Label className="mb-0">Voice tuning</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={previewing}
                      onClick={onPreviewVoice}
                    >
                      {previewing ? "Synthesising…" : "Preview voice"}
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Speed</Label>
                      <Select
                        value={String(form.voiceRate)}
                        onChange={(e) =>
                          update("voiceRate", Number(e.target.value))
                        }
                      >
                        <option value="0.75">Slow (0.75×)</option>
                        <option value="0.9">Relaxed (0.9×)</option>
                        <option value="1">Normal (1×)</option>
                        <option value="1.1">Brisk (1.1×)</option>
                        <option value="1.25">Fast (1.25×)</option>
                        <option value="1.5">Very fast (1.5×)</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Volume</Label>
                      <Select
                        value={String(form.voiceVolume)}
                        onChange={(e) =>
                          update("voiceVolume", Number(e.target.value))
                        }
                      >
                        <option value="0.5">Quiet (0.5×)</option>
                        <option value="0.8">Soft (0.8×)</option>
                        <option value="1">Normal (1×)</option>
                        <option value="1.2">Loud (1.2×)</option>
                        <option value="1.5">Very loud (1.5×)</option>
                      </Select>
                    </div>
                  </div>
                  {previewError && (
                    <p className="mt-3 text-xs text-red-300">{previewError}</p>
                  )}
                  {previewUrl && (
                    <audio
                      key={previewUrl}
                      src={previewUrl}
                      controls
                      autoPlay
                      className="mt-3 w-full"
                    />
                  )}
                </div>

                {/* BGM */}
                <div className="rounded-lg border border-border bg-surface-2/40 p-4">
                  <Label>Background music</Label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                      value={form.bgmType}
                      onChange={(e) =>
                        update(
                          "bgmType",
                          e.target.value as FormState["bgmType"]
                        )
                      }
                    >
                      <option value="random">Random from library</option>
                      <option value="">No background music</option>
                      <option value="custom">Pick a specific track</option>
                    </Select>
                    <Select
                      value={String(form.bgmVolume)}
                      onChange={(e) =>
                        update("bgmVolume", Number(e.target.value))
                      }
                      disabled={form.bgmType === ""}
                    >
                      <option value="0.05">Whisper (5%)</option>
                      <option value="0.1">Subtle (10%)</option>
                      <option value="0.2">Balanced (20%)</option>
                      <option value="0.35">Loud (35%)</option>
                      <option value="0.5">Dominant (50%)</option>
                    </Select>
                  </div>
                  {form.bgmType === "custom" && (
                    <div className="mt-3">
                      <Label>Track</Label>
                      <Select
                        value={form.bgmFile}
                        onChange={(e) => update("bgmFile", e.target.value)}
                      >
                        <option value="">— choose a track —</option>
                        {bgmFiles.map((b) => (
                          <option key={b.file} value={b.file}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                      {bgmFiles.length === 0 && (
                        <p className="mt-2 text-xs text-muted">
                          No tracks found. Drop .mp3 files into{" "}
                          <code className="font-mono text-gold-soft">
                            storage/songs/
                          </code>
                          .
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Subtitles */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label>Subtitles</Label>
                    <Select
                      value={form.subtitlesEnabled ? "on" : "off"}
                      onChange={(e) =>
                        update("subtitlesEnabled", e.target.value === "on")
                      }
                    >
                      <option value="on">Enabled</option>
                      <option value="off">Disabled</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Subtitle position</Label>
                    <Select
                      value={form.subtitlePosition}
                      onChange={(e) =>
                        update(
                          "subtitlePosition",
                          e.target.value as FormState["subtitlePosition"]
                        )
                      }
                      disabled={!form.subtitlesEnabled}
                    >
                      <option value="bottom">Bottom</option>
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Variations to render</Label>
                  <Select
                    value={String(form.videoCount)}
                    onChange={(e) =>
                      update("videoCount", Number(e.target.value))
                    }
                  >
                    <option value="1">1 video</option>
                    <option value="2">2 videos</option>
                    <option value="3">3 videos</option>
                    <option value="5">5 videos</option>
                  </Select>
                  <p className="mt-1 text-xs text-muted">
                    Each variation reuses the script but stitches different
                    B-roll.
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-md border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
                    {errorMsg}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    size="lg"
                    loading={phase === "starting" || phase === "running"}
                    disabled={!canRender}
                  >
                    {phase === "running" ? "Rendering…" : "Generate video"}
                  </Button>
                  {phase === "running" && (
                    <span className="text-sm text-muted">
                      This usually takes 5–10 minutes.
                    </span>
                  )}
                </div>
              </form>
            </Card>
          )}
        </div>

        {/* =============== RIGHT COLUMN — Status & preview =============== */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Status"
              action={
                phase === "done" ? (
                  <Badge tone="success">Ready</Badge>
                ) : phase === "running" ? (
                  <Badge tone="gold">Working</Badge>
                ) : phase === "error" ? (
                  <Badge tone="error">Failed</Badge>
                ) : hasDraft ? (
                  <Badge tone="gold">Draft</Badge>
                ) : (
                  <Badge>Idle</Badge>
                )
              }
            />

            {phase === "idle" && !hasDraft && (
              <p className="text-sm text-muted">
                Start with a subject above, then draft a script. The render
                button unlocks once you have a script.
              </p>
            )}

            {phase === "idle" && hasDraft && (
              <ul className="space-y-1 text-sm text-muted">
                <li>{form.script.trim() ? "✓ " : "· "}Script ready</li>
                <li>
                  {form.keywords.trim() ? "✓ " : "· "}Keywords ready (
                  {form.keywords.split(",").filter((k) => k.trim()).length})
                </li>
                <li>· Render</li>
              </ul>
            )}

            {(phase === "starting" || phase === "running") && (
              <div className="space-y-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-[var(--color-gold)] transition-all"
                    style={{ width: `${Math.max(8, progress)}%` }}
                  />
                </div>
                <ul className="space-y-1 text-sm text-muted">
                  <li>✓ Script ready</li>
                  <li>{task?.audio_file ? "✓ " : "· "}Voiceover synthesised</li>
                  <li>
                    {task?.subtitle_path ? "✓ " : "· "}Subtitles transcribed
                  </li>
                  <li>
                    {task?.combined_videos?.length ? "✓ " : "· "}B-roll stitched
                  </li>
                  <li>{finalVideo ? "✓ " : "· "}Final encode</li>
                </ul>
                {taskId && (
                  <p className="text-xs text-muted">
                    Task{" "}
                    <span className="font-mono">{taskId.slice(0, 8)}…</span>
                  </p>
                )}
              </div>
            )}

            {phase === "done" && finalVideo && (
              <div className="space-y-4">
                <video
                  className="w-full rounded-lg border border-border-strong"
                  src={streamUrl(finalVideo)}
                  controls
                  autoPlay
                  playsInline
                />
                <div className="flex gap-2">
                  <a
                    href={downloadUrl(finalVideo)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-[var(--color-gold)] px-4 text-sm font-medium text-black hover:bg-[var(--color-gold-soft)]"
                    download
                  >
                    Download MP4
                  </a>
                  <Button variant="secondary" onClick={resetForNewRender}>
                    Render again
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Small numbered step indicator used in card headers
function StepDot({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
        active
          ? "border-[var(--color-gold)] bg-[var(--color-gold-glow)] text-gold-soft"
          : "border-border-strong text-muted"
      }`}
    >
      {n}
    </span>
  );
}
