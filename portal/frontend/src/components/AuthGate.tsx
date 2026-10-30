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
    document.title = session.data?.user ? 'TradingAgents Portal' : 'Sign in · TradingAgents Portal';
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
        <p role="status">Checking your session…</p>
      </main>
    );
  if (session.error)
    return (
      <main className="login-shell">
        <div className="login-panel">
          <h1>Connect to your workspace</h1>
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
            TradingAgents<small>RESEARCH PORTAL</small>
          </span>
        </div>
        <h1 id="login-title">Your research workspace.</h1>
        <p>Sign in with your approved Google account to access TradingAgents Portal.</p>
        <div className="login-feedback" aria-live="polite">
          {!configured ? (
            <p className="notice">
              Google sign-in is not set up yet. Ask the workspace administrator to configure Google
              sign-in and approve your email address.
            </p>
          ) : error === 'access_denied' ? (
            <p className="notice" role="alert">
              This account cannot access the workspace. Choose an approved account or contact your
              administrator.
            </p>
          ) : error ? (
            <p className="notice" role="alert">
              Sign-in could not be completed. Try again to start a new Google sign-in.
            </p>
          ) : expired ? (
            <p className="notice" role="status">
              Your session has ended. Sign in again to continue.
            </p>
          ) : (
            <p className="login-hint">Access is limited to approved email addresses.</p>
          )}
        </div>
        {configured ? (
          <a className="button google-sign-in" href={authLoginUrl(next)}>
            <span aria-hidden="true">G</span>Sign in with Google
          </a>
        ) : (
          <button className="button google-sign-in" disabled>
            <span aria-hidden="true">G</span>Sign in with Google
          </button>
        )}
        <p className="login-footnote">Your Google password stays with Google.</p>
      </section>
    </main>
  );
}
