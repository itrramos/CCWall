import { useRef, useState } from 'react';
import { api, formatBytes, useApi, type MediaAsset, type Paged } from '../api';
import { useToast } from '../context';
import { EmptyState, Modal, Spinner } from './ui';

export function MediaPicker({
  kind,
  onSelect,
  onClose
}: {
  kind?: 'image' | 'video';
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const query = `/api/media?pageSize=60${kind ? `&kind=${kind}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const { data, loading, reload } = useApi<Paged<MediaAsset>>(query);

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const asset = await api.post<MediaAsset>('/api/media', form);
      toast('Uploaded', 'success');
      onSelect(asset);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      reload();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title={`Select ${kind ?? 'media'}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input
          className="input"
          placeholder="Search media…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search media"
        />
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload new'}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={kind === 'video' ? 'video/*' : kind === 'image' ? 'image/*' : 'image/*,video/*'}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
      {loading && <Spinner />}
      {data && data.items.length === 0 && <EmptyState icon="📁" title="No media found" hint="Upload a file to get started." />}
      <div className="media-grid">
        {data?.items.map((m) => (
          <button
            key={m.id}
            className="card media-card"
            style={{ cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            onClick={() => onSelect(m)}
          >
            <div className="media-thumb">
              {m.kind === 'image' ? (
                <img src={m.url} alt={m.originalName} loading="lazy" />
              ) : (
                <span style={{ fontSize: 28 }}>🎬</span>
              )}
            </div>
            <div className="media-meta">
              <div className="media-name">{m.originalName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatBytes(m.size)}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
