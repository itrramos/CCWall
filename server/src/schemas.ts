import { z } from 'zod';

export const SLIDE_TYPES = [
  'text',
  'image',
  'url',
  'video',
  'html',
  'clock',
  'announcement',
  'metrics',
  'blank'
] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export const ROLES = ['admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const TRANSITIONS = ['none', 'fade', 'slide-left', 'slide-up', 'zoom'] as const;

const color = z
  .string()
  .max(64)
  .regex(/^$|^#[0-9a-fA-F]{3,8}$|^[a-zA-Z-]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/, 'Invalid color');

const isoDate = z.string().datetime({ offset: true }).or(z.string().datetime());

// ---------- slide type configs ----------

export const textConfig = z.object({
  heading: z.string().max(300).default(''),
  body: z.string().max(20000).default(''),
  align: z.enum(['left', 'center', 'right']).default('center'),
  fontSize: z.enum(['sm', 'md', 'lg', 'xl', 'xxl']).default('lg'),
  fontWeight: z.enum(['normal', 'medium', 'bold']).default('normal'),
  footer: z.string().max(500).default(''),
  callout: z.string().max(500).default('')
});

export const imageConfig = z.object({
  mediaId: z.string().max(64).nullable().default(null),
  mediaUrl: z.string().max(300).default(''),
  alt: z.string().max(500).default(''),
  fit: z.enum(['contain', 'cover', 'fill', 'original']).default('contain'),
  position: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
  caption: z.string().max(500).default('')
});

export const urlConfig = z.object({
  url: z.string().url().max(2000).refine((u) => /^https?:\/\//i.test(u), 'Only http/https URLs'),
  refreshSeconds: z.number().int().min(0).max(86400).default(0),
  fit: z.enum(['fit', 'scale-75', 'scale-50', 'scroll']).default('fit'),
  authNotes: z.string().max(2000).default(''),
  fallbackText: z.string().max(1000).default(''),
  timeoutSeconds: z.number().int().min(1).max(120).default(20),
  errorMessage: z.string().max(500).default('')
});

export const videoConfig = z.object({
  mediaId: z.string().max(64).nullable().default(null),
  mediaUrl: z.string().max(300).default(''),
  posterUrl: z.string().max(300).default(''),
  externalUrl: z
    .string()
    .max(2000)
    .refine((u) => u === '' || /^https?:\/\//i.test(u), 'Only http/https URLs')
    .default(''),
  autoplay: z.boolean().default(true),
  muted: z.boolean().default(true),
  loop: z.boolean().default(true),
  fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  posterId: z.string().max(64).nullable().default(null)
});

export const htmlConfig = z.object({
  html: z.string().max(100000).default('')
});

export const clockConfig = z.object({
  timeZone: z.string().max(80).default(''),
  hour12: z.boolean().default(false),
  dateFormat: z.enum(['full', 'long', 'medium', 'short', 'none']).default('full'),
  showSeconds: z.boolean().default(true),
  fontSize: z.enum(['md', 'lg', 'xl', 'xxl']).default('xl')
});

// Per-item style fields: empty string = inherit the slide-level default.
const announcementItem = z.object({
  title: z.string().max(300).default(''),
  body: z.string().max(2000).default(''),
  align: z.enum(['', 'left', 'center', 'right']).default(''),
  titleSize: z.enum(['', 'sm', 'md', 'lg', 'xl']).default(''),
  titleColor: color.default(''),
  bodySize: z.enum(['', 'sm', 'md', 'lg', 'xl']).default(''),
  bodyColor: color.default(''),
  cardBackground: color.default(''),
  // Optional media inside the card: uploaded image/video, external video
  // (including YouTube) or an embedded web page.
  mediaType: z.enum(['none', 'image', 'video', 'url']).default('none'),
  mediaId: z.string().max(64).nullable().default(null),
  mediaUrl: z.string().max(300).default(''),
  externalUrl: z
    .string()
    .max(2000)
    .refine((u) => u === '' || /^https?:\/\//i.test(u), 'Only http/https URLs')
    .default(''),
  mediaAlt: z.string().max(300).default(''),
  mediaFit: z.enum(['contain', 'cover']).default('contain'),
  mediaPosition: z.enum(['top', 'bottom', 'left', 'right', 'background']).default('top'),
  mediaSize: z.enum(['sm', 'md', 'lg', 'full']).default('md')
});

export const announcementConfig = z.object({
  items: z.array(announcementItem).max(12).default([]),
  columns: z.enum(['auto', '1', '2', '3', '4']).default('auto'),
  fontFamily: z.enum(['default', 'serif', 'mono']).default('default'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  titleSize: z.enum(['sm', 'md', 'lg', 'xl']).default('lg'),
  titleColor: color.default(''),
  bodySize: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  bodyColor: color.default(''),
  cardBackground: color.default('')
});

export const metricsConfig = z.object({
  items: z
    .array(
      z.object({
        label: z.string().max(120).default(''),
        value: z.string().max(60).default(''),
        delta: z.string().max(60).default(''),
        tone: z.enum(['default', 'success', 'warning', 'danger']).default('default')
      })
    )
    .max(12)
    .default([]),
  heading: z.string().max(300).default('')
});

export const blankConfig = z.object({});

export const slideConfigSchemas: Record<SlideType, z.ZodTypeAny> = {
  text: textConfig,
  image: imageConfig,
  url: urlConfig,
  video: videoConfig,
  html: htmlConfig,
  clock: clockConfig,
  announcement: announcementConfig,
  metrics: metricsConfig,
  blank: blankConfig
};

// ---------- slides ----------

export const slideBase = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  type: z.enum(SLIDE_TYPES),
  enabled: z.boolean().default(true),
  duration: z.number().int().min(1).max(86400).nullable().default(null),
  background: color.default(''),
  textColor: color.default(''),
  transitionOverride: z.enum(TRANSITIONS).nullable().default(null),
  startAt: isoDate.nullable().default(null),
  endAt: isoDate.nullable().default(null),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable().default(null),
  tags: z.string().max(500).default(''),
  config: z.record(z.unknown()).default({})
});

export const slideCreate = slideBase.superRefine((val, ctx) => {
  const schema = slideConfigSchemas[val.type];
  const parsed = schema.safeParse(val.config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', ...issue.path],
        message: issue.message
      });
    }
  }
});

export const slideUpdate = slideBase.partial();

// ---------- wallboards ----------

export const wallboardBase = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only')
    .optional(),
  enabled: z.boolean().default(true),
  defaultDuration: z.number().int().min(1).max(86400).default(15),
  transition: z.enum(TRANSITIONS).default('fade'),
  transitionDuration: z.number().int().min(0).max(10000).default(500),
  background: color.default('#0b1020'),
  aspectRatio: z.enum(['auto', '16:9', '4:3', '21:9', '9:16']).default('auto'),
  resolution: z.enum(['auto', '1080p', '4k', '720p']).default('auto'),
  fullscreenBehavior: z.enum(['button', 'hidden']).default('button'),
  autostart: z.boolean().default(true),
  loopSlides: z.boolean().default(true),
  refreshMinutes: z.number().int().min(0).max(1440).default(0),
  schedule: z
    .object({
      days: z.array(z.number().int().min(0).max(6)).max(7),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/)
    })
    .nullable()
    .default(null),
  access: z.enum(['public', 'token', 'pin']).default('public'),
  pin: z.string().regex(/^\d{4,8}$/).nullable().optional()
});

export const wallboardCreate = wallboardBase;
export const wallboardUpdate = wallboardBase.partial();

export const wallboardSlidesPut = z.object({
  slides: z
    .array(
      z.object({
        slideId: z.string().min(1).max(64),
        durationOverride: z.number().int().min(1).max(86400).nullable().default(null)
      })
    )
    .max(500)
});

// ---------- users / auth ----------

export const setupSchema = z.object({
  username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().email().max(200).optional(),
  displayName: z.string().max(120).default(''),
  password: z.string().min(1).max(200)
});

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false)
});

export const userCreate = z.object({
  username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().email().max(200).nullable().default(null),
  displayName: z.string().max(120).default(''),
  password: z.string().min(1).max(200),
  role: z.enum(ROLES)
});

export const userUpdate = z.object({
  email: z.string().email().max(200).nullable().optional(),
  displayName: z.string().max(120).optional(),
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(1).max(200).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200)
});

// ---------- settings ----------

export const generalSettings = z.object({
  appName: z.string().min(1).max(100).default('CCWall'),
  subtitle: z.string().max(100).default('Wallboard Portal'),
  logoMediaId: z.string().max(64).nullable().default(null),
  faviconMediaId: z.string().max(64).nullable().default(null),
  language: z.enum(['en']).default('en'),
  timeZone: z.string().max(80).default(''),
  dateFormat: z.enum(['iso', 'eu', 'us']).default('iso'),
  timeFormat: z.enum(['24h', '12h']).default('24h'),
  defaultTheme: z.enum(['dark', 'light']).default('dark'),
  defaultWallboardId: z.string().max(64).nullable().default(null),
  defaultSlideDuration: z.number().int().min(1).max(86400).default(15),
  defaultTransition: z.enum(TRANSITIONS).default('fade'),
  defaultBackground: color.default('#0b1020'),
  itemsPerPage: z.number().int().min(5).max(200).default(20)
});

export const wallboardSettings = z.object({
  loopSlides: z.boolean().default(true),
  autoStart: z.boolean().default(true),
  showControls: z.boolean().default(true),
  hideCursorSeconds: z.number().int().min(0).max(300).default(5),
  refreshIntervalSeconds: z.number().int().min(10).max(3600).default(60),
  preloadNext: z.boolean().default(true),
  errorFallbackSeconds: z.number().int().min(1).max(600).default(10),
  defaultResolution: z.enum(['auto', '1080p', '4k', '720p']).default('auto'),
  defaultAspectRatio: z.enum(['auto', '16:9', '4:3', '21:9', '9:16']).default('auto'),
  keepScreenAwake: z.boolean().default(true)
});

export const securitySettings = z.object({
  sessionTimeoutMinutes: z.number().int().min(5).max(10080).default(480),
  rememberMeDays: z.number().int().min(1).max(365).default(30),
  passwordMinLength: z.number().int().min(6).max(128).default(10),
  passwordRequireNumber: z.boolean().default(true),
  passwordRequireMixedCase: z.boolean().default(true),
  passwordRequireSymbol: z.boolean().default(false),
  maxLoginAttempts: z.number().int().min(3).max(20).default(5),
  lockoutMinutes: z.number().int().min(1).max(1440).default(15),
  allowedOrigins: z.array(z.string().max(200)).max(20).default([]),
  publicDisplayAccess: z.boolean().default(true),
  requireWallboardTokens: z.boolean().default(false),
  allowEmbeddedHtml: z.boolean().default(true)
});

export const storageSettings = z.object({
  maxUploadSizeMb: z.number().int().min(1).max(4096).default(200),
  allowedMediaTypes: z
    .array(z.enum(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg']))
    .min(1)
    .default(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg'])
});

export const systemSettings = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  auditRetentionDays: z.number().int().min(7).max(3650).default(90)
});

export const settingsGroups = {
  general: generalSettings,
  wallboard: wallboardSettings,
  security: securitySettings,
  storage: storageSettings,
  system: systemSettings
} as const;

export type SettingsGroup = keyof typeof settingsGroups;
export type GeneralSettings = z.infer<typeof generalSettings>;
export type WallboardSettings = z.infer<typeof wallboardSettings>;
export type SecuritySettings = z.infer<typeof securitySettings>;
export type StorageSettings = z.infer<typeof storageSettings>;
export type SystemSettings = z.infer<typeof systemSettings>;

export interface AllSettings {
  general: GeneralSettings;
  wallboard: WallboardSettings;
  security: SecuritySettings;
  storage: StorageSettings;
  system: SystemSettings;
}

// ---------- misc ----------

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().max(200).optional(),
  sort: z.string().max(60).optional(),
  order: z.enum(['asc', 'desc']).default('desc')
});
