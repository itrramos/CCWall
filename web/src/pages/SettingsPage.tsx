import { useEffect, useState } from 'react';
import { api, ApiError, useApi, type Paged, type Wallboard } from '../api';
import { useAuth, useTheme, useToast } from '../context';
import { ColorField, Field, Spinner, Toggle } from '../components/ui';

interface GeneralSettings {
  appName: string;
  subtitle: string;
  timeZone: string;
  dateFormat: string;
  timeFormat: string;
  defaultTheme: 'dark' | 'light';
  defaultWallboardId: string | null;
  defaultSlideDuration: number;
  defaultTransition: string;
  defaultBackground: string;
  itemsPerPage: number;
}

interface WallboardSettings {
  loopSlides: boolean;
  autoStart: boolean;
  showControls: boolean;
  hideCursorSeconds: number;
  refreshIntervalSeconds: number;
  preloadNext: boolean;
  errorFallbackSeconds: number;
  defaultResolution: string;
  defaultAspectRatio: string;
  keepScreenAwake: boolean;
}

export default function SettingsPage({ adminGeneral }: { adminGeneral?: boolean }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();
  const { setTheme } = useTheme();
  const [tab, setTab] = useState<'general' | 'wallboard'>(adminGeneral ? 'general' : 'general');
  const { data, loading } = useApi<{ general: GeneralSettings; wallboard: WallboardSettings }>('/api/settings');
  const { data: wallboards } = useApi<Paged<Wallboard>>('/api/wallboards?pageSize=100');
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [wb, setWb] = useState<WallboardSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setGeneral(data.general);
      setWb(data.wallboard);
    }
  }, [data]);

  const save = async (): Promise<void> => {
    if (!general || !wb) return;
    setBusy(true);
    try {
      await api.put('/api/settings/general', general);
      await api.put('/api/settings/wallboard', wb);
      setTheme(general.defaultTheme);
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !general || !wb) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{adminGeneral ? 'General Administration' : 'Settings'}</h1>
          <div className="page-sub">Application defaults and wallboard behavior</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        )}
      </div>
      {!isAdmin && (
        <div className="card" style={{ marginBottom: 14, color: 'var(--text-muted)' }}>
          Settings are read-only for your role. Ask an administrator to make changes.
        </div>
      )}

      <div className="tabs" role="tablist">
        <button className={`tab${tab === 'general' ? ' active' : ''}`} role="tab" aria-selected={tab === 'general'} onClick={() => setTab('general')}>
          General
        </button>
        <button className={`tab${tab === 'wallboard' ? ' active' : ''}`} role="tab" aria-selected={tab === 'wallboard'} onClick={() => setTab('wallboard')}>
          Wallboard defaults
        </button>
      </div>

      {tab === 'general' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">Branding & locale</div>
            <Field label="Application name">
              <input className="input" value={general.appName} disabled={!isAdmin} onChange={(e) => setGeneral({ ...general, appName: e.target.value })} />
            </Field>
            <Field label="Subtitle">
              <input className="input" value={general.subtitle} disabled={!isAdmin} onChange={(e) => setGeneral({ ...general, subtitle: e.target.value })} />
            </Field>
            <Field label="Time zone" hint='IANA name, e.g. "Europe/London". Empty = server default.'>
              <input className="input" value={general.timeZone} disabled={!isAdmin} onChange={(e) => setGeneral({ ...general, timeZone: e.target.value })} />
            </Field>
            <div className="field-row">
              <Field label="Date format">
                <select className="select" value={general.dateFormat} disabled={!isAdmin} onChange={(e) => setGeneral({ ...general, dateFormat: e.target.value })}>
                  <option value="iso">ISO (2026-07-18)</option>
                  <option value="eu">European (18/07/2026)</option>
                  <option value="us">US (07/18/2026)</option>
                </select>
              </Field>
              <Field label="Time format">
                <select className="select" value={general.timeFormat} disabled={!isAdmin} onChange={(e) => setGeneral({ ...general, timeFormat: e.target.value })}>
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </select>
              </Field>
            </div>
            <Field label="Default theme">
              <select
                className="select"
                value={general.defaultTheme}
                disabled={!isAdmin}
                onChange={(e) => setGeneral({ ...general, defaultTheme: e.target.value as 'dark' | 'light' })}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </Field>
            <Field label="Items per page">
              <input
                className="input"
                type="number"
                min={5}
                max={200}
                value={general.itemsPerPage}
                disabled={!isAdmin}
                onChange={(e) => setGeneral({ ...general, itemsPerPage: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="card">
            <div className="card-title">Content defaults</div>
            <Field label="Default wallboard" hint="Shown in the dashboard preview by default.">
              <select
                className="select"
                value={general.defaultWallboardId ?? ''}
                disabled={!isAdmin}
                onChange={(e) => setGeneral({ ...general, defaultWallboardId: e.target.value || null })}
              >
                <option value="">— none —</option>
                {wallboards?.items.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field-row">
              <Field label="Default slide duration (s)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={general.defaultSlideDuration}
                  disabled={!isAdmin}
                  onChange={(e) => setGeneral({ ...general, defaultSlideDuration: Number(e.target.value) })}
                />
              </Field>
              <Field label="Default transition">
                <select className="select" value={general.defaultTransition} disabled={!isAdmin} onChange={(e) => setGeneral({ ...general, defaultTransition: e.target.value })}>
                  {['none', 'fade', 'slide-left', 'slide-up', 'zoom'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
            <ColorField
              label="Default background"
              value={general.defaultBackground}
              onChange={(v) => isAdmin && setGeneral({ ...general, defaultBackground: v })}
            />
          </div>
        </div>
      )}

      {tab === 'wallboard' && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">Playback behavior</div>
            <Toggle label="Loop slides" checked={wb.loopSlides} onChange={(v) => isAdmin && setWb({ ...wb, loopSlides: v })} />
            <Toggle label="Auto-start playback" checked={wb.autoStart} onChange={(v) => isAdmin && setWb({ ...wb, autoStart: v })} />
            <Toggle label="Show on-screen controls" checked={wb.showControls} onChange={(v) => isAdmin && setWb({ ...wb, showControls: v })} />
            <Toggle
              label="Preload next slide"
              checked={wb.preloadNext}
              onChange={(v) => isAdmin && setWb({ ...wb, preloadNext: v })}
              hint="Renders the upcoming slide off-screen to avoid flashes."
            />
            <Toggle
              label="Keep screen awake"
              checked={wb.keepScreenAwake}
              onChange={(v) => isAdmin && setWb({ ...wb, keepScreenAwake: v })}
              hint="Uses the browser Wake Lock API where supported."
            />
          </div>
          <div className="card">
            <div className="card-title">Timing & display</div>
            <div className="field-row">
              <Field label="Hide cursor after (s)" hint="0 = never hide">
                <input className="input" type="number" min={0} value={wb.hideCursorSeconds} disabled={!isAdmin} onChange={(e) => setWb({ ...wb, hideCursorSeconds: Number(e.target.value) })} />
              </Field>
              <Field label="Playlist refresh (s)" hint="How often displays check for updates.">
                <input className="input" type="number" min={10} value={wb.refreshIntervalSeconds} disabled={!isAdmin} onChange={(e) => setWb({ ...wb, refreshIntervalSeconds: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Error fallback duration (s)" hint="How long a failed slide is shown before skipping.">
              <input className="input" type="number" min={1} value={wb.errorFallbackSeconds} disabled={!isAdmin} onChange={(e) => setWb({ ...wb, errorFallbackSeconds: Number(e.target.value) })} />
            </Field>
            <div className="field-row">
              <Field label="Default resolution">
                <select className="select" value={wb.defaultResolution} disabled={!isAdmin} onChange={(e) => setWb({ ...wb, defaultResolution: e.target.value })}>
                  {['auto', '720p', '1080p', '4k'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default aspect ratio">
                <select className="select" value={wb.defaultAspectRatio} disabled={!isAdmin} onChange={(e) => setWb({ ...wb, defaultAspectRatio: e.target.value })}>
                  {['auto', '16:9', '4:3', '21:9', '9:16'].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
