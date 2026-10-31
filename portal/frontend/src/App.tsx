import { NavLink, Route, Routes } from 'react-router-dom';
import { EmptyState } from './components/States';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { AuthGate } from './components/AuthGate';
import type { User } from './api/client';

const navigation = [
  { to: '/', label: 'Tổng quan', icon: '▦' },
  { to: '/analysis/new', label: 'Phân tích mới', icon: '+' },
  { to: '/history', label: 'Lịch sử', icon: '◷' },
  { to: '/settings', label: 'Cài đặt', icon: '⚙' },
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
        Bỏ qua đến nội dung
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="Trang chủ TradingAgents">
          <span className="brand-mark">
            ta<span>↗</span>
          </span>
          <span>
            TradingAgents<small>CỔNG NGHIÊN CỨU</small>
          </span>
        </NavLink>
        <p className="nav-label">KHÔNG GIAN LÀM VIỆC</p>
        <nav aria-label="Điều hướng chính">
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
            Không gian làm việc cục bộ<small>Giai đoạn khởi tạo Portal</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Không gian làm việc <span className="breadcrumb">/ Portal</span>
          </span>
          <div className="account-controls">
            <span className="phase-tag">
              {user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
            </span>
            <span className="account-email">{user.email}</span>
            <button
              className="button secondary logout-button"
              onClick={() => void logout()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
            </button>
          </div>
        </header>
        {logoutError && (
          <p role="alert" className="notice logout-error">
            Không thể đăng xuất. Hãy kiểm tra kết nối rồi thử lại.
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
                      <p className="eyebrow">KHÔNG GIAN NGHIÊN CỨU</p>
                      <h1>Phân tích mới</h1>
                      <p>Phân tích đa tác tử sẽ có trong giai đoạn tiếp theo.</p>
                    </div>
                  </div>
                  <section className="panel">
                    <EmptyState title="Chưa thể chạy phân tích trên Portal">
                      Dùng TradingAgents CLI hiện có để chạy phân tích. Quy trình chạy phân tích
                      trên Portal chưa được triển khai.
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
                      <p className="eyebrow">LƯU TRỮ NGHIÊN CỨU</p>
                      <h1>Lịch sử</h1>
                      <p>Nơi lưu các nghiên cứu của bạn.</p>
                    </div>
                  </div>
                  <section className="panel">
                    <EmptyState title="Lịch sử chưa được kết nối">
                      Báo cáo từ CLI vẫn nằm ở vị trí đã cấu hình. Tính năng nhập và xem báo cáo
                      trên Portal dự kiến có trong giai đoạn tiếp theo.
                    </EmptyState>
                  </section>
                </>
              }
            />
            <Route
              path="*"
              element={
                <EmptyState title="Không tìm thấy trang">Hãy chọn trang từ thanh điều hướng.</EmptyState>
              }
            />
          </Routes>
        </main>
        <footer className="main-footer">
          TradingAgents Portal<span>Vận hành trên TradingAgents của bạn</span>
        </footer>
      </div>
    </div>
  );
}
