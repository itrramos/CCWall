import { useMemo, useRef, useState } from 'react';
import { api, ApiError, formatBytes, formatDate, useApi, type MediaAsset, type Paged } from '../api';
import { useAuth, useToast } from '../context';
import { ConfirmDialog, EmptyState, Modal, Pagination, Spinner } from '../components/ui';
import { IconTrash } from '../components/Icons';

export default function MediaPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('created_at');
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<MediaAsset | null>(null);
  const [usage, setUsage] = useState<{ asset: MediaAsset; usedBy: { id: string; title: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '24', sort, order: sort === 'name' ? 'asc' : 'desc' });
    if (q) p.set('q', q);
    if (kind) p.set('kind', kind);
    return `/api/media?${p}`;
  }, [page, q, kind, sort]);
  const { data, loading, reload } = useApi<Paged<MediaAsset>>(query);

  const upload = async (files: FileList): Promise<void> => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.post('/api/media', form);
      }
      toast('Upload complete', 'success');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doDelete = async (force: boolean): Promise<void> => {
    if (!toDelete) return;
    try {
      await api.del(`/api/media/${toDelete.id}${force ? '?force=true' : ''}`);
      toast('Media deleted', 'success');
      setToDelete(null);
      setUsage(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'in_use') {
        const details = err.details as { usedBy: { id: string; title: string }[] };
        setUsage({ asset: toDelete, usedBy: details.usedBy });
        setToDelete(null);
      } else {
        toast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Media Library</h1>
          <div className="page-sub">
            {data ? `${data.total} assets · ${formatBytes(data.totalBytes ?? 0)} used` : 'Uploaded images and videos'}
          </div>
        </div>
        {canEdit && (
          <>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload media'}
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*,video/*"
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
              }}
            />
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search media…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search media"
        />
        <select className="select" style={{ maxWidth: 140 }} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="Filter by kind">
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select className="select" style={{ maxWidth: 160 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort media">
          <option value="created_at">Newest first</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
      </div>

      {loading && !data && <Spinner />}
      {data && data.items.length === 0 && (
        <div className="card">
          <EmptyState icon="🖼️" title="No media yet" hint="Upload images and videos to use them in slides." />
        </div>
      )}
      <div className="media-grid">
        {data?.items.map((m) => (
          <div key={m.id} className="card media-card">
            <div className="media-thumb">
              {m.kind === 'image' ? (
                <img src={m.url} alt={m.originalName} loading="lazy" />
              ) : (
                <video src={m.url} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div className="media-meta">
              <div className="media-name" title={m.originalName}>
                {m.originalName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>
                  {m.kind} · {formatBytes(m.size)}
                </span>
                <span>{formatDate(m.createdAt).split(',')[0]}</span>
              </div>
              {canEdit && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)', marginTop: 6 }}
                  onClick={() => setToDelete(m)}
                  aria-label={`Delete ${m.originalName}`}
                >
                  <IconTrash size={13} /> Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      {toDelete && (
        <ConfirmDialog
          title="Delete media"
          message={
            <>
              Delete <strong>{toDelete.originalName}</strong>? If it is used by slides you will be warned first.
            </>
          }
          onConfirm={() => void doDelete(false)}
          onCancel={() => setToDelete(null)}
        />
      )}
      {usage && (
        <Modal title="Media is in use" onClose={() => setUsage(null)}>
          <p style={{ color: 'var(--text-muted)' }}>
            <strong>{usage.asset.originalName}</strong> is used by {usage.usedBy.length} slide(s):
          </p>
          <ul>
            {usage.usedBy.map((s) => (
              <li key={s.id}>
                <a href={`/slides/${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="btn" onClick={() => setUsage(null)}>
              Keep it
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                setToDelete(usage.asset);
                void (async () => {
                  await api.del(`/api/media/${usage.asset.id}?force=true`);
                  toast('Media deleted', 'success');
                  setUsage(null);
                  setToDelete(null);
                  reload();
                })();
              }}
            >
              Delete anyway
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
