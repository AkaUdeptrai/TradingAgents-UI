import { NavLink, Route, Routes } from 'react-router-dom';
import { EmptyState } from './components/States';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { AuthGate } from './components/AuthGate';
import type { User } from './api/client';

const navigation = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/analysis/new', label: 'New Analysis', icon: '+' },
  { to: '/history', label: 'History', icon: '◷' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function App() {
  return (
    <AuthGate>
      {(user, logout, busy, error) => (
        <Workspace user={user} logout={logout} busy={busy} logoutError={error} />
      )}
    </AuthGate>
  );
}

function Workspace({
  user,
  logout,
  busy,
  logoutError,
}: {
  user: User;
  logout: () => Promise<void>;
  busy: boolean;
  logoutError: boolean;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="TradingAgents home">
          <span className="brand-mark">
            ta<span>↗</span>
          </span>
          <span>
            TradingAgents<small>RESEARCH PORTAL</small>
          </span>
        </NavLink>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="workspace-avatar">TA</span>
          <div>
            Local workspace<small>Portal initialization</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/ Portal</span>
          </span>
          <div className="account-controls">
            <span className="account-email">{user.email}</span>
            <button
              className="button secondary logout-button"
              onClick={() => void logout()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>
        {logoutError && (
          <p role="alert" className="notice logout-error">
            Sign out could not be completed. Check your connection and try Sign out again.
          </p>
        )}
        <main id="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="/analysis/new"
              element={
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">RESEARCH WORKSPACE</p>
                      <h1>New Analysis</h1>
                      <p>Multi-agent analysis will be available in a future phase.</p>
                    </div>
                  </div>
                  <section className="panel">
                    <EmptyState title="Analysis execution is not connected">
                      Use the existing TradingAgents CLI to run an analysis. The Portal execution
                      workflow has not been implemented yet.
                    </EmptyState>
                  </section>
                </>
              }
            />
            <Route
              path="/history"
              element={
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">RESEARCH ARCHIVE</p>
                      <h1>History</h1>
                      <p>A home for your saved research.</p>
                    </div>
                  </div>
                  <section className="panel">
                    <EmptyState title="History is not connected">
                      Existing CLI reports remain in their configured location. Importing and
                      browsing them in the Portal is planned for a future phase.
                    </EmptyState>
                  </section>
                </>
              }
            />
            <Route
              path="*"
              element={
                <EmptyState title="Page not found">Choose a page from the sidebar.</EmptyState>
              }
            />
          </Routes>
        </main>
        <footer className="main-footer">
          TradingAgents Portal<span>Built on your TradingAgents runtime</span>
        </footer>
      </div>
    </div>
  );
}
