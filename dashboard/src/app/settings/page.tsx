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
  
  // HeyGen settings
  const [heygenKey, setHeygenKey] = useState("");
  const [heygenAvatar, setHeygenAvatar] = useState("");
  const [heygenVoice, setHeygenVoice] = useState("");
  const [heygenEnabled, setHeygenEnabled] = useState(false);
  
  // YouTube settings
  const [youtubeKey, setYoutubeKey] = useState("");
  const [youtubeClientId, setYoutubeClientId] = useState("");
  const [youtubeClientSecret, setYoutubeClientSecret] = useState("");
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState("");
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const [youtubePrivacy, setYoutubePrivacy] = useState("unlisted");

  async function load() {
    try {
      const data = await settingsApi.get();
      setSettings(data);
      setOpenaiBase(data.openai_base_url || "");
      setOpenaiModel(data.openai_model_name || "");
      setLlmProvider(data.llm_provider || "openai");
      setVideoSource(data.video_source || "pexels");
      setHeygenAvatar(data.heygen_default_avatar || "amanda-en");
      setHeygenVoice(data.heygen_default_voice || "en-US-SarahNeural");
      setHeygenEnabled(data.heygen_enabled || false);
      setYoutubeEnabled(data.youtube_enabled || false);
      setYoutubePrivacy(data.youtube_privacy_status || "unlisted");
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
      heygen_enabled: heygenEnabled,
      heygen_default_avatar: heygenAvatar,
      heygen_default_voice: heygenVoice,
      youtube_enabled: youtubeEnabled,
      youtube_privacy_status: youtubePrivacy,
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
    if (heygenKey.trim()) patch.heygen_api_key = heygenKey.trim();
    if (youtubeKey.trim()) patch.youtube_api_key = youtubeKey.trim();
    if (youtubeClientId.trim()) patch.youtube_client_id = youtubeClientId.trim();
    if (youtubeClientSecret.trim()) patch.youtube_client_secret = youtubeClientSecret.trim();
    if (youtubeRefreshToken.trim()) patch.youtube_refresh_token = youtubeRefreshToken.trim();

    try {
      const data = await settingsApi.update(patch);
      setSettings(data);
      setOpenaiKey("");
      setPexels("");
      setPixabay("");
      setHeygenKey("");
      setYoutubeKey("");
      setYoutubeClientId("");
      setYoutubeClientSecret("");
      setYoutubeRefreshToken("");
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

        {/* ---------- HeyGen Avatar ---------- */}
        <Card>
          <CardHeader
            title="HeyGen Avatar"
            description="AI-powered talking head videos with avatar and voice customization."
            action={
              settings?.heygen_api_key_set ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Not set</Badge>
              )
            }
          />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="heygen-enabled"
                checked={heygenEnabled}
                onChange={(e) => setHeygenEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface"
              />
              <Label htmlFor="heygen-enabled" className="mb-0">
                Enable avatar generation
              </Label>
            </div>

            <div>
              <Label>API Key</Label>
              <Input
                type="password"
                value={heygenKey}
                onChange={(e) => setHeygenKey(e.target.value)}
                placeholder={
                  settings?.heygen_api_key_set
                    ? "••••••••••••••• (configured)"
                    : "Paste your HeyGen API key…"
                }
              />
              <p className="mt-1.5 text-xs text-muted">
                Get it from{" "}
                <a
                  href="https://www.heygen.com/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-soft hover:underline"
                >
                  heygen.com/api
                </a>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Default Avatar</Label>
                <Input
                  value={heygenAvatar}
                  onChange={(e) => setHeygenAvatar(e.target.value)}
                  placeholder="amanda-en"
                />
              </div>
              <div>
                <Label>Default Voice</Label>
                <Input
                  value={heygenVoice}
                  onChange={(e) => setHeygenVoice(e.target.value)}
                  placeholder="en-US-SarahNeural"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ---------- YouTube Upload ---------- */}
        <Card>
          <CardHeader
            title="YouTube Auto-Upload"
            description="Automatically publish videos to YouTube with metadata and playlist support."
            action={
              settings?.youtube_api_key_set ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Not set</Badge>
              )
            }
          />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="youtube-enabled"
                checked={youtubeEnabled}
                onChange={(e) => setYoutubeEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface"
              />
              <Label htmlFor="youtube-enabled" className="mb-0">
                Enable auto-upload
              </Label>
            </div>

            <div>
              <Label>API Key</Label>
              <Input
                type="password"
                value={youtubeKey}
                onChange={(e) => setYoutubeKey(e.target.value)}
                placeholder={
                  settings?.youtube_api_key_set
                    ? "••••••••••••••• (configured)"
                    : "Paste your YouTube Data API key…"
                }
              />
              <p className="mt-1.5 text-xs text-muted">
                Create at{" "}
                <a
                  href="https://console.cloud.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-soft hover:underline"
                >
                  Google Cloud Console
                </a>
              </p>
            </div>

            <div>
              <Label>OAuth Client ID</Label>
              <Input
                type="password"
                value={youtubeClientId}
                onChange={(e) => setYoutubeClientId(e.target.value)}
                placeholder={
                  settings?.youtube_client_id_set
                    ? "••••••••••••••• (configured)"
                    : "xxxx.apps.googleusercontent.com"
                }
              />
            </div>

            <div>
              <Label>OAuth Client Secret</Label>
              <Input
                type="password"
                value={youtubeClientSecret}
                onChange={(e) => setYoutubeClientSecret(e.target.value)}
                placeholder={
                  settings?.youtube_client_secret_set
                    ? "••••••••••••••• (configured)"
                    : "Paste OAuth client secret…"
                }
              />
            </div>

            <div>
              <Label>Refresh Token</Label>
              <Input
                type="password"
                value={youtubeRefreshToken}
                onChange={(e) => setYoutubeRefreshToken(e.target.value)}
                placeholder={
                  settings?.youtube_refresh_token_set
                    ? "••••••••••••••• (configured)"
                    : "Paste OAuth refresh token…"
                }
              />
              <p className="mt-1.5 text-xs text-muted">
                Generate via OAuth flow in the app
              </p>
            </div>

            <div>
              <Label>Default Privacy Status</Label>
              <Select value={youtubePrivacy} onChange={(e) => setYoutubePrivacy(e.target.value)}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </Select>
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
