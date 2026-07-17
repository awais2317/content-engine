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
import { libraryApi, platformApi, settingsApi, type LibraryItem, type Settings } from "@/lib/api";

interface UploadStatus {
  video_id: string;
  youtube_url: string;
  upload_status: string;
  uploaded_at: string;
}

export default function UploadPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadStatus | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [selectedVideo, setSelectedVideo] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("unlisted");
  const [playlistId, setPlaylistId] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const [s, lib] = await Promise.all([
        settingsApi.get(),
        libraryApi.list(),
      ]);
      setSettings(s);
      setLibrary(lib || []);
      setPrivacy(s.youtube_privacy_status || "unlisted");
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

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVideo) {
      setError("Please select a video");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await platformApi.youtube.upload({
        video_path: selectedVideo,
        title: title.trim(),
        description: description.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        privacy_status: privacy,
        thumbnail_path: undefined, // Optional
        playlist_id: playlistId || undefined,
      });
      setUploadResult(result);
      setSuccessMsg("✅ Video uploaded to YouTube successfully!");
      setTitle("");
      setDescription("");
      setTags("");
      setSelectedVideo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  if (!settings?.youtube_enabled) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="YouTube Upload"
          subtitle="Upload videos directly to YouTube"
        />
        <Card className="border-yellow-700/40 bg-yellow-900/10">
          <div className="py-8 text-center">
            <p className="text-yellow-200">
              ⚠️ YouTube integration is not enabled. Please configure it in{" "}
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
        title="YouTube Upload"
        subtitle="Upload videos directly to YouTube with metadata"
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

      <form onSubmit={onUpload} className="space-y-6">
        {/* Video Selection */}
        <Card>
          <CardHeader
            title="Select Video"
            description="Choose a video from your library to upload"
          />
          <div className="space-y-2 p-4 pt-0">
            {loading ? (
              <p className="text-sm text-muted">Loading library...</p>
            ) : (
              <Select
                value={selectedVideo}
                onChange={(e) => setSelectedVideo(e.target.value)}
              >
                <option value="">Select a video</option>
                {library.map((item) => (
                  <option key={item.id} value={item.video_path || item.id}>
                    {item.title || item.id}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader title="Video Metadata" />
          <div className="space-y-4 p-4 pt-0">
            {/* Title */}
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Video title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="mt-1 text-xs text-muted">{title.length}/100</p>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Video description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={5000}
                className="resize-none"
              />
              <p className="mt-1 text-xs text-muted">{description.length}/5000</p>
            </div>

            {/* Tags */}
            <div>
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                placeholder="tag1, tag2, tag3 (comma-separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            {/* Privacy */}
            <div>
              <Label htmlFor="privacy">Privacy Status</Label>
              <Select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </Select>
            </div>

            {/* Playlist ID */}
            <div>
              <Label htmlFor="playlist">Playlist ID (optional)</Label>
              <Input
                id="playlist"
                placeholder="YouTube playlist ID (optional)"
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Upload Result */}
        {uploadResult && (
          <Card className="border-green-700/40 bg-green-900/10">
            <CardHeader title="Upload Complete" />
            <div className="space-y-3 p-4 pt-0">
              <div>
                <p className="text-xs text-muted">Video ID</p>
                <p className="break-all font-mono text-sm">{uploadResult.video_id}</p>
              </div>
              <div>
                <p className="text-xs text-muted">YouTube URL</p>
                <a
                  href={uploadResult.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 underline hover:no-underline"
                >
                  {uploadResult.youtube_url}
                </a>
              </div>
              <div>
                <p className="text-xs text-muted">Status</p>
                <Badge>{uploadResult.upload_status}</Badge>
              </div>
            </div>
          </Card>
        )}

        {/* Action Button */}
        <Button
          type="submit"
          disabled={uploading || loading}
          className="w-full"
        >
          {uploading ? "Uploading..." : "Upload to YouTube"}
        </Button>
      </form>
    </div>
  );
}
