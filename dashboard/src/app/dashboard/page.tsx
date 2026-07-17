"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import { platformApi, type AnalyticsSummary } from "@/lib/api";

interface MetricCard {
  label: string;
  value: string | number;
  unit?: string;
  color?: "primary" | "success" | "warning" | "error";
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function load() {
    try {
      const data = await platformApi.analytics();
      setAnalytics(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader title="Analytics Dashboard" subtitle="Platform metrics" />
        <Card>
          <div className="py-12 text-center">
            <p className="text-sm text-muted">Loading analytics...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader title="Analytics Dashboard" subtitle="Platform metrics" />
        <Card className="border-red-700/40 bg-red-900/10">
          <p className="text-sm text-red-200">
            {error || "Failed to load analytics"}
          </p>
        </Card>
      </div>
    );
  }

  const successRate = analytics.success_rate_percent || 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Analytics Dashboard"
        subtitle="Real-time platform metrics and performance"
        action={
          <div className="flex gap-2">
            <Button
              variant={autoRefresh ? "primary" : "secondary"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "🔄 Auto" : "Manual"}
            </Button>
            <Button variant="secondary" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Key Metrics */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Videos */}
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm text-muted">Videos Generated (All Time)</h3>
          </div>
          <div className="px-4 pb-4 pt-4">
            <p className="text-3xl font-bold">{analytics.total_videos_all_time || 0}</p>
            <p className="mt-2 text-xs text-muted">
              30d: {analytics.total_videos_30d || 0} | 7d:{" "}
              {analytics.total_videos_7d || 0}
            </p>
          </div>
        </Card>

        {/* Success Rate */}
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm text-muted">Success Rate</h3>
          </div>
          <div className="px-4 pb-4 pt-4">
            <p className="text-3xl font-bold">{successRate.toFixed(1)}%</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-surface">
              <div
                className="h-full bg-green-500/60"
                style={{ width: `${successRate}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Videos by Channel */}
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm text-muted">Active Channels</h3>
          </div>
          <div className="px-4 pb-4 pt-4">
            <p className="text-3xl font-bold">
              {Object.keys(analytics.videos_by_channel || {}).length}
            </p>
            <p className="mt-2 text-xs text-muted">
              channels with generated videos
            </p>
          </div>
        </Card>

        {/* Storage Used */}
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm text-muted">Total Storage</h3>
          </div>
          <div className="px-4 pb-4 pt-4">
            <p className="text-3xl font-bold">
              {analytics.storage_stats?.total_size_gb
                ? analytics.storage_stats.total_size_gb.toFixed(2)
                : 0}
              GB
            </p>
            {analytics.storage_stats?.estimated_monthly_cost && (
              <p className="mt-2 text-xs text-muted">
                ${analytics.storage_stats.estimated_monthly_cost.toFixed(2)}/mo
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Videos by Channel */}
      {analytics.videos_by_channel &&
        Object.keys(analytics.videos_by_channel).length > 0 && (
          <Card className="mb-8">
            <CardHeader title="Videos by Channel" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase text-muted">
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium text-right">Videos</th>
                    <th className="px-4 py-3 font-medium text-right">Success</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analytics.videos_by_channel).map(
                    ([channel, count]) => (
                      <tr key={channel} className="border-t border-border">
                        <td className="px-4 py-3">{channel}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {count}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge>{successRate.toFixed(0)}%</Badge>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      {/* Video Stats */}
      {analytics.video_stats && (
        <Card className="mb-8">
          <CardHeader title="Video Generation Stats" />
          <div className="grid grid-cols-2 gap-4 p-4 pt-0 md:grid-cols-4">
            {analytics.video_stats.total_generated !== undefined && (
              <div>
                <p className="text-xs text-muted">Total Generated</p>
                <p className="mt-1 text-2xl font-bold">
                  {analytics.video_stats.total_generated}
                </p>
              </div>
            )}
            {analytics.video_stats.total_with_subtitles !== undefined && (
              <div>
                <p className="text-xs text-muted">With Subtitles</p>
                <p className="mt-1 text-2xl font-bold">
                  {analytics.video_stats.total_with_subtitles}
                </p>
              </div>
            )}
            {analytics.video_stats.youtube_uploads !== undefined && (
              <div>
                <p className="text-xs text-muted">YouTube Uploads</p>
                <p className="mt-1 text-2xl font-bold">
                  {analytics.video_stats.youtube_uploads}
                </p>
              </div>
            )}
            {analytics.video_stats.avatar_videos !== undefined && (
              <div>
                <p className="text-xs text-muted">Avatar Videos</p>
                <p className="mt-1 text-2xl font-bold">
                  {analytics.video_stats.avatar_videos}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* LLM Distribution */}
      {analytics.llm_distribution &&
        Object.keys(analytics.llm_distribution).length > 0 && (
          <Card className="mb-8">
            <CardHeader title="LLM Provider Distribution" />
            <div className="space-y-3 p-4 pt-0">
              {Object.entries(analytics.llm_distribution).map(
                ([provider, count]) => (
                  <div key={provider}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{provider}</span>
                      <span className="font-mono text-sm font-bold">{count}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded bg-surface">
                      <div
                        className="h-full bg-blue-500/60"
                        style={{
                          width: `${
                            (count /
                              (analytics.total_videos_all_time || 1)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          </Card>
        )}

      {/* Storage Breakdown */}
      {analytics.storage_stats && (
        <Card>
          <CardHeader title="Storage Breakdown" />
          <div className="grid grid-cols-1 gap-4 p-4 pt-0 md:grid-cols-2">
            {analytics.storage_stats.s3_size_gb !== undefined && (
              <div>
                <p className="text-sm text-muted">S3 Storage</p>
                <p className="mt-2 text-2xl font-bold">
                  {analytics.storage_stats.s3_size_gb.toFixed(2)} GB
                </p>
                {analytics.storage_stats.s3_monthly_cost && (
                  <p className="mt-1 text-xs text-muted">
                    ${analytics.storage_stats.s3_monthly_cost.toFixed(2)}/mo
                  </p>
                )}
              </div>
            )}
            {analytics.storage_stats.local_size_gb !== undefined && (
              <div>
                <p className="text-sm text-muted">Local Storage</p>
                <p className="mt-2 text-2xl font-bold">
                  {analytics.storage_stats.local_size_gb.toFixed(2)} GB
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Timestamp */}
      {analytics.timestamp && (
        <p className="mt-6 text-center text-xs text-muted">
          Last updated: {new Date(analytics.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}
