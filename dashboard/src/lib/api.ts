/**
 * Typed client for the Boston's Studio backend (FastAPI).
 * Goes through the Next.js rewrite proxy so we always hit the same origin.
 */

const BASE = ""; // same-origin via next.config.ts rewrites

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      (body as { detail?: string; message?: string })?.detail ||
      (body as { detail?: string; message?: string })?.message ||
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

// ---------- Settings ----------
export interface Settings {
  video_source: string;
  llm_provider: string;
  openai_api_key: string;
  openai_api_key_set: boolean;
  openai_base_url: string;
  openai_model_name: string;
  pexels_api_keys: string[];
  pexels_api_keys_set: boolean;
  pixabay_api_keys: string[];
  pixabay_api_keys_set: boolean;
}

export const settingsApi = {
  get: () => request<{ data: Settings }>("/api/v1/settings").then((r) => r.data),
  update: (patch: Partial<Settings>) =>
    request<{ data: Settings }>("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((r) => r.data),
};

// ---------- Channels ----------
export interface Channel {
  id: string;
  name: string;
  description: string;
  niche: string;
  voice_name: string;
  language: string;
  video_source: string;
  video_aspect: string;
  video_concat_mode: string;
  clip_duration: number;
  target_duration: number;
  paragraph_number: number;
  subtitle_position: string;
  script_prompt: string;
  extra: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export type ChannelInput = Partial<Omit<Channel, "id" | "created_at" | "updated_at">>;

export const channelsApi = {
  list: () =>
    request<{ data: Channel[] }>("/api/v1/channels").then((r) => r.data),
  get: (id: string) =>
    request<{ data: Channel }>(`/api/v1/channels/${id}`).then((r) => r.data),
  create: (payload: ChannelInput) =>
    request<{ data: Channel }>("/api/v1/channels", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => r.data),
  update: (id: string, payload: ChannelInput) =>
    request<{ data: Channel }>(`/api/v1/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }).then((r) => r.data),
  remove: (id: string) =>
    request<{ data: { id: string; deleted: boolean } }>(
      `/api/v1/channels/${id}`,
      { method: "DELETE" }
    ).then((r) => r.data),
};

// ---------- Tasks / videos ----------
export interface VideoRequest {
  video_subject: string;
  video_script?: string;
  video_terms?: string | string[];
  video_aspect?: string;
  video_concat_mode?: string;
  video_clip_duration?: number;
  video_count?: number;
  video_source?: string;
  video_materials?: unknown[];
  video_language?: string;
  voice_name?: string;
  voice_volume?: number;
  voice_rate?: number;
  bgm_type?: string;
  bgm_file?: string;
  bgm_volume?: number;
  subtitle_enabled?: boolean;
  subtitle_position?: string;
  font_name?: string;
  text_fore_color?: string;
  text_background_color?: string | boolean;
  font_size?: number;
  stroke_color?: string;
  stroke_width?: number;
  n_threads?: number;
  paragraph_number?: number;
}

export interface TaskSummary {
  task_id: string;
  state?: number;
  progress?: number;
  videos?: string[];
  combined_videos?: string[];
  audio_file?: string;
  subtitle_path?: string;
  script?: string;
  terms?: string[];
  error?: string;
  [k: string]: unknown;
}

export const tasksApi = {
  list: (page = 1, pageSize = 50) =>
    request<{
      status: number;
      message: string;
      data: { tasks: TaskSummary[]; total: number; page: number; page_size: number };
    }>(`/api/v1/tasks?page=${page}&page_size=${pageSize}`).then((r) => r.data),

  get: (id: string) =>
    request<{ status: number; message: string; data: TaskSummary }>(
      `/api/v1/tasks/${id}`
    ).then((r) => r.data),

  create: (payload: VideoRequest) =>
    request<{
      status: number;
      message: string;
      data: { task_id: string; videos?: string[]; combined_videos?: string[] };
    }>("/api/v1/videos", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  remove: (id: string) =>
    request<{ status: number; message: string; data: unknown }>(
      `/api/v1/tasks/${id}`,
      { method: "DELETE" }
    ),
};

// Helper: turn a server file path like
//   "./storage/tasks/<id>/final-1.mp4"
// into a streamable URL through the FastAPI /stream endpoint.
export function streamUrl(filePath: string): string {
  const cleaned = filePath
    .replace(/^\.[\\/]/, "")
    .replace(/\\/g, "/")
    .replace(/^storage\//, "");
  return `/api/v1/stream/${cleaned}`;
}

export function downloadUrl(filePath: string): string {
  const cleaned = filePath
    .replace(/^\.[\\/]/, "")
    .replace(/\\/g, "/")
    .replace(/^storage\//, "");
  return `/api/v1/download/${cleaned}`;
}

// ---------- Library (persistent video list) ----------
export interface LibraryItem {
  task_id: string;
  final_path: string;
  final_url: string;
  download_url: string;
  size_bytes: number;
  created_at: number;
  subject: string;
  script: string;
  duration: number;
  thumbnail_url: string;
}

export const libraryApi = {
  list: () =>
    request<{ data: LibraryItem[] }>("/api/v1/library").then((r) => r.data),
  remove: (taskId: string) =>
    request<{ data: { task_id: string; deleted: boolean } }>(
      `/api/v1/library/${taskId}`,
      { method: "DELETE" }
    ).then((r) => r.data),
};

// ---------- BGM (background music) ----------
export interface BgmFile {
  name: string;
  size: number;
  file: string;
}

export const bgmApi = {
  list: () =>
    request<{ data: { files: BgmFile[] } }>("/api/v1/musics").then(
      (r) => r.data.files
    ),
};

// ---------- Script + keywords (LLM) ----------
export interface ScriptRequest {
  video_subject: string;
  video_language?: string;
  paragraph_number?: number;
  video_script_prompt?: string;
  custom_system_prompt?: string;
}

export interface TermsRequest {
  video_subject: string;
  video_script: string;
  amount?: number;
}

export const scriptApi = {
  draft: (payload: ScriptRequest) =>
    request<{ status: number; message: string; data: { video_script: string } }>(
      "/api/v1/scripts",
      { method: "POST", body: JSON.stringify(payload) }
    ).then((r) => {
      const text = r.data.video_script || "";
      // The backend returns the raw LLM error inside video_script on failure
      // (e.g. "Error: Error code: 429 - ..."). Surface it as a real exception.
      if (typeof text === "string" && text.trim().toLowerCase().startsWith("error")) {
        throw new Error(text.replace(/^error:\s*/i, "").slice(0, 400));
      }
      return text;
    }),

  terms: (payload: TermsRequest) =>
    request<{
      status: number;
      message: string;
      data: { video_terms: string[] | string };
    }>("/api/v1/terms", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((r) => {
      const raw = r.data.video_terms;
      // Happy path: array of strings.
      if (Array.isArray(raw)) return raw;
      // Failure path: backend stuffs the raw error string into video_terms.
      if (typeof raw === "string") {
        if (raw.trim().toLowerCase().startsWith("error")) {
          throw new Error(raw.replace(/^error:\s*/i, "").slice(0, 400));
        }
        // Defensive: maybe the model returned comma-separated terms instead of JSON.
        return raw
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    }),
};


// ---------- Voice preview ----------
/**
 * POST to /api/v1/voice/preview and return a Blob URL playable by an <audio>.
 * The browser is responsible for revoking the URL when no longer needed.
 */
export async function previewVoice(payload: {
  voice_name: string;
  text?: string;
  voice_rate?: number;
  voice_volume?: number;
}): Promise<string> {
  const res = await fetch("/api/v1/voice/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
