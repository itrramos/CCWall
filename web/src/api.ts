import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, err: ApiErrorShape) {
    super(err.message);
    this.status = status;
    this.code = err.code;
    this.details = err.details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : null;
  if (!res.ok || payload?.ok === false) {
    throw new ApiError(
      res.status,
      payload?.error ?? { code: 'http_error', message: `Request failed (${res.status})` }
    );
  }
  return (payload?.data ?? payload) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path)
};

/** Minimal data-fetching hook: load on mount / path change, manual reload. */
export function useApi<T>(path: string | null): {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(path != null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        if (alive.current) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e: ApiError) => {
        if (alive.current) setError(e);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

// ---------- shared shapes ----------

export interface User {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface Slide {
  id: string;
  title: string;
  description: string;
  type: string;
  enabled: boolean;
  duration: number | null;
  background: string;
  textColor: string;
  transitionOverride: string | null;
  startAt: string | null;
  endAt: string | null;
  daysOfWeek: number[] | null;
  tags: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  position?: number;
  durationOverride?: number | null;
  usedBy?: { id: string; name: string }[];
}

export interface Wallboard {
  id: string;
  name: string;
  description: string;
  slug: string;
  enabled: boolean;
  defaultDuration: number;
  transition: string;
  transitionDuration: number;
  background: string;
  aspectRatio: string;
  resolution: string;
  fullscreenBehavior: string;
  autostart: boolean;
  loopSlides: boolean;
  refreshMinutes: number;
  schedule: { days: number[]; start: string; end: string } | null;
  access: 'public' | 'token' | 'pin';
  accessToken?: string | null;
  hasPin: boolean;
  createdAt: string;
  updatedAt: string;
  slideCount?: number;
  slides?: Slide[];
}

export interface MediaAsset {
  id: string;
  originalName: string;
  fileName: string;
  mime: string;
  kind: 'image' | 'video';
  size: number;
  url: string;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalBytes?: number;
}

export const SLIDE_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  url: 'Website / Report',
  video: 'Video',
  html: 'Embedded HTML',
  clock: 'Clock & Date',
  announcement: 'Announcement',
  metrics: 'Metrics',
  blank: 'Blank / Background'
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
