import { useEffect, useState } from 'react';
import { api, ApiError, formatBytes, useApi } from '../../api';
import { useToast } from '../../context';
import { ConfirmDialog, Field, Spinner } from '../../components/ui';

interface StorageSettings {
  maxUploadSizeMb: number;
  allowedMediaTypes: string[];
}

const ALL_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg'];

export default function StoragePage() {
  const toast = useToast();
  const { data, loading } = useApi<{ storage: StorageSettings }>('/api/settings');
  const { data: stats, reload: reloadStats } = useApi<{
    storage: { mediaBytes: number; dataDirBytes: number };
    totals: { media: number };
  }>('/api/stats');
  const { data: system } = useApi<{ dataDir: string; dbBytes: number }>('/api/system');
  const [s, setS] = useState<StorageSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  useEffect(() => {
    if (data?.storage) setS(data.storage);
  }, [data]);

  const save = async (): Promise<void> => {
    if (!s) return;
    setBusy(true);
    try {
      await api.put('/api/settings/storage', s);
      toast('Storage settings saved', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cleanup = async (): Promise<void> => {
    setConfirmCleanup(false);
    const result = await api.post<{ removed: number }>('/api/media/cleanup-unused');
    toast(`Removed ${result.removed} unused asset(s)`, 'success');
    reloadStats();
  };

  if (loading || !s) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Storage</h1>
          <div className="page-sub">Data directory, uploads and cleanup</div>
        </div>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">Usage</div>
          <div className="list-row">
            <span style={{ flex: 1 }}>Data directory</span>
            <code style={{ fontSize: 12 }}>{system?.dataDir ?? '…'}</code>
          </div>
          <div className="list-row">
            <span style={{ flex: 1 }}>Media library</span>
            <strong>
              {stats?.totals.media ?? 0} files · {formatBytes(stats?.storage.mediaBytes ?? 0)}
            </strong>
          </div>
          <div className="list-row">
            <span style={{ flex: 1 }}>Database</span>
            <strong>{formatBytes(system?.dbBytes ?? 0)}</strong>
          </div>
          <div className="list-row">
            <span style={{ flex: 1 }}>Total data directory</span>
            <strong>{formatBytes(stats?.storage.dataDirBytes ?? 0)}</strong>
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setConfirmCleanup(true)}>
              Clean up unused media
            </button>
            <p className="field-hint" style={{ marginTop: 6 }}>
              Deletes uploaded files not referenced by any slide, logo or favicon.
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Upload rules</div>
          <Field label="Maximum upload size (MB)">
            <input
              className="input"
              type="number"
              min={1}
              max={4096}
              value={s.maxUploadSizeMb}
              onChange={(e) => setS({ ...s, maxUploadSizeMb: Number(e.target.value) })}
            />
          </Field>
          <div className="field">
            <span className="field-label">Allowed media types</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ALL_TYPES.map((t) => {
                const active = s.allowedMediaTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={`btn btn-sm${active ? ' btn-primary' : ''}`}
                    aria-pressed={active}
                    onClick={() =>
                      setS({
                        ...s,
                        allowedMediaTypes: active
                          ? s.allowedMediaTypes.filter((x) => x !== t)
                          : [...s.allowedMediaTypes, t]
                      })
                    }
                  >
                    .{t}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="field-hint">
            Export and import of all content is available under Backup &amp; Restore.
          </p>
        </div>
      </div>
      {confirmCleanup && (
        <ConfirmDialog
          title="Clean up unused media"
          message="Permanently delete every uploaded file that no slide references? This cannot be undone."
          confirmLabel="Clean up"
          onConfirm={() => void cleanup()}
          onCancel={() => setConfirmCleanup(false)}
        />
      )}
    </>
  );
}
