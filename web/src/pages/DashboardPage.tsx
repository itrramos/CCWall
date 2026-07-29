import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatBytes, formatDate, useApi, type Paged, type Wallboard } from '../api';
import { EmptyState, Spinner } from '../components/ui';
import {
  IconCheck,
  IconClock,
  IconExternal,
  IconMedia,
  IconPlay,
  IconPlus,
  IconSlides,
  IconWallboards,
  IconWarning
} from '../components/Icons';

interface Stats {
  totals: {
    wallboards: number;
    enabledWallboards: number;
    slides: number;
    activeSlides: number;
    disabledSlides: number;
    media: number;
  };
  storage: { mediaBytes: number; dataDirBytes: number };
  recentSlides: { id: string; title: string; type: string; enabled: number; updated_at: string }[];
  recentWallboards: { id: string; name: string; slug: string; enabled: number; updated_at: string }[];
  recentActivity: { ts: string; username: string | null; action: string; resource_type: string | null }[];
  upcoming: { id: string; title: string; start_at: string | null; end_at: string | null }[];
  system: { version: string; uptimeSeconds: number; healthy: boolean };
}

function StatCard({
  label,
  value,
  tone,
  icon
}: {
  label: string;
  value: number | string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'violet' | 'info';
  icon: React.ReactNode;
}) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <span className="stat-icon" style={{ background: `var(--${tone}-soft, var(--primary-soft))`, color: `var(--${tone})` }}>
        {icon}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, loading } = useApi<Stats>('/api/stats');
  const { data: wallboards } = useApi<Paged<Wallboard>>('/api/wallboards?pageSize=50');
  const [previewId, setPreviewId] = useState<string>('');

  if (loading && !data) return <Spinner />;
  const t = data?.totals;
  const boards = wallboards?.items ?? [];
  const preview = boards.find((w) => w.id === previewId) ?? boards.find((w) => w.enabled) ?? boards[0];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Wallboard operations at a glance</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => navigate('/slides/new')}>
            <IconPlus size={15} /> Create Slide
          </button>
          <button className="btn" onClick={() => navigate('/wallboards/new')}>
            <IconPlus size={15} /> Create Wallboard
          </button>
          {preview && (
            <a
              className="btn btn-primary"
              href={`/display/${preview.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              <IconExternal size={15} /> Open Live Wallboard
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Total Wallboards" value={t?.wallboards ?? 0} tone="primary" icon={<IconWallboards />} />
        <StatCard label="Total Slides" value={t?.slides ?? 0} tone="violet" icon={<IconSlides />} />
        <StatCard label="Active Slides" value={t?.activeSlides ?? 0} tone="success" icon={<IconCheck />} />
        <StatCard label="Disabled Slides" value={t?.disabledSlides ?? 0} tone="warning" icon={<IconWarning />} />
      </div>
      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Media Assets" value={t?.media ?? 0} tone="info" icon={<IconMedia />} />
        <StatCard label="Media Storage" value={formatBytes(data?.storage.mediaBytes ?? 0)} tone="primary" icon={<IconMedia />} />
        <StatCard
          label="System Status"
          value={data?.system.healthy ? 'Healthy' : 'Degraded'}
          tone={data?.system.healthy ? 'success' : 'danger'}
          icon={<IconCheck />}
        />
        <StatCard
          label="Uptime"
          value={`${Math.floor((data?.system.uptimeSeconds ?? 0) / 3600)}h ${Math.floor(((data?.system.uptimeSeconds ?? 0) % 3600) / 60)}m`}
          tone="violet"
          icon={<IconClock />}
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', marginBottom: 14 }}>
        <div className="card">
          <div className="card-title">
            Wallboard preview
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={preview?.id ?? ''}
                onChange={(e) => setPreviewId(e.target.value)}
                aria-label="Preview wallboard"
              >
                {boards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {preview && (
                <a className="btn btn-sm" href={`/display/${preview.slug}`} target="_blank" rel="noreferrer">
                  <IconPlay size={13} /> Open
                </a>
              )}
            </span>
          </div>
          {preview ? (
            <div className="preview-frame-wrap">
              <iframe src={`/display/${preview.slug}?preview=1`} title={`Preview of ${preview.name}`} />
            </div>
          ) : (
            <EmptyState
              icon="🖥️"
              title="No wallboards yet"
              hint="Create your first wallboard to see a live preview here."
              action={
                <Link className="btn btn-primary" to="/wallboards/new">
                  Create Wallboard
                </Link>
              }
            />
          )}
        </div>
        <div className="card">
          <div className="card-title">Recent activity</div>
          {(data?.recentActivity ?? []).length === 0 && (
            <EmptyState title="No activity yet" hint="Administrative events will appear here." />
          )}
          {(data?.recentActivity ?? []).map((a, i) => (
            <div key={i} className="list-row">
              <span className="badge badge-primary">{a.action.split('.')[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{a.action.replace(/[._]/g, ' ')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {a.username ?? 'system'} · {formatDate(a.ts)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="card-title">
            Recently edited slides
            <Link to="/slides" style={{ fontSize: 12.5 }}>
              View all ↗
            </Link>
          </div>
          {(data?.recentSlides ?? []).length === 0 && <EmptyState title="No slides yet" />}
          {(data?.recentSlides ?? []).map((s) => (
            <div key={s.id} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/slides/${s.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {s.title}
                </Link>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {s.type} · {formatDate(s.updated_at)}
                </div>
              </div>
              <span className={`badge badge-${s.enabled ? 'success' : 'muted'}`}>
                {s.enabled ? 'enabled' : 'disabled'}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">
            Recently edited wallboards
            <Link to="/wallboards" style={{ fontSize: 12.5 }}>
              View all ↗
            </Link>
          </div>
          {(data?.recentWallboards ?? []).length === 0 && <EmptyState title="No wallboards yet" />}
          {(data?.recentWallboards ?? []).map((w) => (
            <div key={w.id} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/wallboards/${w.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {w.name}
                </Link>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  /{w.slug} · {formatDate(w.updated_at)}
                </div>
              </div>
              <span className={`badge badge-${w.enabled ? 'success' : 'muted'}`}>
                {w.enabled ? 'enabled' : 'disabled'}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Upcoming schedule changes</div>
          {(data?.upcoming ?? []).length === 0 && (
            <EmptyState title="Nothing scheduled" hint="Slides with start or end dates appear here." />
          )}
          {(data?.upcoming ?? []).map((u) => (
            <div key={u.id} className="list-row">
              <IconClock size={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/slides/${u.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {u.title}
                </Link>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {u.start_at ? `starts ${formatDate(u.start_at)}` : ''}
                  {u.start_at && u.end_at ? ' · ' : ''}
                  {u.end_at ? `ends ${formatDate(u.end_at)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
