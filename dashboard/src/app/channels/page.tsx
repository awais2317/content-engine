"use client";

import { useEffect, useState } from "react";
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
  channelsApi,
  type Channel,
  type ChannelInput,
} from "@/lib/api";
import { formatTimeAgo } from "@/lib/utils";

const WEEK_DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const VOICES = [
  "en-AU-NatashaNeural-Female",
  "en-AU-WilliamNeural-Male",
  "en-US-AriaNeural-Female",
  "en-US-GuyNeural-Male",
  "en-US-JennyNeural-Female",
  "en-GB-SoniaNeural-Female",
  "en-GB-RyanNeural-Male",
];

const LLM_PROVIDERS = [
  { value: "", label: "— Use global default —" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "grok", label: "Grok (xAI)" },
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "groq", label: "Groq" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "aihubmix", label: "AIHubMix" },
  { value: "moonshot", label: "Moonshot" },
  { value: "minimax", label: "MiniMax" },
];

const EMPTY_FORM: ChannelInput = {
  name: "",
  description: "",
  niche: "",
  voice_name: "en-AU-NatashaNeural-Female",
  language: "en",
  video_source: "pexels",
  video_aspect: "9:16",
  video_concat_mode: "random",
  clip_duration: 3,
  target_duration: 60,
  paragraph_number: 1,
  subtitle_position: "bottom",
  script_prompt: "",
  subtitle_enabled: true,
  script_llm_provider: "",
  script_llm_model: "",
  schedule_enabled: false,
  videos_per_day: 1,
  schedule_days: "",
  schedule_time: "09:00",
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const [form, setForm] = useState<ChannelInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  async function load() {
    try {
      setChannels(await channelsApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing("new");
  }

  function openEdit(ch: Channel) {
    setForm({
      name: ch.name,
      description: ch.description,
      niche: ch.niche,
      voice_name: ch.voice_name,
      language: ch.language,
      video_source: ch.video_source,
      video_aspect: ch.video_aspect,
      video_concat_mode: ch.video_concat_mode,
      clip_duration: ch.clip_duration,
      target_duration: ch.target_duration,
      paragraph_number: ch.paragraph_number,
      subtitle_position: ch.subtitle_position,
      script_prompt: ch.script_prompt,
      subtitle_enabled: ch.subtitle_enabled !== false,
      script_llm_provider: ch.script_llm_provider || "",
      script_llm_model: ch.script_llm_model || "",
      schedule_enabled: !!ch.schedule_enabled,
      videos_per_day: ch.videos_per_day || 1,
      schedule_days: ch.schedule_days || "",
      schedule_time: ch.schedule_time || "09:00",
    });
    setEditing(ch);
  }

  function close() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    setBusy(true);
    try {
      if (editing === "new") {
        await channelsApi.create(form);
      } else if (editing) {
        await channelsApi.update(editing.id, form);
      }
      await load();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(ch: Channel) {
    if (!confirm(`Delete channel "${ch.name}"? Existing videos are kept.`)) return;
    setBusy(true);
    try {
      await channelsApi.remove(ch.id);
      await load();
      if (typeof editing === "object" && editing?.id === ch.id) close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateNow(ch: Channel) {
    setGenerating(ch.id);
    try {
      const res = await channelsApi.generateNow(ch.id);
      alert(`Generation started! Task ID: ${res.task_id}\nCheck the Library in a few minutes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(null);
    }
  }

  const update = <K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Channels"
        subtitle="Reusable presets — voice, source, aspect, duration, system prompt. Picked from the Generate page."
        action={
          <Button onClick={openNew}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New channel
          </Button>
        }
      />

      {error && (
        <Card className="mb-6 border-red-700/40 bg-red-900/10">
          <p className="text-sm text-red-200">{error}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* ---------- Channel list ---------- */}
        <div className="space-y-3">
          {channels?.length === 0 && (
            <Card>
              <div className="py-10 text-center text-sm text-muted">
                No channels yet. Create your first preset to streamline generation.
              </div>
            </Card>
          )}
          {channels?.map((ch) => {
            const selected = typeof editing === "object" && editing?.id === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => openEdit(ch)}
                className={`block w-full rounded-xl border bg-surface p-5 text-left transition-all ${
                  selected
                    ? "border-[var(--color-gold)] gold-glow"
                    : "border-border hover:border-border-strong"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-base font-semibold text-foreground">
                      {ch.name}
                    </h3>
                    {ch.niche && (
                      <p className="mt-0.5 truncate text-xs text-gold-soft">
                        {ch.niche}
                      </p>
                    )}
                    {ch.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        {ch.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{ch.video_aspect}</Badge>
                  <Badge>{ch.video_source}</Badge>
                  <Badge>{ch.target_duration}s</Badge>
                  <Badge tone="neutral">{ch.voice_name.split("-")[2] || ch.voice_name}</Badge>
                  {ch.schedule_enabled && (
                    <Badge tone="success">⏰ scheduled</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted">
                    Updated {formatTimeAgo(ch.updated_at)}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerateNow(ch); }}
                    disabled={generating === ch.id}
                    className="rounded-lg border border-[var(--color-gold)]/40 px-3 py-1 text-xs text-gold hover:bg-[var(--color-gold)]/10 disabled:opacity-50 transition-colors"
                  >
                    {generating === ch.id ? "Starting…" : "▶ Generate Now"}
                  </button>
                </div>
              </button>
            );
          })}
          {channels === null && (
            <Card>
              <div className="py-10 text-center text-sm text-muted">Loading…</div>
            </Card>
          )}
        </div>

        {/* ---------- Editor ---------- */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {editing ? (
            <Card>
              <CardHeader
                title={editing === "new" ? "New channel" : `Edit · ${editing.name}`}
                description="These values pre-fill the Generate form whenever this channel is selected."
                action={
                  editing !== "new" && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => onDelete(editing)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  )
                }
              />

              <form onSubmit={onSave} className="space-y-5">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name || ""}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Boston Couch Reviews"
                    required
                  />
                </div>

                <div>
                  <Label>Niche / topic</Label>
                  <Input
                    value={form.niche || ""}
                    onChange={(e) => update("niche", e.target.value)}
                    placeholder="memory foam couches, modern furniture"
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={form.description || ""}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="Short description of the channel."
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label>Voice</Label>
                    <Select
                      value={form.voice_name || ""}
                      onChange={(e) => update("voice_name", e.target.value)}
                    >
                      {VOICES.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Language</Label>
                    <Select
                      value={form.language || "en"}
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
                    <Label>Source</Label>
                    <Select
                      value={form.video_source || "pexels"}
                      onChange={(e) => update("video_source", e.target.value)}
                    >
                      <option value="pexels">Pexels</option>
                      <option value="pixabay">Pixabay</option>
                      <option value="local">Local materials</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Aspect</Label>
                    <Select
                      value={form.video_aspect || "9:16"}
                      onChange={(e) => update("video_aspect", e.target.value)}
                    >
                      <option value="9:16">9:16 — Vertical</option>
                      <option value="16:9">16:9 — Horizontal</option>
                      <option value="1:1">1:1 — Square</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Clip duration (sec)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={form.clip_duration ?? 3}
                      onChange={(e) =>
                        update("clip_duration", Number(e.target.value) || 3)
                      }
                    />
                  </div>
                  <div>
                    <Label>Target total (sec)</Label>
                    <Input
                      type="number"
                      min={15}
                      max={180}
                      value={form.target_duration ?? 60}
                      onChange={(e) =>
                        update("target_duration", Number(e.target.value) || 60)
                      }
                    />
                  </div>
                  <div>
                    <Label>Paragraphs</Label>
                    <Input
                      type="number"
                      min={1}
                      max={4}
                      value={form.paragraph_number ?? 1}
                      onChange={(e) =>
                        update("paragraph_number", Number(e.target.value) || 1)
                      }
                    />
                  </div>
                  <div>
                    <Label>Subtitle position</Label>
                    <Select
                      value={form.subtitle_position || "bottom"}
                      onChange={(e) => update("subtitle_position", e.target.value)}
                    >
                      <option value="bottom">Bottom</option>
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="subtitle_enabled"
                      checked={form.subtitle_enabled !== false}
                      onChange={(e) => update("subtitle_enabled", e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-[var(--color-gold)]"
                    />
                    <Label htmlFor="subtitle_enabled" className="cursor-pointer mb-0">
                      Enable subtitles
                    </Label>
                  </div>
                </div>

                <div>
                  <Label>Custom system prompt (optional)</Label>
                  <Textarea
                    value={form.script_prompt || ""}
                    onChange={(e) => update("script_prompt", e.target.value)}
                    placeholder="Override the default LLM system prompt for this channel."
                    rows={4}
                  />
                </div>

                <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gold-soft">
                    Script LLM Override
                  </p>
                  <p className="text-xs text-muted">
                    Choose a specific LLM for this channel's script &amp; research. Leave blank to use the global setting.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>LLM Provider</Label>
                      <Select
                        value={form.script_llm_provider || ""}
                        onChange={(e) => update("script_llm_provider", e.target.value)}
                      >
                        {LLM_PROVIDERS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Model name</Label>
                      <Input
                        value={form.script_llm_model || ""}
                        onChange={(e) => update("script_llm_model", e.target.value)}
                        placeholder="e.g. gpt-4o, claude-opus-4-5"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gold-soft">
                    Auto-Schedule
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="schedule_enabled"
                      checked={!!form.schedule_enabled}
                      onChange={(e) => update("schedule_enabled", e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-[var(--color-gold)]"
                    />
                    <Label htmlFor="schedule_enabled" className="cursor-pointer mb-0">
                      Enable automatic content generation
                    </Label>
                  </div>
                  {form.schedule_enabled && (
                    <div className="space-y-4 pt-1">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>Videos per day</Label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={form.videos_per_day ?? 1}
                            onChange={(e) => update("videos_per_day", Number(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <Label>Generation time (HH:MM, 24h)</Label>
                          <Input
                            type="time"
                            value={form.schedule_time || "09:00"}
                            onChange={(e) => update("schedule_time", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Active days</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {WEEK_DAYS.map((d) => {
                            const active = (form.schedule_days || "").split(",").map(s => s.trim()).includes(d.value);
                            return (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() => {
                                  const days = (form.schedule_days || "").split(",").map(s => s.trim()).filter(Boolean);
                                  const next = active
                                    ? days.filter(x => x !== d.value)
                                    : [...days, d.value];
                                  update("schedule_days", next.join(","));
                                }}
                                className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                                  active
                                    ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10 text-gold"
                                    : "border-border text-muted hover:border-border-strong"
                                }`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => update("schedule_days", "mon,tue,wed,thu,fri,sat,sun")}
                            className="rounded-lg border border-border px-3 py-1 text-xs text-muted hover:border-border-strong transition-colors"
                          >
                            All days
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-muted">Leave days unselected to run every day.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" loading={busy}>
                    {editing === "new" ? "Create channel" : "Save changes"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  {editing !== "new" && typeof editing === "object" && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onGenerateNow(editing)}
                      disabled={generating === editing.id}
                    >
                      {generating === editing.id ? "Starting…" : "▶ Generate Now"}
                    </Button>
                  )}
                </div>
              </form>
            </Card>
          ) : (
            <Card>
              <div className="py-12 text-center text-sm text-muted">
                Select a channel to edit, or click <span className="text-gold">New channel</span>.
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
