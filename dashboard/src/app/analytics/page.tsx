"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import {
  analyticsApi,
  libraryApi,
  type AnalyticsEntry,
  type AnalyticsUpdate,
  type LibraryItem,
} from "@/lib/api";
import { formatTimeAgo } from "@/lib/utils";

export default function AnalyticsPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [metrics, setMetrics] = useState<Record<string, AnalyticsEntry>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [lib, analytics] = await Promise.all([
        libraryApi.list(),
        analyticsApi.list(),
      ]);
      setItems(lib);
      const map: Record<string, AnalyticsEntry> = {};
      for (const entry of analytics) {
        map[entry.task_id] = entry;
      }
      setMetrics(map);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSave(taskId: string, update: AnalyticsUpdate) {
    setSaving(true);
    try {
      const saved = await analyticsApi.upsert(taskId, update);
      setMetrics((prev) => ({ ...prev, [taskId]: saved }));
      setEditId(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Analytics"
        subtitle="Manual performance tracking per video (views, CTR, retention)"
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Card className="mb-6 border-red-700/40 bg-red-900/10">
          <p className="text-sm text-red-200">{error}</p>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-muted-strong">No videos yet.</p>
            <p className="mt-2 text-sm text-muted">
              Generate some videos first, then track their performance here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium text-right">Views</th>
                <th className="px-4 py-3 font-medium text-right">Likes</th>
                <th className="px-4 py-3 font-medium text-right">Comments</th>
                <th className="px-4 py-3 font-medium text-right">CTR %</th>
                <th className="px-4 py-3 font-medium text-right">Retention %</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const m = metrics[item.task_id];
                const isEditing = editId === item.task_id;
                return (
                  <AnalyticsRow
                    key={item.task_id}
                    item={item}
                    entry={m || null}
                    isEditing={isEditing}
                    saving={saving}
                    onEdit={() => setEditId(item.task_id)}
                    onCancel={() => setEditId(null)}
                    onSave={(u) => onSave(item.task_id, u)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RowProps {
  item: LibraryItem;
  entry: AnalyticsEntry | null;
  isEditing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (update: AnalyticsUpdate) => void;
}

function AnalyticsRow({
  item,
  entry,
  isEditing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: RowProps) {
  const [form, setForm] = useState<AnalyticsUpdate>({
    platform: entry?.platform || "youtube",
    views: entry?.views || 0,
    likes: entry?.likes || 0,
    comments: entry?.comments || 0,
    ctr: entry?.ctr || 0,
    retention: entry?.retention || 0,
    notes: entry?.notes || "",
  });

  useEffect(() => {
    setForm({
      platform: entry?.platform || "youtube",
      views: entry?.views || 0,
      likes: entry?.likes || 0,
      comments: entry?.comments || 0,
      ctr: entry?.ctr || 0,
      retention: entry?.retention || 0,
      notes: entry?.notes || "",
    });
  }, [entry, isEditing]);

  if (!isEditing) {
    return (
      <tr className="border-b border-border/50 hover:bg-surface-2/50">
        <td className="px-4 py-3">
          <div className="max-w-[180px] truncate font-medium text-foreground">
            {item.subject || item.task_id.slice(0, 8)}
          </div>
          <div className="text-xs text-muted">{formatTimeAgo(item.created_at)}</div>
        </td>
        <td className="px-4 py-3 text-muted-strong">{entry?.platform || "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums">{entry?.views ?? "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums">{entry?.likes ?? "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums">{entry?.comments ?? "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {entry?.ctr != null ? `${entry.ctr}%` : "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {entry?.retention != null ? `${entry.retention}%` : "—"}
        </td>
        <td className="px-4 py-3 text-muted">
          <div className="max-w-[120px] truncate">{entry?.notes || "—"}</div>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onEdit}
            className="rounded px-2 py-1 text-xs text-gold-soft hover:bg-surface-2"
          >
            Edit
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[var(--color-gold)]/30 bg-[var(--color-gold-glow)]">
      <td className="px-4 py-3">
        <div className="max-w-[180px] truncate font-medium text-foreground">
          {item.subject || item.task_id.slice(0, 8)}
        </div>
      </td>
      <td className="px-4 py-2">
        <select
          value={form.platform}
          onChange={(e) => setForm({ ...form, platform: e.target.value })}
          className="h-8 rounded border border-border bg-bg px-2 text-xs text-foreground"
        >
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          value={form.views ?? 0}
          onChange={(e) => setForm({ ...form, views: Number(e.target.value) })}
          className="h-8 w-20 text-right text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          value={form.likes ?? 0}
          onChange={(e) => setForm({ ...form, likes: Number(e.target.value) })}
          className="h-8 w-20 text-right text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          value={form.comments ?? 0}
          onChange={(e) => setForm({ ...form, comments: Number(e.target.value) })}
          className="h-8 w-20 text-right text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          step="0.1"
          value={form.ctr ?? 0}
          onChange={(e) => setForm({ ...form, ctr: Number(e.target.value) })}
          className="h-8 w-20 text-right text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          step="0.1"
          value={form.retention ?? 0}
          onChange={(e) => setForm({ ...form, retention: Number(e.target.value) })}
          className="h-8 w-20 text-right text-xs"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="text"
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notes…"
          className="h-8 w-28 text-xs"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex gap-1 justify-end">
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={saving}
            className="rounded bg-[var(--color-gold)] px-2 py-1 text-xs font-medium text-black hover:bg-[var(--color-gold-soft)] disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs text-muted-strong hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
