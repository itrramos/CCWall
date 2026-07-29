/** Row → API-shape mappers (snake_case DB rows to camelCase JSON). */

export interface SlideRow {
  id: string;
  title: string;
  description: string;
  type: string;
  enabled: number;
  duration: number | null;
  background: string;
  text_color: string;
  transition_override: string | null;
  start_at: string | null;
  end_at: string | null;
  days_of_week: string | null;
  tags: string;
  config: string;
  created_at: string;
  updated_at: string;
}

export function slideFromRow(r: SlideRow): Record<string, unknown> {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    enabled: r.enabled === 1,
    duration: r.duration,
    background: r.background,
    textColor: r.text_color,
    transitionOverride: r.transition_override,
    startAt: r.start_at,
    endAt: r.end_at,
    daysOfWeek: r.days_of_week ? (JSON.parse(r.days_of_week) as number[]) : null,
    tags: r.tags,
    config: JSON.parse(r.config) as Record<string, unknown>,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export interface WallboardRow {
  id: string;
  name: string;
  description: string;
  slug: string;
  enabled: number;
  default_duration: number;
  transition: string;
  transition_duration: number;
  background: string;
  aspect_ratio: string;
  resolution: string;
  fullscreen_behavior: string;
  autostart: number;
  loop_slides: number;
  refresh_minutes: number;
  schedule_json: string | null;
  access: string;
  access_token: string | null;
  pin_hash: string | null;
  created_at: string;
  updated_at: string;
}

export function wallboardFromRow(r: WallboardRow, opts: { includeToken?: boolean } = {}): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    slug: r.slug,
    enabled: r.enabled === 1,
    defaultDuration: r.default_duration,
    transition: r.transition,
    transitionDuration: r.transition_duration,
    background: r.background,
    aspectRatio: r.aspect_ratio,
    resolution: r.resolution,
    fullscreenBehavior: r.fullscreen_behavior,
    autostart: r.autostart === 1,
    loopSlides: r.loop_slides === 1,
    refreshMinutes: r.refresh_minutes,
    schedule: r.schedule_json ? (JSON.parse(r.schedule_json) as Record<string, unknown>) : null,
    access: r.access,
    accessToken: opts.includeToken ? r.access_token : undefined,
    hasPin: r.pin_hash != null,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export interface MediaRow {
  id: string;
  original_name: string;
  file_name: string;
  mime: string;
  kind: string;
  size: number;
  uploaded_by: string | null;
  created_at: string;
}

export function mediaFromRow(r: MediaRow): Record<string, unknown> {
  return {
    id: r.id,
    originalName: r.original_name,
    fileName: r.file_name,
    mime: r.mime,
    kind: r.kind,
    size: r.size,
    uploadedBy: r.uploaded_by,
    url: `/media/${r.file_name}`,
    createdAt: r.created_at
  };
}

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  role: string;
  display_name: string;
  disabled: number;
  created_at: string;
  updated_at: string;
}

export function userFromRow(r: UserRow): Record<string, unknown> {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    role: r.role,
    displayName: r.display_name,
    disabled: r.disabled === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
