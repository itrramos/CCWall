import { useRef, useState } from 'react';
import { api, ApiError, formatBytes, formatDate, useApi } from '../../api';
import { useToast } from '../../context';
import { ConfirmDialog, EmptyState, Spinner } from '../../components/ui';
import { IconBackup, IconTrash } from '../../components/Icons';

interface BackupRecord {
  id: string;
  ts: string;
  kind: string;
  file_name: string | null;
  size: number | null;
  status: string;
  created_by: string | null;
}

interface ValidateResult {
  valid: boolean;
  manifest: { appVersion: string; schemaVersion: number; createdAt: string; kind: string };
  counts: { wallboards: number; slides: number; media: number; users: number };
}

export default function BackupPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: BackupRecord[] }>('/api/backup/records');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; info: ValidateResult } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const createFull = async (): Promise<void> => {
    setBusy(true);
    try {
      const rec = await api.post<{ fileName: string; size: number }>('/api/backup/full');
      toast(`Backup created (${formatBytes(rec.size)})`, 'success');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Backup failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const validate = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const info = await api.post<ValidateResult>('/api/backup/validate', form);
      setPending({ file, info });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'This file is not a valid CCWall backup', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const restore = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', pending.file);
      form.append('confirm', 'true');
      const result = await api.post<{ restoredFiles: number }>('/api/backup/restore', form);
      toast(`Restore complete (${result.restoredFiles} media files)`, 'success');
      setPending(null);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Restore failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup &amp; Restore</h1>
          <div className="page-sub">Full backups include the database and all media</div>
        </div>
      </div>
      <div className="grid grid-3" style={{ marginBottom: 14, alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">Full backup</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Creates a zip with the database snapshot, configuration export and all uploaded media. Stored
            in the backups folder and downloadable below.
          </p>
          <button className="btn btn-primary" onClick={() => void createFull()} disabled={busy}>
            <IconBackup size={15} /> {busy ? 'Working…' : 'Create full backup'}
          </button>
        </div>
        <div className="card">
          <div className="card-title">Configuration export</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            JSON export of settings, wallboards, slides and metadata. Contains no media binaries and no
            password material.
          </p>
          <a className="btn" href="/api/backup/export" download>
            Download export.json
          </a>
        </div>
        <div className="card">
          <div className="card-title">Restore</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Upload a full backup zip or a configuration export. The backup is validated first and you
            must confirm before anything is replaced.
          </p>
          <button className="btn btn-danger" onClick={() => fileRef.current?.click()} disabled={busy}>
            Choose backup file…
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".zip,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void validate(f);
            }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading && !data && <Spinner />}
        {data && data.items.length === 0 && (
          <EmptyState icon="🗄️" title="No backups yet" hint="Create a full backup to see it here." />
        )}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>File</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>By</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id}>
                    <td>{formatDate(b.ts)}</td>
                    <td>
                      <span className="badge badge-primary">{b.kind}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{b.file_name ?? '—'}</td>
                    <td>{b.size ? formatBytes(b.size) : '—'}</td>
                    <td>
                      <span className={`badge badge-${b.status === 'ok' ? 'success' : 'danger'}`}>{b.status}</span>
                    </td>
                    <td>{b.created_by ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {b.kind === 'full' && b.status === 'ok' && (
                          <a className="btn btn-sm" href={`/api/backup/download/${b.id}`} download>
                            Download
                          </a>
                        )}
                        <button
                          className="btn btn-ghost btn-icon"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => {
                            void api.del(`/api/backup/records/${b.id}`).then(() => reload());
                          }}
                          aria-label="Delete backup record"
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title="Restore backup?"
          confirmLabel={busy ? 'Restoring…' : 'Restore and replace'}
          message={
            <>
              Backup from <strong>{formatDate(pending.info.manifest.createdAt)}</strong> (CCWall v
              {pending.info.manifest.appVersion}, {pending.info.manifest.kind}) containing{' '}
              <strong>{pending.info.counts.wallboards}</strong> wallboards,{' '}
              <strong>{pending.info.counts.slides}</strong> slides and{' '}
              <strong>{pending.info.counts.media}</strong> media entries.
              <br />
              <br />
              <strong style={{ color: 'var(--danger)' }}>
                This replaces all current wallboards, slides, media metadata and settings.
              </strong>{' '}
              User accounts and passwords are not changed.
            </>
          }
          onConfirm={() => void restore()}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
