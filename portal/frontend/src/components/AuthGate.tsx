import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError, authLoginUrl, type User } from '../api/client';
import { useResource } from '../api/use-resource';
import { ErrorState } from './States';

const loadSession = async (signal: AbortSignal) => {
  const status = await api.authStatus(signal);
  if (!status.configured) return { status, user: null };
  try {
    return { status, user: await api.me(signal) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { status, user: null };
    throw error;
  }
};

const routes = new Set(['/', '/settings', '/history', '/analysis/new']);

export function AuthGate({
  children,
}: {
  children: (user: User, logout: () => Promise<void>, busy: boolean, error: boolean) => ReactNode;
}) {
  const session = useResource(loadSession);
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [expired, setExpired] = useState(false);
  const logoutPending = useRef(false);
  const params = new URLSearchParams(location.search);
  const next = routes.has(location.pathname) ? location.pathname : params.get('next') || '/';
  const { retry } = session;

  useEffect(() => {
    const invalidate = () => {
      setExpired(true);
      retry();
    };
    window.addEventListener('portal:unauthorized', invalidate);
    window.addEventListener('focus', retry);
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('portal-auth') : null;
    if (channel) channel.onmessage = invalidate;
    return () => {
      window.removeEventListener('portal:unauthorized', invalidate);
      window.removeEventListener('focus', retry);
      channel?.close();
    };
  }, [retry]);

  useEffect(() => {
    document.title = session.data?.user ? 'TradingAgents Portal' : 'Đăng nhập · TradingAgents Portal';
  }, [session.data?.user]);

  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await api.logout();
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('portal-auth');
        channel.postMessage('signed-out');
        channel.close();
      }
      setExpired(false);
      retry();
    } catch {
      setLogoutError(true);
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }

  if (session.loading)
    return (
      <main className="login-shell">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  if (session.error)
    return (
      <main className="login-shell">
        <div className="login-panel">
          <h1>Kết nối với không gian làm việc</h1>
          <ErrorState retry={retry} />
        </div>
      </main>
    );
  if (session.data?.user) {
    if (location.pathname === '/login')
      return <Navigate to={routes.has(next) ? next : '/'} replace />;
    return children(session.data.user, logout, loggingOut, logoutError);
  }
  if (location.pathname !== '/login')
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  const error = params.get('error');
  const configured = session.data?.status.configured;
  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            ta<span>↗</span>
          </span>
          <span>
            TradingAgents<small>CỔNG NGHIÊN CỨU</small>
          </span>
        </div>
        <h1 id="login-title">Không gian nghiên cứu của bạn.</h1>
        <p>Đăng nhập bằng tài khoản Google được duyệt để truy cập TradingAgents Portal.</p>
        <div className="login-feedback" aria-live="polite">
          {!configured ? (
            <p className="notice">
              Google chưa được cấu hình. Hãy liên hệ quản trị viên để thiết lập đăng nhập và duyệt
              địa chỉ email của bạn.
            </p>
          ) : error === 'access_denied' ? (
            <p className="notice" role="alert">
              Tài khoản này chưa được phép truy cập. Hãy chọn tài khoản đã được duyệt hoặc liên hệ
              quản trị viên.
            </p>
          ) : error ? (
            <p className="notice" role="alert">
              Không thể hoàn tất đăng nhập. Hãy thử lại để bắt đầu lượt đăng nhập Google mới.
            </p>
          ) : expired ? (
            <p className="notice" role="status">
              Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại để tiếp tục.
            </p>
          ) : (
            <p className="login-hint">Chỉ email đã được duyệt mới có thể truy cập.</p>
          )}
        </div>
        {configured ? (
          <a className="button google-sign-in" href={authLoginUrl(next)}>
            <span aria-hidden="true">G</span>Đăng nhập bằng Google
          </a>
        ) : (
          <button className="button google-sign-in" disabled>
            <span aria-hidden="true">G</span>Đăng nhập bằng Google
          </button>
        )}
        <p className="login-footnote">Mật khẩu Google của bạn vẫn được bảo vệ bởi Google.</p>
      </section>
    </main>
  );
}
