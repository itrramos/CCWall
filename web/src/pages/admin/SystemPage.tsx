import { useEffect, useState } from 'react';
import { api, ApiError, formatBytes, useApi } from '../../api';
import { useToast } from '../../context';
import { Field, Spinner } from '../../components/ui';

interface SystemInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  uptimeSeconds: number;
  startedAt: string;
  dataDir: string;
  dbBytes: number;
  logLevel: string;
  env: { NODE_ENV: string; PORT: number; TZ: string; TRUST_PROXY: string };
  settings: { auditRetentionDays: number };
}

export default function SystemPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<SystemInfo>('/api/system');
  const { data: health } = useApi<{ status: string }>('/api/health');
  const [logLevel, setLogLevel] = useState('info');
  const [retention, setRetention] = useState(90);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setLogLevel(data.logLevel);
      setRetention(data.settings.auditRetentionDays);
    }
  }, [data]);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.put('/api/settings/system', { logLevel, auditRetentionDays: retention });
      toast('System settings saved', 'success');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) return <Spinner />;

  const uptime = `${Math.floor(data.uptimeSeconds / 86400)}d ${Math.floor((data.uptimeSeconds % 86400) / 3600)}h ${Math.floor((data.uptimeSeconds % 3600) / 60)}m`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">System</h1>
          <div className="page-sub">Runtime information and diagnostics</div>
        </div>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">Status</div>
          {[
            ['App version', `CCWall v${data.version}`],
            ['Health', health?.status === 'ok' ? '✅ healthy' : '⚠️ degraded'],
            ['Uptime', uptime],
            ['Started', new Date(data.startedAt).toLocaleString()],
            ['Node.js', data.nodeVersion],
            ['Platform', data.platform],
            ['Database size', formatBytes(data.dbBytes)],
            ['Data directory', data.dataDir]
          ].map(([k, v]) => (
            <div key={k} className="list-row">
              <span style={{ flex: 1, color: 'var(--text-muted)' }}>{k}</span>
              <code style={{ fontSize: 12.5 }}>{v}</code>
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Environment</div>
            {Object.entries(data.env).map(([k, v]) => (
              <div key={k} className="list-row">
                <span style={{ flex: 1, color: 'var(--text-muted)' }}>{k}</span>
                <code style={{ fontSize: 12.5 }}>{String(v)}</code>
              </div>
            ))}
            <p className="field-hint" style={{ marginTop: 8 }}>
              Secrets are never displayed. To restart the app run{' '}
              <code>docker compose restart ccwall</code> on the host.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Logging &amp; retention</div>
            <Field label="Log level">
              <select className="select" value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
                {['debug', 'info', 'warn', 'error'].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Audit log retention (days)">
              <input
                className="input"
                type="number"
                min={7}
                max={3650}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
              />
            </Field>
          </div>
        </div>
      </div>
    </>
  );
}
