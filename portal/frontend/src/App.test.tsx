import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, type Capabilities } from './api/client';

beforeEach(() => {
  vi.spyOn(api, 'authStatus').mockResolvedValue({ provider: 'google', configured: true });
  vi.spyOn(api, 'me').mockResolvedValue({
    subject: 'test',
    email: 'test@example.com',
    name: 'Researcher',
  });
});

const capabilities: Capabilities = {
  providers: [],
  analysts: [],
  configurable_settings: [],
  output_languages: {
    mode: 'free_text',
    suggestions: [],
    description: 'Custom language supported',
  },
  runtime: { analysis_execution: false, history: false, settings_write: false },
};

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

it('renders the application and real API status with an honest empty state', async () => {
  vi.spyOn(api, 'health').mockResolvedValue({
    status: 'ok',
    backend: 'available',
    core: 'available',
  });
  vi.spyOn(api, 'version').mockResolvedValue({ portal: '0.1.0', core: '0.7.1' });
  renderApp();
  expect(await screen.findByRole('heading', { name: 'TradingAgents Portal' })).toBeInTheDocument();
  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.getByText('Available')).toBeInTheDocument();
  expect(screen.getByText('v0.7.1')).toBeInTheDocument();
  expect(screen.getByText('Your research starts here')).toBeInTheDocument();
});

it('shows API failure and recovers after retry', async () => {
  const health = vi
    .spyOn(api, 'health')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ status: 'ok', backend: 'available', core: 'available' });
  vi.spyOn(api, 'version').mockResolvedValue({ portal: '0.1.0', core: '0.7.1' });
  renderApp();
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load Portal data');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(health).toHaveBeenCalledTimes(2);
});

it('keeps backend connected when the core health check fails', async () => {
  vi.spyOn(api, 'health').mockResolvedValue({
    status: 'degraded',
    backend: 'available',
    core: 'unavailable',
  });
  vi.spyOn(api, 'version').mockResolvedValue({ portal: '0.1.0', core: '0.7.1' });
  renderApp();
  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
});

it('renders empty settings without crashing', async () => {
  vi.spyOn(api, 'settings').mockResolvedValue({
    source: 'core_defaults_and_environment',
    read_only: true,
    values: {},
  });
  vi.spyOn(api, 'capabilities').mockResolvedValue(capabilities);
  renderApp('/settings');
  expect(await screen.findByText('No settings available')).toBeInTheDocument();
  expect(screen.getByText('No providers returned.')).toBeInTheDocument();
});

it('shows settings and provider options returned by the backend', async () => {
  vi.spyOn(api, 'settings').mockResolvedValue({
    source: 'core_defaults_and_environment',
    read_only: true,
    values: { output_language: 'Vietnamese' },
  });
  vi.spyOn(api, 'capabilities').mockResolvedValue({
    ...capabilities,
    providers: [
      {
        id: 'backend-provider',
        models: { quick: [{ id: 'backend-model', label: 'Backend model' }] },
        allows_custom_model: true,
      },
    ],
  });
  renderApp('/settings');
  expect(await screen.findByText('Vietnamese')).toBeInTheDocument();
  await userEvent.click(screen.getByText('backend-provider'));
  expect(screen.getByText('Backend model')).toBeInTheDocument();
});

it('shows settings API errors without crashing', async () => {
  vi.spyOn(api, 'settings').mockRejectedValue(new Error('offline'));
  vi.spyOn(api, 'capabilities').mockResolvedValue(capabilities);
  renderApp('/settings');
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

it.each(['/analysis/new', '/history'])('renders the skeleton route %s', async (path) => {
  renderApp(path);
  expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(screen.getByText(/not connected/)).toBeInTheDocument();
});
