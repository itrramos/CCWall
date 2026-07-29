import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, SLIDE_TYPE_LABELS, useApi, type MediaAsset, type Slide } from '../api';
import { useAuth, useToast } from '../context';
import { ColorField, Field, Spinner, Toggle } from '../components/ui';
import { MediaPicker } from '../components/MediaPicker';
import { SlideView } from '../player/SlideView';
import { IconWarning } from '../components/Icons';

type Config = Record<string, unknown>;

interface AnnouncementItemForm {
  title: string;
  body: string;
  align?: string;
  titleSize?: string;
  titleColor?: string;
  bodySize?: string;
  bodyColor?: string;
  cardBackground?: string;
  mediaType?: string;
  mediaId?: string | null;
  mediaUrl?: string;
  externalUrl?: string;
  mediaAlt?: string;
  mediaFit?: string;
  mediaPosition?: string;
  mediaSize?: string;
}

/** Which field a media-library selection should fill in. */
type PickerTarget =
  | null
  | { kind: 'image' | 'video'; slot: 'image' | 'video' | 'poster' }
  | { kind: 'image' | 'video'; slot: 'announcement-item'; itemIndex: number };

const EMPTY_ANNOUNCEMENT_ITEM: AnnouncementItemForm = {
  title: '',
  body: '',
  align: '',
  titleSize: '',
  titleColor: '',
  bodySize: '',
  bodyColor: '',
  cardBackground: '',
  mediaType: 'none',
  mediaId: null,
  mediaUrl: '',
  externalUrl: '',
  mediaAlt: '',
  mediaFit: 'contain',
  mediaPosition: 'top',
  mediaSize: 'md'
};

interface SlideForm {
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
  config: Config;
}

const DEFAULT_CONFIGS: Record<string, Config> = {
  text: { heading: '', body: '', align: 'center', fontSize: 'lg', fontWeight: 'normal', footer: '', callout: '' },
  image: { mediaId: null, mediaUrl: '', alt: '', fit: 'contain', position: 'center', caption: '' },
  url: { url: 'https://', refreshSeconds: 0, fit: 'fit', authNotes: '', fallbackText: '', timeoutSeconds: 20, errorMessage: '' },
  video: { mediaId: null, mediaUrl: '', externalUrl: '', autoplay: true, muted: true, loop: true, fit: 'contain', posterId: null, posterUrl: '' },
  html: { html: '' },
  clock: { timeZone: '', hour12: false, dateFormat: 'full', showSeconds: true, fontSize: 'xl' },
  announcement: {
    items: [{ ...EMPTY_ANNOUNCEMENT_ITEM }],
    columns: 'auto',
    fontFamily: 'default',
    align: 'center',
    titleSize: 'lg',
    titleColor: '',
    bodySize: 'md',
    bodyColor: '',
    cardBackground: ''
  },
  metrics: { heading: '', items: [{ label: '', value: '', delta: '', tone: 'default' }] },
  blank: {}
};

function emptyForm(type: string): SlideForm {
  return {
    title: '',
    description: '',
    type,
    enabled: true,
    duration: null,
    background: '#0b1020',
    textColor: '#e7eaf3',
    transitionOverride: null,
    startAt: null,
    endAt: null,
    daysOfWeek: null,
    tags: '',
    config: structuredClone(DEFAULT_CONFIGS[type] ?? {})
  };
}

function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SlideEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isNew = !id;
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const { data: existing, loading } = useApi<Slide>(id ? `/api/slides/${id}` : null);
  const [form, setForm] = useState<SlideForm>(() => emptyForm(params.get('type') ?? 'text'));
  const [snapshot, setSnapshot] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<PickerTarget>(null);

  useEffect(() => {
    if (existing) {
      const f: SlideForm = {
        title: existing.title,
        description: existing.description,
        type: existing.type,
        enabled: existing.enabled,
        duration: existing.duration,
        background: existing.background,
        textColor: existing.textColor,
        transitionOverride: existing.transitionOverride,
        startAt: existing.startAt,
        endAt: existing.endAt,
        daysOfWeek: existing.daysOfWeek,
        tags: existing.tags,
        config: { ...structuredClone(DEFAULT_CONFIGS[existing.type] ?? {}), ...existing.config }
      };
      setForm(f);
      setSnapshot(JSON.stringify(f));
    } else if (isNew) {
      const f = emptyForm(params.get('type') ?? 'text');
      setForm(f);
      setSnapshot(JSON.stringify(f));
    }
    // `params` is intentionally omitted: the type param only matters on first render.
  }, [existing, isNew]);

  const dirty = snapshot !== '' && JSON.stringify(form) !== snapshot;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const set = useCallback(<K extends keyof SlideForm>(key: K, value: SlideForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);
  const setCfg = useCallback((key: string, value: unknown) => {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  }, []);

  const changeType = (type: string): void => {
    if (type === form.type) return;
    if (
      !isNew &&
      !window.confirm(
        'Changing the slide type resets its type-specific options (title, schedule and other common settings are kept). Continue?'
      )
    ) {
      return;
    }
    setForm((f) => ({ ...f, type, config: structuredClone(DEFAULT_CONFIGS[type] ?? {}) }));
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        const created = await api.post<Slide>('/api/slides', form);
        toast('Slide created', 'success');
        setSnapshot(JSON.stringify(form));
        navigate(`/slides/${created.id}`, { replace: true });
      } else {
        await api.patch(`/api/slides/${id}`, form);
        setSnapshot(JSON.stringify(form));
        toast('Slide saved', 'success');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const back = (): void => {
    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
    navigate('/slides');
  };

  const previewSlide: Slide = useMemo(
    () => ({
      id: 'preview',
      ...form,
      createdAt: '',
      updatedAt: ''
    }),
    [form]
  );

  if (loading && !existing) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isNew ? 'Create Slide' : `Edit: ${existing?.title ?? ''}`}</h1>
          <div className="page-sub">
            {SLIDE_TYPE_LABELS[form.type]}
            {dirty && (
              <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                unsaved changes
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={back}>
            Back
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !form.title}>
              {busy ? 'Saving…' : 'Save slide'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 14, color: 'var(--danger)' }} role="alert">
          {error}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.2fr)', alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Basics</div>
            <Field label="Title">
              <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} required />
            </Field>
            <Field label="Internal description">
              <textarea
                className="textarea"
                rows={2}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <div className="field-row">
              <Field label="Slide type">
                <select
                  className="select"
                  value={form.type}
                  onChange={(e) => changeType(e.target.value)}
                >
                  {Object.entries(SLIDE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Duration (seconds)" hint="Empty = wallboard default">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.duration ?? ''}
                  onChange={(e) => set('duration', e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
            </div>
            <div className="field-row">
              <ColorField label="Background" value={form.background} onChange={(v) => set('background', v)} />
              <ColorField label="Text color" value={form.textColor} onChange={(v) => set('textColor', v)} />
            </div>
            <Field label="Transition override" hint="Empty = wallboard transition">
              <select
                className="select"
                value={form.transitionOverride ?? ''}
                onChange={(e) => set('transitionOverride', e.target.value || null)}
              >
                <option value="">Use wallboard default</option>
                {['none', 'fade', 'slide-left', 'slide-up', 'zoom'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="Comma separated, used in search">
              <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            </Field>
            <Toggle label="Enabled" checked={form.enabled} onChange={(v) => set('enabled', v)} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Schedule</div>
            <div className="field-row">
              <Field label="Start (optional)">
                <input
                  className="input"
                  type="datetime-local"
                  value={isoToLocal(form.startAt)}
                  onChange={(e) => set('startAt', localToIso(e.target.value))}
                />
              </Field>
              <Field label="End (optional)">
                <input
                  className="input"
                  type="datetime-local"
                  value={isoToLocal(form.endAt)}
                  onChange={(e) => set('endAt', localToIso(e.target.value))}
                />
              </Field>
            </div>
            <div className="field">
              <span className="field-label">Days of week</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {DAY_LABELS.map((d, i) => {
                  const active = !form.daysOfWeek || form.daysOfWeek.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`btn btn-sm${active ? ' btn-primary' : ''}`}
                      aria-pressed={active}
                      onClick={() => {
                        const current = form.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
                        const next = current.includes(i) ? current.filter((x) => x !== i) : [...current, i].sort();
                        set('daysOfWeek', next.length === 7 ? null : next);
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <span className="field-hint">All days selected = no day restriction.</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">{SLIDE_TYPE_LABELS[form.type]} options</div>
            <TypeConfigForm form={form} setCfg={setCfg} openPicker={setPicker} isAdmin={user?.role === 'admin'} />
          </div>
        </div>

        <div style={{ position: 'sticky', top: 76 }}>
          <div className="card">
            <div className="card-title">Live preview</div>
            <div className="preview-frame-wrap" style={{ position: 'relative' }}>
              <SlideView slide={previewSlide} active />
            </div>
            {!isNew && existing?.usedBy && existing.usedBy.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                Used by:{' '}
                {existing.usedBy.map((w, i) => (
                  <span key={w.id}>
                    {i > 0 && ', '}
                    <a href={`/wallboards/${w.id}`}>{w.name}</a>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {picker && (
        <MediaPicker
          kind={picker.kind}
          onClose={() => setPicker(null)}
          onSelect={(asset: MediaAsset) => {
            if (picker.slot === 'poster') {
              setCfg('posterId', asset.id);
              setCfg('posterUrl', asset.url);
            } else if (picker.slot === 'announcement-item') {
              const items = ((form.config.items as AnnouncementItemForm[] | undefined) ?? []).map((x, j) =>
                j === picker.itemIndex ? { ...x, mediaId: asset.id, mediaUrl: asset.url, externalUrl: '' } : x
              );
              setCfg('items', items);
            } else {
              setCfg('mediaId', asset.id);
              setCfg('mediaUrl', asset.url);
            }
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

function TypeConfigForm({
  form,
  setCfg,
  openPicker,
  isAdmin
}: {
  form: SlideForm;
  setCfg: (key: string, value: unknown) => void;
  openPicker: (target: PickerTarget) => void;
  isAdmin?: boolean;
}) {
  const c = form.config;
  const str = (k: string): string => String(c[k] ?? '');
  const bool = (k: string): boolean => Boolean(c[k]);
  const num = (k: string): number => Number(c[k] ?? 0);

  switch (form.type) {
    case 'text':
      return (
        <>
          <Field label="Heading">
            <input className="input" value={str('heading')} onChange={(e) => setCfg('heading', e.target.value)} />
          </Field>
          <Field label="Body" hint="Supports **bold**, *italic* and line breaks — rendered safely.">
            <textarea className="textarea" rows={5} value={str('body')} onChange={(e) => setCfg('body', e.target.value)} />
          </Field>
          <div className="field-row">
            <Field label="Alignment">
              <select className="select" value={str('align')} onChange={(e) => setCfg('align', e.target.value)}>
                {['left', 'center', 'right'].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label="Font size">
              <select className="select" value={str('fontSize')} onChange={(e) => setCfg('fontSize', e.target.value)}>
                {['sm', 'md', 'lg', 'xl', 'xxl'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Font weight">
              <select className="select" value={str('fontWeight')} onChange={(e) => setCfg('fontWeight', e.target.value)}>
                {['normal', 'medium', 'bold'].map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Callout (optional)">
            <input className="input" value={str('callout')} onChange={(e) => setCfg('callout', e.target.value)} />
          </Field>
          <Field label="Footer (optional)">
            <input className="input" value={str('footer')} onChange={(e) => setCfg('footer', e.target.value)} />
          </Field>
        </>
      );
    case 'image':
      return (
        <>
          <div className="field">
            <span className="field-label">Image</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn" onClick={() => openPicker({ kind: 'image', slot: 'image' })}>
                {str('mediaUrl') ? 'Change image…' : 'Select or upload…'}
              </button>
              {str('mediaUrl') && (
                <img src={str('mediaUrl')} alt="" style={{ height: 40, borderRadius: 6 }} />
              )}
            </div>
          </div>
          <Field label="Alt text" hint="Describes the image for screen readers.">
            <input className="input" value={str('alt')} onChange={(e) => setCfg('alt', e.target.value)} />
          </Field>
          <div className="field-row">
            <Field label="Fit mode">
              <select className="select" value={str('fit')} onChange={(e) => setCfg('fit', e.target.value)}>
                {['contain', 'cover', 'fill', 'original'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Position">
              <select className="select" value={str('position')} onChange={(e) => setCfg('position', e.target.value)}>
                {['center', 'top', 'bottom', 'left', 'right'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Caption (optional)">
            <input className="input" value={str('caption')} onChange={(e) => setCfg('caption', e.target.value)} />
          </Field>
        </>
      );
    case 'url':
      return (
        <>
          <Field label="URL" hint="http(s) page or report to display. YouTube links are converted to an embedded player automatically.">
            <input className="input" type="url" value={str('url')} onChange={(e) => setCfg('url', e.target.value)} />
          </Field>
          <div
            className="card"
            style={{ background: 'var(--warning-soft)', borderColor: 'var(--warning)', marginBottom: 13, display: 'flex', gap: 10 }}
          >
            <span style={{ color: 'var(--warning)' }}>
              <IconWarning />
            </span>
            <span style={{ fontSize: 12.5 }}>
              Some sites refuse to be embedded (X-Frame-Options / CSP). CCWall cannot bypass that — if the
              page stays blank on the wallboard, the fallback message below is shown instead.
              <br />
              <br />
              If the page needs a login (e.g. Tableau): open the live wallboard on the display, pause
              playback (Space or the ⏸ button), sign in inside the slide, then resume. Keep the refresh
              interval at 0 for login-protected pages so the session isn't reloaded away.
            </span>
          </div>
          <div className="field-row">
            <Field label="Refresh interval (s)" hint="0 = never reload">
              <input
                className="input"
                type="number"
                min={0}
                value={num('refreshSeconds')}
                onChange={(e) => setCfg('refreshSeconds', Number(e.target.value))}
              />
            </Field>
            <Field label="Load timeout (s)">
              <input
                className="input"
                type="number"
                min={1}
                value={num('timeoutSeconds') || 20}
                onChange={(e) => setCfg('timeoutSeconds', Number(e.target.value))}
              />
            </Field>
            <Field label="Fit / scale">
              <select className="select" value={str('fit')} onChange={(e) => setCfg('fit', e.target.value)}>
                <option value="fit">100%</option>
                <option value="scale-75">Scale 75%</option>
                <option value="scale-50">Scale 50%</option>
              </select>
            </Field>
          </div>
          <Field label="Error message (optional)">
            <input className="input" value={str('errorMessage')} onChange={(e) => setCfg('errorMessage', e.target.value)} />
          </Field>
          <Field label="Fallback text (optional)">
            <input className="input" value={str('fallbackText')} onChange={(e) => setCfg('fallbackText', e.target.value)} />
          </Field>
          <Field label="Authentication notes (internal)">
            <textarea className="textarea" rows={2} value={str('authNotes')} onChange={(e) => setCfg('authNotes', e.target.value)} />
          </Field>
        </>
      );
    case 'video':
      return (
        <>
          <div className="field">
            <span className="field-label">Video</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" onClick={() => openPicker({ kind: 'video', slot: 'video' })}>
                {str('mediaUrl') ? 'Change uploaded video…' : 'Select or upload…'}
              </button>
              {str('mediaUrl') && <span className="badge badge-success">uploaded video selected</span>}
            </div>
          </div>
          <Field
            label="…or external video URL"
            hint="Direct mp4/webm URL, or any YouTube link — videos, Shorts and live streams are converted to an embedded player automatically. Leave empty when using an upload."
          >
            <input className="input" value={str('externalUrl')} onChange={(e) => setCfg('externalUrl', e.target.value)} />
          </Field>
          <div className="field-row">
            <Field label="Fit mode">
              <select className="select" value={str('fit')} onChange={(e) => setCfg('fit', e.target.value)}>
                {['contain', 'cover', 'fill'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span className="field-label">Poster image</span>
              <button type="button" className="btn" onClick={() => openPicker({ kind: 'image', slot: 'poster' })}>
                {str('posterUrl') ? 'Change poster…' : 'Select poster…'}
              </button>
            </div>
          </div>
          <Toggle label="Autoplay" checked={bool('autoplay')} onChange={(v) => setCfg('autoplay', v)} />
          <Toggle label="Muted" checked={bool('muted')} onChange={(v) => setCfg('muted', v)} hint="Browsers require muted for autoplay." />
          <Toggle label="Loop" checked={bool('loop')} onChange={(v) => setCfg('loop', v)} />
        </>
      );
    case 'html':
      return (
        <>
          <div
            className="card"
            style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger)', marginBottom: 13, display: 'flex', gap: 10 }}
          >
            <span style={{ color: 'var(--danger)' }}>
              <IconWarning />
            </span>
            <span style={{ fontSize: 12.5 }}>
              Embedded HTML is an administrator-only feature (it can be disabled in Security settings).
              Content is rendered in a sandboxed frame — scripts never execute — but treat any pasted
              markup as untrusted. Because scripts are blocked, YouTube/player embeds will not work
              here: use a Video slide with the YouTube link instead.
            </span>
          </div>
          {!isAdmin && <p style={{ color: 'var(--danger)' }}>Only administrators can edit HTML slides.</p>}
          <Field label="HTML content">
            <textarea
              className="textarea"
              rows={10}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              value={str('html')}
              onChange={(e) => setCfg('html', e.target.value)}
              disabled={!isAdmin}
            />
          </Field>
        </>
      );
    case 'clock':
      return (
        <>
          <Field label="Time zone" hint='IANA name, e.g. "Europe/London". Empty = display device zone.'>
            <input className="input" value={str('timeZone')} onChange={(e) => setCfg('timeZone', e.target.value)} />
          </Field>
          <div className="field-row">
            <Field label="Clock mode">
              <select
                className="select"
                value={bool('hour12') ? '12' : '24'}
                onChange={(e) => setCfg('hour12', e.target.value === '12')}
              >
                <option value="24">24-hour</option>
                <option value="12">12-hour</option>
              </select>
            </Field>
            <Field label="Date format">
              <select className="select" value={str('dateFormat')} onChange={(e) => setCfg('dateFormat', e.target.value)}>
                {['full', 'long', 'medium', 'short', 'none'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Size">
              <select className="select" value={str('fontSize')} onChange={(e) => setCfg('fontSize', e.target.value)}>
                {['md', 'lg', 'xl', 'xxl'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Toggle label="Show seconds" checked={bool('showSeconds')} onChange={(v) => setCfg('showSeconds', v)} />
        </>
      );
    case 'announcement': {
      const items = (c.items as AnnouncementItemForm[] | undefined) ?? [];
      const setItem = (i: number, patch: Partial<AnnouncementItemForm>): void => {
        setCfg('items', items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      };
      const sizeOptions = (withInherit: boolean) => (
        <>
          {withInherit && <option value="">default</option>}
          <option value="sm">sm</option>
          <option value="md">md</option>
          <option value="lg">lg</option>
          <option value="xl">xl</option>
        </>
      );
      return (
        <>
          <div className="card" style={{ marginBottom: 12, background: 'var(--bg-panel)' }}>
            <div className="card-title">Layout &amp; default style</div>
            <div className="field-row">
              <Field label="Cards per row">
                <select className="select" value={str('columns') || 'auto'} onChange={(e) => setCfg('columns', e.target.value)}>
                  <option value="auto">Auto (fit to width)</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </Field>
              <Field label="Font family">
                <select className="select" value={str('fontFamily') || 'default'} onChange={(e) => setCfg('fontFamily', e.target.value)}>
                  <option value="default">App default (sans-serif)</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Monospace</option>
                </select>
              </Field>
              <Field label="Text alignment">
                <select className="select" value={str('align') || 'center'} onChange={(e) => setCfg('align', e.target.value)}>
                  <option value="left">left</option>
                  <option value="center">center</option>
                  <option value="right">right</option>
                </select>
              </Field>
            </div>
            <div className="field-row">
              <Field label="Title size">
                <select className="select" value={str('titleSize') || 'lg'} onChange={(e) => setCfg('titleSize', e.target.value)}>
                  {sizeOptions(false)}
                </select>
              </Field>
              <Field label="Body size">
                <select className="select" value={str('bodySize') || 'md'} onChange={(e) => setCfg('bodySize', e.target.value)}>
                  {sizeOptions(false)}
                </select>
              </Field>
            </div>
            <div className="field-row">
              <ColorField label="Title color" hint="Empty = slide text color" value={str('titleColor')} onChange={(v) => setCfg('titleColor', v)} />
              <ColorField label="Body color" hint="Empty = slide text color" value={str('bodyColor')} onChange={(v) => setCfg('bodyColor', v)} />
              <ColorField label="Card background" hint="Empty = subtle default" value={str('cardBackground')} onChange={(v) => setCfg('cardBackground', v)} />
            </div>
          </div>

          {items.map((it, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, background: 'var(--bg-panel)' }}>
              <div className="field-row">
                <Field label={`Item ${i + 1} title`}>
                  <input className="input" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                </Field>
                <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setCfg('items', items.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <Field label="Body">
                <textarea className="textarea" rows={2} value={it.body} onChange={(e) => setItem(i, { body: e.target.value })} />
              </Field>

              <details open={(it.mediaType ?? 'none') !== 'none'}>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                  Media in this card (image, video, website)
                </summary>
                <div style={{ marginTop: 10 }}>
                  <Field label="Content type">
                    <select
                      className="select"
                      value={it.mediaType ?? 'none'}
                      onChange={(e) =>
                        setItem(i, { mediaType: e.target.value, mediaId: null, mediaUrl: '', externalUrl: '' })
                      }
                    >
                      <option value="none">Text only</option>
                      <option value="image">Image</option>
                      <option value="video">Video (upload or YouTube)</option>
                      <option value="url">Website / embedded page</option>
                    </select>
                  </Field>

                  {(it.mediaType === 'image' || it.mediaType === 'video') && (
                    <div className="field">
                      <span className="field-label">{it.mediaType === 'image' ? 'Image' : 'Uploaded video'}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            openPicker({
                              kind: it.mediaType === 'video' ? 'video' : 'image',
                              slot: 'announcement-item',
                              itemIndex: i
                            })
                          }
                        >
                          {it.mediaUrl ? 'Change…' : 'Select or upload…'}
                        </button>
                        {it.mediaUrl && it.mediaType === 'image' && (
                          <img src={it.mediaUrl} alt="" style={{ height: 36, borderRadius: 6 }} />
                        )}
                        {it.mediaUrl && it.mediaType === 'video' && <span className="badge badge-success">video selected</span>}
                        {it.mediaUrl && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setItem(i, { mediaId: null, mediaUrl: '' })}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {(it.mediaType === 'video' || it.mediaType === 'url') && (
                    <Field
                      label={it.mediaType === 'video' ? '…or video URL' : 'Page URL'}
                      hint={
                        it.mediaType === 'video'
                          ? 'Direct mp4/webm link or any YouTube link (videos, Shorts, live streams).'
                          : 'https:// page to embed. YouTube links become an embedded player.'
                      }
                    >
                      <input
                        className="input"
                        value={it.externalUrl ?? ''}
                        placeholder="https://"
                        onChange={(e) => setItem(i, { externalUrl: e.target.value })}
                      />
                    </Field>
                  )}

                  {it.mediaType === 'image' && (
                    <Field label="Alt text" hint="Describes the image for screen readers.">
                      <input className="input" value={it.mediaAlt ?? ''} onChange={(e) => setItem(i, { mediaAlt: e.target.value })} />
                    </Field>
                  )}

                  {(it.mediaType ?? 'none') !== 'none' && (
                    <div className="field-row">
                      <Field label="Position">
                        <select
                          className="select"
                          value={it.mediaPosition ?? 'top'}
                          onChange={(e) => setItem(i, { mediaPosition: e.target.value })}
                        >
                          <option value="top">Above the text</option>
                          <option value="bottom">Below the text</option>
                          <option value="left">Left of the text</option>
                          <option value="right">Right of the text</option>
                          <option value="background">Behind the text</option>
                        </select>
                      </Field>
                      <Field label="Media size" hint="Share of the card. Ignored when the card has no text.">
                        <select className="select" value={it.mediaSize ?? 'md'} onChange={(e) => setItem(i, { mediaSize: e.target.value })}>
                          <option value="sm">Small (30%)</option>
                          <option value="md">Medium (45%)</option>
                          <option value="lg">Large (65%)</option>
                          <option value="full">Full card</option>
                        </select>
                      </Field>
                      <Field label="Fit">
                        <select className="select" value={it.mediaFit ?? 'contain'} onChange={(e) => setItem(i, { mediaFit: e.target.value })}>
                          <option value="contain">Contain (show all)</option>
                          <option value="cover">Cover (fill, may crop)</option>
                        </select>
                      </Field>
                    </div>
                  )}
                </div>
              </details>

              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                  Style overrides for this card (empty = use defaults above)
                </summary>
                <div style={{ marginTop: 10 }}>
                  <div className="field-row">
                    <Field label="Alignment">
                      <select className="select" value={it.align ?? ''} onChange={(e) => setItem(i, { align: e.target.value })}>
                        <option value="">default</option>
                        <option value="left">left</option>
                        <option value="center">center</option>
                        <option value="right">right</option>
                      </select>
                    </Field>
                    <Field label="Title size">
                      <select className="select" value={it.titleSize ?? ''} onChange={(e) => setItem(i, { titleSize: e.target.value })}>
                        {sizeOptions(true)}
                      </select>
                    </Field>
                    <Field label="Body size">
                      <select className="select" value={it.bodySize ?? ''} onChange={(e) => setItem(i, { bodySize: e.target.value })}>
                        {sizeOptions(true)}
                      </select>
                    </Field>
                  </div>
                  <div className="field-row">
                    <ColorField label="Title color" value={it.titleColor ?? ''} onChange={(v) => setItem(i, { titleColor: v })} />
                    <ColorField label="Body color" value={it.bodyColor ?? ''} onChange={(v) => setItem(i, { bodyColor: v })} />
                    <ColorField label="Card background" value={it.cardBackground ?? ''} onChange={(v) => setItem(i, { cardBackground: v })} />
                  </div>
                </div>
              </details>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              setCfg('items', [
                ...items,
                { ...EMPTY_ANNOUNCEMENT_ITEM }
              ])
            }
            disabled={items.length >= 12}
          >
            Add item
          </button>
        </>
      );
    }
    case 'metrics': {
      const items =
        (c.items as { label: string; value: string; delta: string; tone: string }[] | undefined) ?? [];
      return (
        <>
          <Field label="Heading (optional)">
            <input className="input" value={str('heading')} onChange={(e) => setCfg('heading', e.target.value)} />
          </Field>
          {items.map((it, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, background: 'var(--bg-panel)' }}>
              <div className="field-row">
                <Field label="Label">
                  <input
                    className="input"
                    value={it.label}
                    onChange={(e) => setCfg('items', items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                </Field>
                <Field label="Value">
                  <input
                    className="input"
                    value={it.value}
                    onChange={(e) => setCfg('items', items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  />
                </Field>
                <Field label="Delta">
                  <input
                    className="input"
                    value={it.delta}
                    onChange={(e) => setCfg('items', items.map((x, j) => (j === i ? { ...x, delta: e.target.value } : x)))}
                  />
                </Field>
                <Field label="Tone">
                  <select
                    className="select"
                    value={it.tone}
                    onChange={(e) => setCfg('items', items.map((x, j) => (j === i ? { ...x, tone: e.target.value } : x)))}
                  >
                    {['default', 'success', 'warning', 'danger'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setCfg('items', items.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => setCfg('items', [...items, { label: '', value: '', delta: '', tone: 'default' }])}
            disabled={items.length >= 12}
          >
            Add metric
          </button>
        </>
      );
    }
    case 'blank':
      return <p style={{ color: 'var(--text-muted)' }}>A blank slide shows only the background color — useful as a spacer or custom backdrop.</p>;
    default:
      return null;
  }
}
