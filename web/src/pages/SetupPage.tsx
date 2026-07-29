import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../context';
import { Field } from '../components/ui';

export default function SetupPage() {
  const { needsSetup, ready, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', displayName: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !needsSetup) navigate('/login', { replace: true });
  }, [ready, needsSetup, navigate]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/setup', {
        username: form.username,
        email: form.email || undefined,
        displayName: form.displayName,
        password: form.password
      });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="error-page">
      <form className="card" style={{ width: 400 }} onSubmit={submit}>
        <h1 style={{ fontSize: 19, marginBottom: 4 }}>Welcome to CCWall</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          Create the first administrator account to get started.
        </p>
        <Field label="Username">
          <input
            className="input"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoComplete="username"
            required
            minLength={3}
            autoFocus
          />
        </Field>
        <Field label="Email (optional)">
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoComplete="email"
          />
        </Field>
        <Field label="Display name (optional)">
          <input
            className="input"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </Field>
        <Field label="Password" hint="At least 10 characters with a number and mixed case.">
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirm password">
          <input
            className="input"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            autoComplete="new-password"
            required
          />
        </Field>
        {error && <div className="field-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Creating…' : 'Create administrator'}
        </button>
      </form>
    </div>
  );
}
