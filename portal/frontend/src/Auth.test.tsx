import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, ApiError } from './api/client';

const user = { subject: 'test', email: 'allowed@example.com', name: 'Researcher' };

beforeEach(() => {
  vi.spyOn(api, 'authStatus').mockResolvedValue({ provider: 'google', configured: true });
  vi.spyOn(api, 'me').mockRejectedValue(new ApiError(401));
});

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderApp(path = '/settings') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}

it('does not fetch protected settings before authentication and retains the intended route', async () => {
  const settings = vi.spyOn(api, 'settings');
  renderApp();
  expect(screen.getByText('Checking your session…')).toHaveAttribute('role', 'status');
  const signIn = await screen.findByRole('link', { name: 'Sign in with Google' });
  expect(signIn).toHaveAttribute('href', '/api/auth/google/login?next=%2Fsettings');
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/login?next=%2Fsettings');
  expect(settings).not.toHaveBeenCalled();
});

it('fails closed when Google or the email allowlist is not configured', async () => {
  vi.mocked(api.authStatus).mockResolvedValue({ provider: 'google', configured: false });
  renderApp();
  expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeDisabled();
  expect(screen.getByText(/Google sign-in is not set up yet/)).toBeInTheDocument();
  expect(api.me).not.toHaveBeenCalled();
});

it.each([
  ['access_denied', 'This account cannot access the workspace.'],
  ['sign_in_failed', 'Sign-in could not be completed.'],
])('shows actionable OAuth error %s', async (code, message) => {
  renderApp(`/login?error=${code}`);
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
});

it('allows retry after an offline session check', async () => {
  vi.mocked(api.authStatus).mockRejectedValueOnce(new Error('offline'));
  renderApp();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
});

it('signs out and removes protected content', async () => {
  vi.mocked(api.me).mockResolvedValueOnce(user).mockRejectedValue(new ApiError(401));
  vi.spyOn(api, 'logout').mockResolvedValue(undefined);
  renderApp('/history');
  expect(await screen.findByText(user.email)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument();
  expect(api.logout).toHaveBeenCalledTimes(1);
});

it('retains the session and offers recovery if logout fails', async () => {
  vi.mocked(api.me).mockResolvedValue(user);
  vi.spyOn(api, 'logout').mockRejectedValue(new Error('offline'));
  renderApp('/history');
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign out could not be completed');
  expect(screen.getByText(user.email)).toBeInTheDocument();
});

it('clears the protected screen after a session-expired event', async () => {
  vi.mocked(api.me).mockResolvedValueOnce(user).mockRejectedValue(new ApiError(401));
  renderApp('/history');
  await screen.findByText(user.email);
  act(() => window.dispatchEvent(new Event('portal:unauthorized')));
  expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
  expect(screen.getByText(/Your session has ended/)).toBeInTheDocument();
});

it('blocks duplicate logout while the request is pending', async () => {
  vi.mocked(api.me).mockResolvedValue(user);
  let resolveLogout!: () => void;
  vi.spyOn(api, 'logout').mockReturnValue(
    new Promise<void>((resolve) => {
      resolveLogout = resolve;
    }),
  );
  renderApp('/history');
  const button = await screen.findByRole('button', { name: 'Sign out' });
  await userEvent.dblClick(button);
  expect(api.logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  await act(async () => resolveLogout());
  await waitFor(() => expect(screen.getByText(user.email)).toBeInTheDocument());
});
