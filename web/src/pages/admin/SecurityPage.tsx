import { useEffect, useState } from 'react';
import { api, ApiError, useApi } from '../../api';
import { useToast } from '../../context';
import { Field, Spinner, Toggle } from '../../components/ui';

interface SecuritySettings {
  sessionTimeoutMinutes: number;
  rememberMeDays: number;
  passwordMinLength: number;
  passwordRequireNumber: boolean;
  passwordRequireMixedCase: boolean;
  passwordRequireSymbol: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  allowedOrigins: string[];
  publicDisplayAccess: boolean;
  requireWallboardTokens: boolean;
  allowEmbeddedHtml: boolean;
}

export default function SecurityPage() {
  const toast = useToast();
  const { data, loading } = useApi<{ security: SecuritySettings }>('/api/settings');
  const [s, setS] = useState<SecuritySettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.security) setS(data.security);
  }, [data]);

  const save = async (): Promise<void> => {
    if (!s) return;
    setBusy(true);
    try {
      await api.put('/api/settings/security', s);
      toast('Security settings saved', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !s) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Security</h1>
          <div className="page-sub">Sessions, password policy and display access</div>
        </div>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Sessions</div>
            <div className="field-row">
              <Field label="Session timeout (minutes)">
                <input className="input" type="number" min={5} value={s.sessionTimeoutMinutes} onChange={(e) => setS({ ...s, sessionTimeoutMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="Remember-me duration (days)">
                <input className="input" type="number" min={1} value={s.rememberMeDays} onChange={(e) => setS({ ...s, rememberMeDays: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Password policy</div>
            <Field label="Minimum length">
              <input className="input" type="number" min={6} max={128} value={s.passwordMinLength} onChange={(e) => setS({ ...s, passwordMinLength: Number(e.target.value) })} />
            </Field>
            <Toggle label="Require a number" checked={s.passwordRequireNumber} onChange={(v) => setS({ ...s, passwordRequireNumber: v })} />
            <Toggle label="Require mixed case" checked={s.passwordRequireMixedCase} onChange={(v) => setS({ ...s, passwordRequireMixedCase: v })} />
            <Toggle label="Require a symbol" checked={s.passwordRequireSymbol} onChange={(v) => setS({ ...s, passwordRequireSymbol: v })} />
          </div>
          <div className="card">
            <div className="card-title">Login protection</div>
            <div className="field-row">
              <Field label="Max failed attempts">
                <input className="input" type="number" min={3} max={20} value={s.maxLoginAttempts} onChange={(e) => setS({ ...s, maxLoginAttempts: Number(e.target.value) })} />
              </Field>
              <Field label="Lockout duration (minutes)" hint="Doubles on repeated lockouts.">
                <input className="input" type="number" min={1} value={s.lockoutMinutes} onChange={(e) => setS({ ...s, lockoutMinutes: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
        </div>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Display access</div>
            <Toggle
              label="Allow public display access"
              checked={s.publicDisplayAccess}
              onChange={(v) => setS({ ...s, publicDisplayAccess: v })}
              hint="When off, displays require a logged-in browser session."
            />
            <Toggle
              label="Require tokens for all wallboards"
              checked={s.requireWallboardTokens}
              onChange={(v) => setS({ ...s, requireWallboardTokens: v })}
              hint='Treats "public" wallboards as token-protected.'
            />
            <Toggle
              label="Allow embedded HTML slides"
              checked={s.allowEmbeddedHtml}
              onChange={(v) => setS({ ...s, allowEmbeddedHtml: v })}
              hint="Admin-only slide type, rendered in a script-less sandbox. Disable to hide it entirely."
            />
          </div>
          <div className="card">
            <div className="card-title">Origins & proxy</div>
            <Field
              label="Additional allowed origins"
              hint="One origin per line (e.g. https://portal.example.com). Used for cross-origin admin access behind proxies."
            >
              <textarea
                className="textarea"
                rows={3}
                value={s.allowedOrigins.join('\n')}
                onChange={(e) => setS({ ...s, allowedOrigins: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
              />
            </Field>
            <p className="field-hint">
              Trusted proxy hops are configured with the <code>TRUST_PROXY</code> environment variable —
              see Settings → System for the current value.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
