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
import { platformApi, settingsApi, type Settings } from "@/lib/api";

interface Avatar {
  avatar_id: string;
  name: string;
  preview_url?: string;
}

interface Voice {
  voice_id: string;
  name: string;
  language?: string;
}

export default function AvatarPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [script, setScript] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const [s, a, v] = await Promise.all([
        settingsApi.get(),
        platformApi.avatar.listAvatars(),
        platformApi.avatar.listVoices(),
      ]);
      setSettings(s);
      setAvatars(a || []);
      setVoices(v || []);
      setAvatarId(s.heygen_default_avatar || (a && a.length > 0 ? a[0].avatar_id : "") || "");
      setVoiceId(s.heygen_default_voice || (v && v.length > 0 ? v[0].voice_id : "") || "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!script.trim()) {
      setError("Please enter a script");
      return;
    }
    if (!avatarId) {
      setError("Please select an avatar");
      return;
    }
    if (!voiceId) {
      setError("Please select a voice");
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await platformApi.avatar.generate({
        script: script.trim(),
        avatar_id: avatarId,
        voice_id: voiceId,
      });
      setGeneratedVideo(result.video_path || result.video_url);
      setSuccessMsg("✅ Avatar video generated successfully!");
      setScript("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (!settings?.heygen_enabled) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Avatar Generation"
          subtitle="Create talking head videos with AI avatars"
        />
        <Card className="border-yellow-700/40 bg-yellow-900/10">
          <div className="py-8 text-center">
            <p className="text-yellow-200">
              ⚠️ HeyGen integration is not enabled. Please configure it in{" "}
              <a href="/settings" className="underline hover:no-underline">
                Settings
              </a>
              .
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Avatar Generation"
        subtitle="Create talking head videos with HeyGen avatars"
      />

      {error && (
        <Card className="mb-6 border-red-700/40 bg-red-900/10">
          <p className="text-sm text-red-200">{error}</p>
        </Card>
      )}

      {successMsg && (
        <Card className="mb-6 border-green-700/40 bg-green-900/10">
          <p className="text-sm text-green-200">{successMsg}</p>
        </Card>
      )}

      <form onSubmit={onGenerate} className="space-y-6">
        {/* Script Input */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Script</h2>
            <p className="mt-1 text-sm text-muted">
              Enter the script the avatar will speak
            </p>
          </CardHeader>
          <div className="space-y-2 p-4 pt-0">
            <Textarea
              placeholder="Enter avatar script here..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-muted">{script.length} characters</p>
          </div>
        </Card>

        {/* Avatar & Voice Selection */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Avatar Settings</h2>
          </CardHeader>
          <div className="space-y-4 p-4 pt-0">
            {/* Avatar Selection */}
            {loading ? (
              <div className="py-4 text-center">
                <p className="text-sm text-muted">Loading avatars...</p>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="avatar">Avatar</Label>
                  <Select
                    id="avatar"
                    value={avatarId}
                    onChange={(e) => setAvatarId(e.target.value)}
                  >
                    <option value="">Select an avatar</option>
                    {avatars.map((a) => (
                      <option key={a.avatar_id} value={a.avatar_id}>
                        {a.name || a.avatar_id}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="voice">Voice</Label>
                  <Select
                    id="voice"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                  >
                    <option value="">Select a voice</option>
                    {voices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name || v.voice_id}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Generated Video Preview */}
        {generatedVideo && (
          <Card className="border-green-700/40 bg-green-900/10">
            <CardHeader>
              <h2 className="text-lg font-semibold">Generated Video</h2>
            </CardHeader>
            <div className="space-y-4 p-4 pt-0">
              <video
                controls
                src={generatedVideo}
                className="w-full rounded-lg bg-black"
              />
              <p className="break-all text-xs text-muted">{generatedVideo}</p>
            </div>
          </Card>
        )}

        {/* Action Button */}
        <Button
          type="submit"
          disabled={generating || loading}
          className="w-full"
        >
          {generating ? "Generating..." : "Generate Avatar Video"}
        </Button>
      </form>
    </div>
  );
}
