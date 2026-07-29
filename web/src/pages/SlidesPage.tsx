import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatDate, SLIDE_TYPE_LABELS, useApi, type Paged, type Slide } from '../api';
import { useAuth, useToast } from '../context';
import { ConfirmDialog, EmptyState, Pagination, Spinner } from '../components/ui';
import { IconCopy, IconEdit, IconPlus, IconTrash } from '../components/Icons';

export default function SlidesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [enabled, setEnabled] = useState('');
  const [toDelete, setToDelete] = useState<Slide | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20', sort: 'updated_at' });
    if (q) p.set('q', q);
    if (type) p.set('type', type);
    if (enabled) p.set('enabled', enabled);
    return `/api/slides?${p}`;
  }, [page, q, type, enabled]);

  const { data, loading, reload } = useApi<Paged<Slide>>(query);

  const toggle = async (s: Slide): Promise<void> => {
    await api.patch(`/api/slides/${s.id}`, { enabled: !s.enabled });
    toast(`Slide ${s.enabled ? 'disabled' : 'enabled'}`, 'success');
    reload();
  };

  const duplicate = async (s: Slide): Promise<void> => {
    const copy = await api.post<Slide>(`/api/slides/${s.id}/duplicate`);
    toast('Slide duplicated', 'success');
    navigate(`/slides/${copy.id}`);
  };

  const doDelete = async (): Promise<void> => {
    if (!toDelete) return;
    await api.del(`/api/slides/${toDelete.id}`);
    setToDelete(null);
    toast('Slide deleted', 'success');
    reload();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Slides</h1>
          <div className="page-sub">All content slides across your wallboards</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => navigate('/slides/new')}>
            <IconPlus size={15} /> Create Slide
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search slides…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search slides"
        />
        <select
          className="select"
          style={{ maxWidth: 190 }}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {Object.entries(SLIDE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ maxWidth: 150 }}
          value={enabled}
          onChange={(e) => {
            setEnabled(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading && !data && <Spinner />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon="🖼️"
            title="No slides found"
            hint={q || type || enabled ? 'Try changing the filters.' : 'Create your first slide to get started.'}
            action={
              canEdit && !q ? (
                <Link className="btn btn-primary" to="/slides/new">
                  Create Slide
                </Link>
              ) : undefined
            }
          />
        )}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Schedule</th>
                  <th>Updated</th>
                  {canEdit && <th style={{ width: 150 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/slides/${s.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {s.title}
                      </Link>
                      {s.tags && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{s.tags}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-violet">{SLIDE_TYPE_LABELS[s.type] ?? s.type}</span>
                    </td>
                    <td>
                      {canEdit ? (
                        <button
                          className={`badge badge-${s.enabled ? 'success' : 'muted'}`}
                          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => void toggle(s)}
                          aria-label={`${s.enabled ? 'Disable' : 'Enable'} ${s.title}`}
                        >
                          {s.enabled ? 'enabled' : 'disabled'}
                        </button>
                      ) : (
                        <span className={`badge badge-${s.enabled ? 'success' : 'muted'}`}>
                          {s.enabled ? 'enabled' : 'disabled'}
                        </span>
                      )}
                    </td>
                    <td>{s.duration ? `${s.duration}s` : 'default'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.startAt || s.endAt || (s.daysOfWeek && s.daysOfWeek.length) ? 'scheduled' : 'always'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(s.updatedAt)}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={() => navigate(`/slides/${s.id}`)}
                            aria-label={`Edit ${s.title}`}
                          >
                            <IconEdit size={15} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={() => void duplicate(s)}
                            aria-label={`Duplicate ${s.title}`}
                          >
                            <IconCopy size={15} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setToDelete(s)}
                            aria-label={`Delete ${s.title}`}
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {toDelete && (
        <ConfirmDialog
          title="Delete slide"
          message={
            <>
              Delete <strong>{toDelete.title}</strong>? It will be removed from every wallboard using it.
              This cannot be undone.
            </>
          }
          onConfirm={() => void doDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
