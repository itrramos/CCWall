import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../context';
import { Field } from '../components/ui';

export default function LoginPage() {
  const { user, needsSetup, ready, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && needsSetup) navigate('/setup', { replace: true });
    else if (ready && user) navigate('/', { replace: true });
  }, [ready, needsSetup, user, navigate]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/login', { usernameOrEmail, password, remember });
      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/') ? from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="error-page">
      <form className="card" style={{ width: 360 }} onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <span className="brand-logo" style={{ margin: '0 auto 10px', display: 'inline-grid', width: 46, height: 46 }}>
            CC
          </span>
          <h1 style={{ fontSize: 19 }}>CCWall</h1>
          <div className="brand-sub">Wallboard Portal</div>
        </div>
        <Field label="Username or email">
          <input
            className="input"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <label className="checkbox-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me
        </label>
        {error && <div className="field-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
