import { NavLink, Route, Routes } from 'react-router-dom';
import {
  CalendarClock,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react';
import { EmptyState } from './components/States';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { AuthGate } from './components/AuthGate';
import type { User } from './api/client';
import { Analysis, AnalysisHistory } from './pages/Analysis';
import { Scans } from './pages/Scans';

const navigation = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/analysis/new', label: 'Phân tích mới', icon: Plus },
  { to: '/history', label: 'Lịch sử', icon: History },
  { to: '/scans', label: 'Lịch tự động', icon: CalendarClock },
  { to: '/settings', label: 'Cài đặt', icon: SettingsIcon },
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
  const initial = (user.name || user.email).trim().charAt(0).toLocaleUpperCase();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Bỏ qua đến nội dung
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="Trang chủ TradingAgents">
          <span className="brand-mark" aria-hidden="true">
            TA
          </span>
          <span className="brand-name">TradingAgents</span>
        </NavLink>
        <nav className="nav" aria-label="Điều hướng chính">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <item.icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="account-text">
            <span className="account-email" title={user.email}>
              {user.email}
            </span>
            <small>{user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</small>
          </div>
          <button
            className="icon-button"
            onClick={() => void logout()}
            disabled={busy}
            aria-busy={busy}
            aria-label={busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
            title="Đăng xuất"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        {logoutError && (
          <p role="alert" className="notice error logout-error">
            Không thể đăng xuất. Hãy kiểm tra kết nối rồi thử lại.
          </p>
        )}
        <main id="main" className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/analysis/new" element={<Analysis />} />
            <Route path="/history" element={<AnalysisHistory />} />
            <Route path="/scans" element={<Scans />} />
            <Route
              path="*"
              element={
                <EmptyState title="Không tìm thấy trang">
                  Hãy chọn trang từ thanh điều hướng.
                </EmptyState>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
