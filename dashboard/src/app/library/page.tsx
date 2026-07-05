"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { libraryApi, publishApi, type LibraryItem } from "@/lib/api";
import { formatBytes, formatTimeAgo } from "@/lib/utils";

const DEFAULT_ASPECT = 9 / 16; // vertical Shorts — covers 90% of generated content

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [publishConfigured, setPublishConfigured] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await libraryApi.list();
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    publishApi.status().then((s) => setPublishConfigured(s.configured)).catch(() => {});
  }, []);

  async function onDelete(item: LibraryItem) {
    if (
      !confirm(
        `Delete this video and all its files?\n\n${item.subject || item.task_id}`
      )
    )
      return;
    setBusy(true);
    try {
      await libraryApi.remove(item.task_id);
      if (playingId === item.task_id) setPlayingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish(item: LibraryItem) {
    setPublishingId(item.task_id);
    try {
      await publishApi.publish({
        task_id: item.task_id,
        title: item.subject || `Video ${item.task_id.slice(0, 8)}`,
      });
      alert("Published successfully!");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingId(null);
    }
  }

  function rememberAspect(taskId: string, w: number, h: number) {
    if (!w || !h) return;
    const ratio = w / h;
    setAspects((prev) =>
      prev[taskId] && Math.abs(prev[taskId] - ratio) < 0.01
        ? prev
        : { ...prev, [taskId]: ratio }
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Library"
        subtitle={
          items
            ? `${items.length} video${items.length === 1 ? "" : "s"} on disk`
            : "Loading…"
        }
        action={
          <Button variant="secondary" onClick={load} disabled={busy}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Card className="mb-6 border-red-700/40 bg-red-900/10">
          <p className="text-sm text-red-200">{error}</p>
        </Card>
      )}

      {items && items.length === 0 && (
        <Card>
          <div className="py-12 text-center">
            <p className="text-muted-strong">No videos yet.</p>
            <p className="mt-2 text-sm text-muted">
              Head over to <span className="text-gold">Generate</span> to create
              your first one.
            </p>
          </div>
        </Card>
      )}

      {/* items-start keeps tops aligned even when cards have different heights */}
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items?.map((item) => (
          <LibraryCard
            key={item.task_id}
            item={item}
            aspect={aspects[item.task_id] ?? DEFAULT_ASPECT}
            isPlaying={playingId === item.task_id}
            onPlay={() => setPlayingId(item.task_id)}
            onStop={() => setPlayingId(null)}
            onMetadata={(w, h) => rememberAspect(item.task_id, w, h)}
            onDelete={() => onDelete(item)}
            onPublish={() => onPublish(item)}
            publishConfigured={publishConfigured}
            isPublishing={publishingId === item.task_id}
            disabled={busy}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface LibraryCardProps {
  item: LibraryItem;
  aspect: number;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onMetadata: (videoWidth: number, videoHeight: number) => void;
  onDelete: () => void;
  onPublish: () => void;
  publishConfigured: boolean;
  isPublishing: boolean;
  disabled: boolean;
}

function LibraryCard({
  item,
  aspect,
  isPlaying,
  onPlay,
  onStop,
  onMetadata,
  onDelete,
  onPublish,
  publishConfigured,
  isPublishing,
  disabled,
}: LibraryCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Pause + reset when the user stops this card.
  useEffect(() => {
    if (!isPlaying && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-xl border bg-surface transition-all ${
        isPlaying
          ? "border-[var(--color-gold)] gold-glow"
          : "border-border hover:border-border-strong"
      }`}
    >
      {/* Video frame — aspect-locked to the actual video dimensions */}
      <div
        className="relative w-full overflow-hidden bg-black"
        style={{ aspectRatio: aspect }}
      >
        {isPlaying ? (
          <video
            ref={videoRef}
            src={item.final_url}
            className="absolute inset-0 h-full w-full object-contain"
            controls
            autoPlay
            playsInline
            onEnded={onStop}
            onLoadedMetadata={(e) =>
              onMetadata(
                e.currentTarget.videoWidth,
                e.currentTarget.videoHeight
              )
            }
          />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="absolute inset-0 block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]"
            aria-label={`Play ${item.subject || item.task_id}`}
          >
            <video
              /* #t=1.5 forces a real first-frame paint instead of a black metadata-only frame */
              src={`${item.thumbnail_url}#t=1.5`}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              preload="metadata"
              playsInline
              disablePictureInPicture
              onLoadedMetadata={(e) =>
                onMetadata(
                  e.currentTarget.videoWidth,
                  e.currentTarget.videoHeight
                )
              }
            />
            {/* Hover scrim + gold play button */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-150 group-hover:bg-black/40">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-gold)] text-black shadow-lg transition-transform duration-150 group-hover:scale-110">
                <svg
                  className="ml-0.5 h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </div>
            <div className="absolute right-2 top-2">
              <Badge tone="gold" className="text-[10px]">
                {formatBytes(item.size_bytes)}
              </Badge>
            </div>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 p-4">
        <div>
          <p
            className="truncate text-sm font-medium text-foreground"
            title={item.subject || item.task_id}
          >
            {item.subject || `Task ${item.task_id.slice(0, 8)}`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatTimeAgo(item.created_at)}
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href={item.download_url}
            download
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--color-gold-deep)]/50 bg-[var(--color-gold-glow)] px-3 text-xs font-medium text-gold-soft transition-colors hover:bg-[var(--color-gold)]/20"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </a>
          {publishConfigured && (
            <button
              type="button"
              onClick={onPublish}
              disabled={disabled || isPublishing}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-red-500/50 bg-red-900/10 px-3 text-xs font-medium text-red-200 transition-colors hover:border-red-400 hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-50"
              title="Publish to YouTube / social"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4z" />
              </svg>
              {isPublishing ? "…" : "Publish"}
            </button>
          )}
          {isPlaying && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-strong px-3 text-xs font-medium text-muted-strong transition-colors hover:bg-surface-2 hover:text-foreground"
              title="Stop playback"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="inline-flex h-9 items-center justify-center rounded-md border border-red-700/40 px-3 text-xs font-medium text-red-300 transition-colors hover:border-red-500 hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-50"
            title="Delete video"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
