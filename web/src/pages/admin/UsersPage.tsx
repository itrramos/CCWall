import { useState } from 'react';
import { api, ApiError, formatDate, useApi, type User } from '../../api';
import { useAuth, useToast } from '../../context';
import { ConfirmDialog, Field, Modal, Spinner } from '../../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../../components/Icons';

interface AdminUser extends User {
  disabled: boolean;
  createdAt: string;
}

interface UserForm {
  username: string;
  email: string;
  displayName: string;
  password: string;
  role: 'admin' | 'editor' | 'viewer';
  disabled: boolean;
}

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { data, loading, reload } = useApi<{ items: AdminUser[] }>('/api/users');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);

  const doDelete = async (): Promise<void> => {
    if (!toDelete) return;
    try {
      await api.del(`/api/users/${toDelete.id}`);
      toast('User deleted', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
    setToDelete(null);
    reload();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <div className="page-sub">Administrators, editors and viewers</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <IconPlus size={15} /> Add user
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {loading && !data && <Spinner />}
        {data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar">{(u.displayName || u.username).slice(0, 2).toUpperCase()}</span>
                        <span>
                          <div style={{ fontWeight: 600 }}>{u.username}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{u.displayName}</div>
                        </span>
                      </div>
                    </td>
                    <td>{u.email ?? '—'}</td>
                    <td>
                      <span className={`badge badge-${u.role === 'admin' ? 'primary' : u.role === 'editor' ? 'violet' : 'muted'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${u.disabled ? 'danger' : 'success'}`}>
                        {u.disabled ? 'disabled' : 'active'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(u.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => setEditing(u)} aria-label={`Edit ${u.username}`}>
                          <IconEdit size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => setToDelete(u)}
                          disabled={u.id === me?.id}
                          aria-label={`Delete ${u.username}`}
                        >
                          <IconTrash size={15} />
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
      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onDone={() => {
            setEditing(null);
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete user"
          message={
            <>
              Delete <strong>{toDelete.username}</strong>? Their sessions end immediately. This cannot be undone.
            </>
          }
          onConfirm={() => void doDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}

function UserModal({
  user,
  isSelf,
  onDone,
  onClose
}: {
  user: AdminUser | null;
  isSelf: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<UserForm>({
    username: user?.username ?? '',
    email: user?.email ?? '',
    displayName: user?.displayName ?? '',
    password: '',
    role: user?.role ?? 'viewer',
    disabled: user?.disabled ?? false
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (!user) {
        await api.post('/api/users', {
          username: form.username,
          email: form.email || null,
          displayName: form.displayName,
          password: form.password,
          role: form.role
        });
        toast('User created', 'success');
      } else {
        const patch: Record<string, unknown> = {
          email: form.email || null,
          displayName: form.displayName
        };
        if (!isSelf) {
          patch.role = form.role;
          patch.disabled = form.disabled;
        }
        if (form.password) patch.password = form.password;
        await api.patch(`/api/users/${user.id}`, patch);
        toast('User updated', 'success');
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={user ? `Edit ${user.username}` : 'Add user'} onClose={onClose}>
      {!user && (
        <Field label="Username">
          <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
        </Field>
      )}
      <Field label="Email">
        <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Display name">
        <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </Field>
      <Field label={user ? 'New password (leave empty to keep)' : 'Password'} hint="Setting a password signs the user out everywhere.">
        <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <Field label="Role" hint="Admin: full access · Editor: content only · Viewer: read-only.">
        <select
          className="select"
          value={form.role}
          disabled={isSelf}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserForm['role'] })}
        >
          <option value="admin">Administrator</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </Field>
      {user && !isSelf && (
        <label className="checkbox-row">
          <input type="checkbox" checked={form.disabled} onChange={(e) => setForm({ ...form, disabled: e.target.checked })} />
          Account disabled
        </label>
      )}
      {error && <div className="field-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || (!user && (!form.username || !form.password))}>
          {busy ? 'Saving…' : 'Save user'}
        </button>
      </div>
    </Modal>
  );
}
