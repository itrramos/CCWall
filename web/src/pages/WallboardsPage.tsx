import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatDate, useApi, type Paged, type Wallboard } from '../api';
import { useAuth, useToast } from '../context';
import { ConfirmDialog, EmptyState, Pagination, Spinner } from '../components/ui';
import { IconCopy, IconEdit, IconExternal, IconPlus, IconTrash } from '../components/Icons';

export default function WallboardsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [toDelete, setToDelete] = useState<Wallboard | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (q) p.set('q', q);
    return `/api/wallboards?${p}`;
  }, [page, q]);
  const { data, loading, reload } = useApi<Paged<Wallboard>>(query);

  const copyUrl = (w: Wallboard): void => {
    const url = `${window.location.origin}/display/${w.slug}${w.access === 'token' && w.accessToken ? `?token=${w.accessToken}` : ''}`;
    void navigator.clipboard.writeText(url).then(
      () => toast('Display URL copied', 'success'),
      () => toast(url, 'info')
    );
  };

  const toggle = async (w: Wallboard): Promise<void> => {
    await api.patch(`/api/wallboards/${w.id}`, { enabled: !w.enabled });
    toast(`Wallboard ${w.enabled ? 'disabled' : 'enabled'}`, 'success');
    reload();
  };

  const duplicate = async (w: Wallboard): Promise<void> => {
    const copy = await api.post<Wallboard>(`/api/wallboards/${w.id}/duplicate`);
    toast('Wallboard duplicated', 'success');
    navigate(`/wallboards/${copy.id}`);
  };

  const doDelete = async (): Promise<void> => {
    if (!toDelete) return;
    await api.del(`/api/wallboards/${toDelete.id}`);
    setToDelete(null);
    toast('Wallboard deleted', 'success');
    reload();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wallboards</h1>
          <div className="page-sub">Playlists of slides shown on your displays</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => navigate('/wallboards/new')}>
            <IconPlus size={15} /> Create Wallboard
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search wallboards…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search wallboards"
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading && !data && <Spinner />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon="📺"
            title="No wallboards found"
            hint="A wallboard is a playlist of slides shown on a display."
            action={
              canEdit ? (
                <Link className="btn btn-primary" to="/wallboards/new">
                  Create Wallboard
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
                  <th>Name</th>
                  <th>Display URL</th>
                  <th>Slides</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th style={{ width: 190 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link to={`/wallboards/${w.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {w.name}
                      </Link>
                      {w.description && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{w.description}</div>
                      )}
                    </td>
                    <td>
                      <code style={{ fontSize: 12 }}>/display/{w.slug}</code>
                    </td>
                    <td>{w.slideCount ?? 0}</td>
                    <td>
                      <span className={`badge badge-${w.access === 'public' ? 'muted' : 'violet'}`}>{w.access}</span>
                    </td>
                    <td>
                      {canEdit ? (
                        <button
                          className={`badge badge-${w.enabled ? 'success' : 'muted'}`}
                          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => void toggle(w)}
                          aria-label={`${w.enabled ? 'Disable' : 'Enable'} ${w.name}`}
                        >
                          {w.enabled ? 'enabled' : 'disabled'}
                        </button>
                      ) : (
                        <span className={`badge badge-${w.enabled ? 'success' : 'muted'}`}>
                          {w.enabled ? 'enabled' : 'disabled'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(w.updatedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <a
                          className="btn btn-ghost btn-icon"
                          href={`/display/${w.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${w.name} live`}
                        >
                          <IconExternal size={15} />
                        </a>
                        <button className="btn btn-ghost btn-icon" onClick={() => copyUrl(w)} aria-label={`Copy display URL for ${w.name}`}>
                          <IconCopy size={15} />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={() => navigate(`/wallboards/${w.id}`)}
                              aria-label={`Edit ${w.name}`}
                            >
                              <IconEdit size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon" onClick={() => void duplicate(w)} aria-label={`Duplicate ${w.name}`}>
                              <IconCopy size={15} />
                            </button>
                            <button
                              className="btn btn-ghost btn-icon"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => setToDelete(w)}
                              aria-label={`Delete ${w.name}`}
                            >
                              <IconTrash size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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
          title="Delete wallboard"
          message={
            <>
              Delete <strong>{toDelete.name}</strong>? Displays using it will stop working. Slides
              themselves are not deleted.
            </>
          }
          onConfirm={() => void doDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
