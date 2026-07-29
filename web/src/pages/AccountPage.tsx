import { useState } from 'react';
import { api, ApiError, formatDate, useApi } from '../api';
import { useAuth, useToast } from '../context';
import { Field, Spinner } from '../components/ui';

interface SessionInfo {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  ip: string | null;
  user_agent: string | null;
  remember: number;
}

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useApi<{ sessions: SessionInfo[] }>('/api/auth/me');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const changePassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed. Other sessions were signed out.', 'success');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Change failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account</h1>
          <div className="page-sub">
            Signed in as <strong>{user?.username}</strong> ({user?.role})
          </div>
        </div>
      </div>
      <div className="grid grid-2">
        <form className="card" onSubmit={changePassword}>
          <div className="card-title">Change password</div>
          <Field label="Current password">
            <input
              className="input"
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password">
            <input
              className="input"
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          {error && <div className="field-error" role="alert">{error}</div>}
          <button className="btn btn-primary" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
        <div className="card">
          <div className="card-title">
            Active sessions
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                void api.post('/api/auth/logout-all').then(async () => {
                  toast('Signed out everywhere', 'success');
                  await refresh();
                });
              }}
            >
              Sign out all sessions
            </button>
          </div>
          {loading && <Spinner />}
          {data?.sessions.map((s) => (
            <div key={s.id} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.user_agent || 'Unknown device'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {s.ip ?? '—'} · last seen {formatDate(s.last_seen_at)}
                </div>
              </div>
              {s.remember === 1 && <span className="badge badge-muted">remembered</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
