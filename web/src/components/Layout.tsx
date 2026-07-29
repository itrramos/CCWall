import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { useAuth, useTheme, useToast } from '../context';
import {
  IconAudit,
  IconBackup,
  IconBell,
  IconDashboard,
  IconKey,
  IconLogout,
  IconMedia,
  IconMenu,
  IconMoon,
  IconSearch,
  IconSettings,
  IconShield,
  IconSlides,
  IconStorage,
  IconSun,
  IconSystem,
  IconUsers,
  IconWallboards,
  IconX
} from './Icons';

interface SearchResults {
  slides: { id: string; title: string; type: string }[];
  wallboards: { id: string; name: string; slug: string }[];
  media: { id: string; name: string; kind: string }[];
  users: { id: string; username: string; role: string }[];
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<SearchResults>(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults(null));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (path: string): void => {
    setOpen(false);
    setQ('');
    navigate(path);
  };

  const hasAny =
    results &&
    (results.slides.length || results.wallboards.length || results.media.length || results.users.length);

  return (
    <div className="searchbox" ref={boxRef}>
      <span className="searchbox-icon">
        <IconSearch size={15} />
      </span>
      <input
        className="input"
        placeholder="Search slides, wallboards, media…"
        value={q}
        aria-label="Global search"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
      />
      {open && results && (
        <div className="search-results">
          {!hasAny && <div className="empty" style={{ padding: 16 }}>No results</div>}
          {results.wallboards.length > 0 && <div className="search-group">Wallboards</div>}
          {results.wallboards.map((w) => (
            <button key={w.id} className="search-item" onClick={() => go(`/wallboards/${w.id}`)}>
              {w.name} <span style={{ color: 'var(--text-faint)' }}>/{w.slug}</span>
            </button>
          ))}
          {results.slides.length > 0 && <div className="search-group">Slides</div>}
          {results.slides.map((s) => (
            <button key={s.id} className="search-item" onClick={() => go(`/slides/${s.id}`)}>
              {s.title} <span style={{ color: 'var(--text-faint)' }}>{s.type}</span>
            </button>
          ))}
          {results.media.length > 0 && <div className="search-group">Media</div>}
          {results.media.map((m) => (
            <button key={m.id} className="search-item" onClick={() => go('/media')}>
              {m.name}
            </button>
          ))}
          {results.users.length > 0 && <div className="search-group">Users</div>}
          {results.users.map((u) => (
            <button key={u.id} className="search-item" onClick={() => go('/admin/users')}>
              {u.username} <span style={{ color: 'var(--text-faint)' }}>{u.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{
    items: { id: number; ts: string; level: string; title: string; body: string; read: boolean }[];
    derived: { level: string; title: string; body: string }[];
    unread: number;
  }>('/api/notifications');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const all = [
    ...(data?.derived ?? []).map((d, i) => ({ ...d, id: -i - 1, read: false })),
    ...(data?.items ?? [])
  ];
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="icon-btn"
        aria-label={`Notifications${data?.unread ? ` (${data.unread} unread)` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <IconBell />
        {(data?.unread ?? 0) > 0 && <span className="dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="menu" style={{ minWidth: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px' }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {all.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void api.post('/api/notifications/mark-read').then(reload);
                }}
              >
                Mark read
              </button>
            )}
          </div>
          <div className="menu-sep" />
          {all.length === 0 && <div className="empty" style={{ padding: 14 }}>All clear</div>}
          {all.slice(0, 10).map((n) => (
            <div key={n.id} className="menu-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <span
                className={`badge badge-${n.level === 'error' ? 'danger' : n.level === 'warning' ? 'warning' : 'primary'}`}
                style={{ marginTop: 2 }}
              >
                {n.level}
              </span>
              <span>
                <div style={{ fontWeight: 600 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{n.body}</div>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  if (!user) return null;
  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase();
  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="icon-btn"
        style={{ width: 'auto', gap: 8, padding: '0 6px' }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <span className="avatar">{initials}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user.username}</span>
      </button>
      {open && (
        <div className="menu">
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontWeight: 700 }}>{user.displayName || user.username}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.role}</div>
          </div>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/account');
            }}
          >
            <IconKey size={15} /> Account & password
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              void logout().then(() => {
                toast('Signed out', 'success');
                navigate('/login');
              });
            }}
          >
            <IconLogout size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);

  const isAdmin = user?.role === 'admin';

  return (
    <div className="shell">
      <div
        className={`sidebar-backdrop${navOpen ? ' show' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar${navOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            CC
          </span>
          <span>
            <div className="brand-name">CCWall</div>
            <div className="brand-sub">Wallboard Portal</div>
          </span>
          <button
            className="icon-btn hamburger"
            style={{ marginLeft: 'auto' }}
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <IconX />
          </button>
        </div>
        <div className="nav-section">Main</div>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            <IconDashboard /> Dashboard
          </NavLink>
          <NavLink to="/slides" className="nav-link">
            <IconSlides /> Slides
          </NavLink>
          <NavLink to="/wallboards" className="nav-link">
            <IconWallboards /> Wallboards
          </NavLink>
          <NavLink to="/media" className="nav-link">
            <IconMedia /> Media Library
          </NavLink>
          <NavLink to="/settings" className="nav-link">
            <IconSettings /> Settings
          </NavLink>
        </nav>
        {isAdmin && (
          <>
            <div className="nav-section">Administration</div>
            <nav className="nav">
              <NavLink to="/admin/general" className="nav-link">
                <IconSettings /> General
              </NavLink>
              <NavLink to="/admin/users" className="nav-link">
                <IconUsers /> Users
              </NavLink>
              <NavLink to="/admin/security" className="nav-link">
                <IconShield /> Security
              </NavLink>
              <NavLink to="/admin/storage" className="nav-link">
                <IconStorage /> Storage
              </NavLink>
              <NavLink to="/admin/backup" className="nav-link">
                <IconBackup /> Backup & Restore
              </NavLink>
              <NavLink to="/admin/system" className="nav-link">
                <IconSystem /> System
              </NavLink>
              <NavLink to="/admin/audit" className="nav-link">
                <IconAudit /> Audit Logs
              </NavLink>
            </nav>
          </>
        )}
        <div className="sidebar-footer">
          <span className="avatar">{(user?.displayName || user?.username || '?').slice(0, 2).toUpperCase()}</span>
          <span>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {user?.role}
            </div>
          </span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <IconMenu />
          </button>
          <GlobalSearch />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
