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

const VOICES = [
  "en-AU-NatashaNeural-Female",
  "en-AU-WilliamNeural-Male",
  "en-US-AriaNeural-Female",
  "en-US-GuyNeural-Male",
  "en-US-JennyNeural-Female",
  "en-GB-SoniaNeural-Female",
  "en-GB-RyanNeural-Male",
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
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const [form, setForm] = useState<ChannelInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

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
                </div>
                <p className="mt-3 text-[11px] text-muted">
                  Updated {formatTimeAgo(ch.updated_at)}
                </p>
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

                <div className="flex items-center gap-3">
                  <Button type="submit" loading={busy}>
                    {editing === "new" ? "Create channel" : "Save changes"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
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
