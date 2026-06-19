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
} from "@/components/ui";
import { settingsApi, type Settings } from "@/lib/api";

const RECOMMENDED_MODELS = [
  "gpt-4.1-2025-04-14",
  "gpt-5-mini",
  "gpt-4o-mini-2024-07-18",
  "claude-haiku-4.5",
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local edit buffer — null means "don't change" (so masked secrets stay safe)
  const [pexels, setPexels] = useState("");
  const [pixabay, setPixabay] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBase, setOpenaiBase] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [llmProvider, setLlmProvider] = useState("openai");
  const [videoSource, setVideoSource] = useState("pexels");

  async function load() {
    try {
      const data = await settingsApi.get();
      setSettings(data);
      setOpenaiBase(data.openai_base_url || "");
      setOpenaiModel(data.openai_model_name || "");
      setLlmProvider(data.llm_provider || "openai");
      setVideoSource(data.video_source || "pexels");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const patch: Partial<Settings> = {
      llm_provider: llmProvider,
      video_source: videoSource,
      openai_base_url: openaiBase,
      openai_model_name: openaiModel,
    };
    if (openaiKey.trim()) patch.openai_api_key = openaiKey.trim();
    if (pexels.trim())
      patch.pexels_api_keys = pexels
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (pixabay.trim())
      patch.pixabay_api_keys = pixabay
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    try {
      const data = await settingsApi.update(patch);
      setSettings(data);
      setOpenaiKey("");
      setPexels("");
      setPixabay("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="API keys, LLM provider, and engine defaults. Saved to config.toml."
      />

      {error && (
        <Card className="mb-6 border-red-700/40 bg-red-900/10">
          <p className="text-sm text-red-200">{error}</p>
        </Card>
      )}

      <form onSubmit={onSave} className="space-y-6">
        {/* ---------- LLM ---------- */}
        <Card>
          <CardHeader
            title="LLM provider"
            description="The model used to write scripts and pick search terms."
            action={
              settings?.openai_api_key_set ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Not set</Badge>
              )
            }
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>Provider</Label>
              <Select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
              >
                <option value="openai">OpenAI-compatible</option>
                <option value="ollama">Ollama (local)</option>
                <option value="pollinations">Pollinations (free)</option>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              <div className="relative">
                <Input
                  list="model-list"
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  placeholder="gpt-4.1-2025-04-14"
                />
                <datalist id="model-list">
                  {RECOMMENDED_MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Base URL</Label>
              <Input
                value={openaiBase}
                onChange={(e) => setOpenaiBase(e.target.value)}
                placeholder="http://127.0.0.1:4141/v1"
              />
              <p className="mt-1.5 text-xs text-muted">
                Point at the local Copilot tunnel for free Pro models, or any
                OpenAI-compatible endpoint.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>API key</Label>
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={
                  settings?.openai_api_key_set
                    ? settings.openai_api_key
                    : "Paste a new key…"
                }
              />
              <p className="mt-1.5 text-xs text-muted">
                Leave blank to keep the existing key.
              </p>
            </div>
          </div>
        </Card>

        {/* ---------- Stock video ---------- */}
        <Card>
          <CardHeader
            title="Stock video sources"
            description="API keys for Pexels and Pixabay B-roll."
          />

          <div className="space-y-5">
            <div>
              <Label>Default source</Label>
              <Select
                value={videoSource}
                onChange={(e) => setVideoSource(e.target.value)}
              >
                <option value="pexels">Pexels</option>
                <option value="pixabay">Pixabay</option>
                <option value="local">Local materials</option>
              </Select>
            </div>

            <div>
              <Label>
                <span className="flex items-center justify-between">
                  Pexels API keys
                  {settings?.pexels_api_keys_set ? (
                    <Badge tone="success">Set</Badge>
                  ) : (
                    <Badge tone="warning">Empty</Badge>
                  )}
                </span>
              </Label>
              <Input
                type="password"
                value={pexels}
                onChange={(e) => setPexels(e.target.value)}
                placeholder={
                  settings?.pexels_api_keys?.[0] ||
                  "Comma-separated keys (rotated round-robin)"
                }
              />
            </div>

            <div>
              <Label>
                <span className="flex items-center justify-between">
                  Pixabay API keys
                  {settings?.pixabay_api_keys_set ? (
                    <Badge tone="success">Set</Badge>
                  ) : (
                    <Badge tone="warning">Empty</Badge>
                  )}
                </span>
              </Label>
              <Input
                type="password"
                value={pixabay}
                onChange={(e) => setPixabay(e.target.value)}
                placeholder={
                  settings?.pixabay_api_keys?.[0] ||
                  "Comma-separated keys (rotated round-robin)"
                }
              />
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            Save settings
          </Button>
          {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
        </div>
      </form>
    </div>
  );
}
