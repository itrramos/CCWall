import { Component, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import SlidesPage from './pages/SlidesPage';
import SlideEditorPage from './pages/SlideEditorPage';
import WallboardsPage from './pages/WallboardsPage';
import WallboardEditorPage from './pages/WallboardEditorPage';
import MediaPage from './pages/MediaPage';
import SettingsPage from './pages/SettingsPage';
import AccountPage from './pages/AccountPage';
import UsersPage from './pages/admin/UsersPage';
import SecurityPage from './pages/admin/SecurityPage';
import StoragePage from './pages/admin/StoragePage';
import BackupPage from './pages/admin/BackupPage';
import SystemPage from './pages/admin/SystemPage';
import AuditPage from './pages/admin/AuditPage';
import DisplayPage from './player/DisplayPage';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-page">
          <div>
            <div className="error-code">500</div>
            <h1>Something went wrong</h1>
            <p style={{ color: 'var(--text-muted)' }}>
              An unexpected error occurred in the interface.
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <div className="error-page">
      <div>
        <div className="error-code">404</div>
        <h1>Page not found</h1>
        <p style={{ color: 'var(--text-muted)' }}>The page you were looking for does not exist.</p>
        <a className="btn btn-primary" href="/">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}

function Protected({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, needsSetup, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="error-page">
        <Spinner />
      </div>
    );
  }
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && user.role !== 'admin') return <NotFound />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/display/:slug" element={<DisplayPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/slides" element={<Protected><SlidesPage /></Protected>} />
        <Route path="/slides/new" element={<Protected><SlideEditorPage /></Protected>} />
        <Route path="/slides/:id" element={<Protected><SlideEditorPage /></Protected>} />
        <Route path="/wallboards" element={<Protected><WallboardsPage /></Protected>} />
        <Route path="/wallboards/new" element={<Protected><WallboardEditorPage /></Protected>} />
        <Route path="/wallboards/:id" element={<Protected><WallboardEditorPage /></Protected>} />
        <Route path="/media" element={<Protected><MediaPage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="/account" element={<Protected><AccountPage /></Protected>} />
        <Route path="/admin/general" element={<Protected adminOnly><SettingsPage adminGeneral /></Protected>} />
        <Route path="/admin/users" element={<Protected adminOnly><UsersPage /></Protected>} />
        <Route path="/admin/security" element={<Protected adminOnly><SecurityPage /></Protected>} />
        <Route path="/admin/storage" element={<Protected adminOnly><StoragePage /></Protected>} />
        <Route path="/admin/backup" element={<Protected adminOnly><BackupPage /></Protected>} />
        <Route path="/admin/system" element={<Protected adminOnly><SystemPage /></Protected>} />
        <Route path="/admin/audit" element={<Protected adminOnly><AuditPage /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
