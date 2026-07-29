import { useMemo, useState } from 'react';
import { formatDate, useApi, type Paged } from '../../api';
import { EmptyState, Pagination, Spinner } from '../../components/ui';

interface AuditEntry {
  id: number;
  ts: string;
  username: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null;
  ip: string | null;
}

const ACTION_GROUPS = ['', 'auth', 'user', 'slide', 'wallboard', 'settings', 'media', 'backup', 'setup'];

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (q) p.set('q', q);
    if (action) p.set('action', action);
    return `/api/audit?${p}`;
  }, [page, q, action]);
  const { data, loading } = useApi<Paged<AuditEntry>>(query);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <div className="page-sub">Administrative and security events</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search user or action…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search audit logs"
        />
        <select
          className="select"
          style={{ maxWidth: 170 }}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
        >
          {ACTION_GROUPS.map((a) => (
            <option key={a} value={a}>
              {a || 'All categories'}
            </option>
          ))}
        </select>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {loading && !data && <Spinner />}
        {data && data.items.length === 0 && <EmptyState icon="📋" title="No audit entries" />}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(e.ts)}</td>
                    <td>{e.username ?? '—'}</td>
                    <td>
                      <span className="badge badge-primary">{e.action}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {e.resource_type ?? ''}
                      {e.resource_id ? ` · ${e.resource_id.slice(0, 8)}…` : ''}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.details ?? ''}
                    </td>
                    <td style={{ fontSize: 12 }}>{e.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
