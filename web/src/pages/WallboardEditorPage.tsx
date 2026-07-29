import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  api,
  ApiError,
  SLIDE_TYPE_LABELS,
  useApi,
  type Paged,
  type Slide,
  type Wallboard
} from '../api';
import { useToast } from '../context';
import { ColorField, Field, Modal, Spinner, Toggle } from '../components/ui';
import { IconCopy, IconDown, IconExternal, IconGrip, IconPlus, IconTrash, IconUp } from '../components/Icons';

interface PlaylistItem {
  slideId: string;
  title: string;
  type: string;
  enabled: boolean;
  durationOverride: number | null;
}

interface WbForm {
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
  pin?: string | null;
}

const DEFAULT_FORM: WbForm = {
  name: '',
  description: '',
  slug: '',
  enabled: true,
  defaultDuration: 15,
  transition: 'fade',
  transitionDuration: 500,
  background: '#0b1020',
  aspectRatio: 'auto',
  resolution: 'auto',
  fullscreenBehavior: 'button',
  autostart: true,
  loopSlides: true,
  refreshMinutes: 0,
  schedule: null,
  access: 'public'
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WallboardEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { data: existing, loading, reload } = useApi<Wallboard>(id ? `/api/wallboards/${id}` : null);
  const [form, setForm] = useState<WbForm>(DEFAULT_FORM);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [snapshot, setSnapshot] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!existing) return;
    const f: WbForm = {
      name: existing.name,
      description: existing.description,
      slug: existing.slug,
      enabled: existing.enabled,
      defaultDuration: existing.defaultDuration,
      transition: existing.transition,
      transitionDuration: existing.transitionDuration,
      background: existing.background,
      aspectRatio: existing.aspectRatio,
      resolution: existing.resolution,
      fullscreenBehavior: existing.fullscreenBehavior,
      autostart: existing.autostart,
      loopSlides: existing.loopSlides,
      refreshMinutes: existing.refreshMinutes,
      schedule: existing.schedule,
      access: existing.access
    };
    const pl = (existing.slides ?? []).map((s) => ({
      slideId: s.id,
      title: s.title,
      type: s.type,
      enabled: s.enabled,
      durationOverride: s.durationOverride ?? null
    }));
    setForm(f);
    setPlaylist(pl);
    setSnapshot(JSON.stringify({ f, pl }));
  }, [existing]);

  useEffect(() => {
    if (isNew) setSnapshot(JSON.stringify({ f: DEFAULT_FORM, pl: [] }));
  }, [isNew]);

  const dirty = snapshot !== '' && JSON.stringify({ f: form, pl: playlist }) !== snapshot;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const set = <K extends keyof WbForm>(key: K, value: WbForm[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const payload = { ...form, slug: form.slug || undefined };
      let wbId = id;
      if (isNew) {
        const created = await api.post<Wallboard>('/api/wallboards', payload);
        wbId = created.id;
      } else {
        await api.patch(`/api/wallboards/${id}`, payload);
      }
      await api.put(`/api/wallboards/${wbId}/slides`, {
        slides: playlist.map((p) => ({ slideId: p.slideId, durationOverride: p.durationOverride }))
      });
      toast(isNew ? 'Wallboard created' : 'Wallboard saved', 'success');
      setSnapshot(JSON.stringify({ f: form, pl: playlist }));
      if (isNew) navigate(`/wallboards/${wbId}`, { replace: true });
      else reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= playlist.length) return;
    setPlaylist((pl) => {
      const next = [...pl];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  const back = (): void => {
    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
    navigate('/wallboards');
  };

  const copyUrl = (): void => {
    if (!existing) return;
    const url = `${window.location.origin}/display/${existing.slug}${
      existing.access === 'token' && existing.accessToken ? `?token=${existing.accessToken}` : ''
    }`;
    void navigator.clipboard.writeText(url).then(
      () => toast('Display URL copied', 'success'),
      () => toast(url, 'info')
    );
  };

  if (loading && !existing && !isNew) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isNew ? 'Create Wallboard' : `Edit: ${existing?.name ?? ''}`}</h1>
          <div className="page-sub">
            {!isNew && <code>/display/{existing?.slug}</code>}
            {dirty && (
              <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                unsaved changes
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={back}>
            Back
          </button>
          {!isNew && existing && (
            <>
              <button className="btn" onClick={copyUrl}>
                <IconCopy size={15} /> Copy URL
              </button>
              <a className="btn" href={`/display/${existing.slug}`} target="_blank" rel="noreferrer">
                <IconExternal size={15} /> Open live
              </a>
            </>
          )}
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !form.name}>
            {busy ? 'Saving…' : 'Save wallboard'}
          </button>
        </div>
      </div>
      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 14, color: 'var(--danger)' }} role="alert">
          {error}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.1fr)', alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Basics</div>
            <Field label="Name">
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </Field>
            <Field label="Description">
              <textarea className="textarea" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Slug" hint="Used in the display URL. Leave empty to generate from the name.">
              <input
                className="input"
                value={form.slug}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                onChange={(e) => set('slug', e.target.value.toLowerCase())}
              />
            </Field>
            <Toggle label="Enabled" checked={form.enabled} onChange={(v) => set('enabled', v)} hint="Disabled wallboards return 404 on their display URL." />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Playback</div>
            <div className="field-row">
              <Field label="Default slide duration (s)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.defaultDuration}
                  onChange={(e) => set('defaultDuration', Number(e.target.value))}
                />
              </Field>
              <Field label="Transition">
                <select className="select" value={form.transition} onChange={(e) => set('transition', e.target.value)}>
                  {['none', 'fade', 'slide-left', 'slide-up', 'zoom'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Transition duration (ms)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={form.transitionDuration}
                  onChange={(e) => set('transitionDuration', Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="field-row">
              <ColorField label="Background" value={form.background} onChange={(v) => set('background', v)} />
              <Field label="Aspect ratio">
                <select className="select" value={form.aspectRatio} onChange={(e) => set('aspectRatio', e.target.value)}>
                  {['auto', '16:9', '4:3', '21:9', '9:16'].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </Field>
              <Field label="Resolution hint">
                <select className="select" value={form.resolution} onChange={(e) => set('resolution', e.target.value)}>
                  {['auto', '720p', '1080p', '4k'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="field-row">
              <Field label="Full-screen button">
                <select className="select" value={form.fullscreenBehavior} onChange={(e) => set('fullscreenBehavior', e.target.value)}>
                  <option value="button">Show button</option>
                  <option value="hidden">Hidden (keyboard F only)</option>
                </select>
              </Field>
              <Field label="Full reload every (min)" hint="0 = never">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.refreshMinutes}
                  onChange={(e) => set('refreshMinutes', Number(e.target.value))}
                />
              </Field>
            </div>
            <Toggle label="Auto-start playback" checked={form.autostart} onChange={(v) => set('autostart', v)} />
            <Toggle label="Loop playlist" checked={form.loopSlides} onChange={(v) => set('loopSlides', v)} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">On-air schedule (optional)</div>
            <Toggle
              label="Restrict when this wallboard plays"
              checked={form.schedule != null}
              onChange={(v) => set('schedule', v ? { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' } : null)}
            />
            {form.schedule && (
              <>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '10px 0' }}>
                  {DAY_LABELS.map((d, i) => {
                    const active = form.schedule!.days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`btn btn-sm${active ? ' btn-primary' : ''}`}
                        aria-pressed={active}
                        onClick={() => {
                          const days = active
                            ? form.schedule!.days.filter((x) => x !== i)
                            : [...form.schedule!.days, i].sort();
                          set('schedule', { ...form.schedule!, days });
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="field-row">
                  <Field label="From">
                    <input
                      className="input"
                      type="time"
                      value={form.schedule.start}
                      onChange={(e) => set('schedule', { ...form.schedule!, start: e.target.value })}
                    />
                  </Field>
                  <Field label="Until">
                    <input
                      className="input"
                      type="time"
                      value={form.schedule.end}
                      onChange={(e) => set('schedule', { ...form.schedule!, end: e.target.value })}
                    />
                  </Field>
                </div>
                <p className="field-hint">Outside these hours the display shows a standby screen.</p>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">Access</div>
            <Field label="Display access">
              <select className="select" value={form.access} onChange={(e) => set('access', e.target.value as WbForm['access'])}>
                <option value="public">Public — anyone with the URL</option>
                <option value="token">Token — secret link required</option>
                <option value="pin">PIN — viewer must enter a PIN</option>
              </select>
            </Field>
            {form.access === 'token' && (
              <>
                {existing?.accessToken ? (
                  <Field label="Current token URL">
                    <input
                      className="input"
                      readOnly
                      value={`${window.location.origin}/display/${existing.slug}?token=${existing.accessToken}`}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                ) : (
                  <p className="field-hint">A token is generated when you save.</p>
                )}
                {!isNew && (
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      void api.post(`/api/wallboards/${id}/regenerate-token`).then(() => {
                        toast('Token regenerated — old links stop working', 'success');
                        reload();
                      });
                    }}
                  >
                    Regenerate token
                  </button>
                )}
              </>
            )}
            {form.access === 'pin' && (
              <Field label={existing?.hasPin ? 'Change PIN (leave empty to keep)' : 'PIN (4–8 digits)'}>
                <input
                  className="input"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  value={form.pin ?? ''}
                  onChange={(e) => set('pin', e.target.value || null)}
                />
              </Field>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            Playlist ({playlist.length} slides)
            <button className="btn btn-sm btn-primary" onClick={() => setAddOpen(true)}>
              <IconPlus size={13} /> Add slides
            </button>
          </div>
          {playlist.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              No slides yet. Add slides and drag to reorder — order here is playback order.
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Playlist order">
            {playlist.map((p, i) => (
              <li
                key={p.slideId}
                className={`dnd-item${dragIndex === i ? ' dragging' : ''}${overIndex === i && dragIndex !== null && dragIndex !== i ? ' drag-over' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              >
                <span className="dnd-handle" aria-hidden="true">
                  <IconGrip size={15} />
                </span>
                <span style={{ width: 22, textAlign: 'right', color: 'var(--text-faint)', fontSize: 12 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {SLIDE_TYPE_LABELS[p.type] ?? p.type}
                    {!p.enabled && ' · disabled'}
                  </div>
                </div>
                <input
                  className="input"
                  style={{ width: 74 }}
                  type="number"
                  min={1}
                  placeholder={`${form.defaultDuration}s`}
                  title="Duration override (seconds)"
                  aria-label={`Duration override for ${p.title}`}
                  value={p.durationOverride ?? ''}
                  onChange={(e) =>
                    setPlaylist((pl) =>
                      pl.map((x, j) => (j === i ? { ...x, durationOverride: e.target.value ? Number(e.target.value) : null } : x))
                    )
                  }
                />
                <button className="btn btn-ghost btn-icon" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${p.title} up`}>
                  <IconUp size={14} />
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => move(i, i + 1)}
                  disabled={i === playlist.length - 1}
                  aria-label={`Move ${p.title} down`}
                >
                  <IconDown size={14} />
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => setPlaylist((pl) => pl.filter((_, j) => j !== i))}
                  aria-label={`Remove ${p.title} from playlist`}
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ul>
          {!isNew && existing && (
            <div style={{ marginTop: 14 }}>
              <div className="card-title">Preview</div>
              <div className="preview-frame-wrap">
                <iframe src={`/display/${existing.slug}?preview=1`} title={`Preview of ${existing.name}`} />
              </div>
              <p className="field-hint" style={{ marginTop: 6 }}>
                Preview reflects the last saved state.
              </p>
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <AddSlidesModal
          existingIds={playlist.map((p) => p.slideId)}
          onAdd={(slides) => {
            setPlaylist((pl) => [
              ...pl,
              ...slides.map((s) => ({
                slideId: s.id,
                title: s.title,
                type: s.type,
                enabled: s.enabled,
                durationOverride: null
              }))
            ]);
            setAddOpen(false);
          }}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  );
}

function AddSlidesModal({
  existingIds,
  onAdd,
  onClose
}: {
  existingIds: string[];
  onAdd: (slides: Slide[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, Slide>>({});
  const { data, loading } = useApi<Paged<Slide>>(`/api/slides?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const available = (data?.items ?? []).filter((s) => !existingIds.includes(s.id));
  return (
    <Modal title="Add slides to playlist" onClose={onClose} wide>
      <input
        className="input"
        placeholder="Search slides…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
        aria-label="Search slides to add"
      />
      {loading && <Spinner />}
      {available.length === 0 && !loading && <p style={{ color: 'var(--text-muted)' }}>No more slides available. Create slides first.</p>}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {available.map((s) => (
          <label key={s.id} className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(selected[s.id])}
              onChange={(e) =>
                setSelected((sel) => {
                  const next = { ...sel };
                  if (e.target.checked) next[s.id] = s;
                  else delete next[s.id];
                  return next;
                })
              }
            />
            <span>
              <strong>{s.title}</strong>{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {SLIDE_TYPE_LABELS[s.type] ?? s.type}
                {!s.enabled && ' · disabled'}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={Object.keys(selected).length === 0} onClick={() => onAdd(Object.values(selected))}>
          Add {Object.keys(selected).length || ''} slides
        </button>
      </div>
    </Modal>
  );
}
