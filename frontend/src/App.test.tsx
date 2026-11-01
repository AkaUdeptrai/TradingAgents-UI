import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { api, type Capabilities } from './api/client';

beforeEach(() => {
  vi.spyOn(api, 'authStatus').mockResolvedValue({ provider: 'google', configured: true });
  vi.spyOn(api, 'me').mockResolvedValue({
    subject: 'test',
    email: 'test@example.com',
    name: 'Researcher',
    role: 'user',
  });
  vi.spyOn(api, 'capabilities').mockResolvedValue({
    providers: [],
    analysts: [],
    configurable_settings: [],
    output_languages: {
      mode: 'free_text',
      suggestions: [],
      description: 'Custom language supported',
    },
    runtime: { analysis_execution: true, history: true, settings_write: false },
    current_trade_date: '2026-10-31',
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
  runtime: { analysis_execution: true, history: true, settings_write: false },
  current_trade_date: '2026-10-31',
};

function renderApp(path = '/') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('renders the application and real API status with an honest empty state', async () => {
  vi.spyOn(api, 'health').mockResolvedValue({
    status: 'ok',
    application: 'available',
    core: 'available',
  });
  vi.spyOn(api, 'version').mockResolvedValue({ ui: '0.1.0', core: '0.7.1' });
  vi.spyOn(api, 'analyses').mockResolvedValue([]);
  renderApp();
  expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
  expect(await screen.findByText('Đã kết nối')).toBeInTheDocument();
  expect(screen.getByText('Khả dụng')).toBeInTheDocument();
  expect(screen.getByText('v0.7.1')).toBeInTheDocument();
  expect(await screen.findByText(/Chưa có phân tích nào/)).toBeInTheDocument();
});

it('lists recent analyses on the dashboard', async () => {
  vi.spyOn(api, 'health').mockResolvedValue({
    status: 'ok',
    application: 'available',
    core: 'available',
  });
  vi.spyOn(api, 'version').mockResolvedValue({ ui: '0.1.0', core: '0.7.1' });
  vi.spyOn(api, 'analyses').mockResolvedValue([
    {
      id: 'done',
      ticker: 'NVDA',
      trade_date: '2026-10-30',
      asset_type: 'stock',
      analysts: ['market'],
      status: 'completed',
      progress: null,
      error: null,
      result: { final_rating: 'Buy', final_trade_decision: 'Mua.', reports: {} },
      created_at: '2026-10-30T10:00:00Z',
      updated_at: '2026-10-30T10:05:00Z',
    },
  ]);
  renderApp();
  expect(await screen.findByText('NVDA')).toBeInTheDocument();
  expect(screen.getByText('Mua')).toBeInTheDocument();
  expect(screen.getByText('Hoàn tất')).toBeInTheDocument();
});

it('shows API failure and recovers after retry', async () => {
  const health = vi
    .spyOn(api, 'health')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ status: 'ok', application: 'available', core: 'available' });
  vi.spyOn(api, 'version').mockResolvedValue({ ui: '0.1.0', core: '0.7.1' });
  renderApp();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Không thể tải dữ liệu TradingAgents UI',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Đã kết nối')).toBeInTheDocument();
  expect(health).toHaveBeenCalledTimes(2);
});

it('keeps the application available when the core health check fails', async () => {
  vi.spyOn(api, 'health').mockResolvedValue({
    status: 'degraded',
    application: 'available',
    core: 'unavailable',
  });
  vi.spyOn(api, 'version').mockResolvedValue({ ui: '0.1.0', core: '0.7.1' });
  renderApp();
  expect(await screen.findByText('Đã kết nối')).toBeInTheDocument();
  expect(screen.getByText('Không khả dụng')).toBeInTheDocument();
});

it('renders empty settings without crashing', async () => {
  vi.spyOn(api, 'settings').mockResolvedValue({
    source: 'core_defaults_and_environment',
    read_only: true,
    values: {},
  });
  vi.spyOn(api, 'capabilities').mockResolvedValue(capabilities);
  renderApp('/settings');
  expect(await screen.findByText('Chưa có cài đặt nào để hiển thị.')).toBeInTheDocument();
  expect(screen.getByText('Không có nhà cung cấp nào.')).toBeInTheDocument();
});

it('groups editable settings and saves only after a change', async () => {
  vi.spyOn(api, 'me').mockResolvedValue({
    subject: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
  });
  vi.spyOn(api, 'settings').mockResolvedValue({
    source: 'core_defaults_and_environment',
    read_only: false,
    values: { max_debate_rounds: 1, checkpoint_enabled: false, data_vendors: { news: 'yfinance' } },
  });
  vi.spyOn(api, 'capabilities').mockResolvedValue(capabilities);
  const update = vi.spyOn(api, 'updateSettings').mockResolvedValue({
    source: 'core_defaults_and_environment',
    read_only: false,
    values: { max_debate_rounds: 3, checkpoint_enabled: false, data_vendors: { news: 'yfinance' } },
  });
  renderApp('/settings');
  expect(await screen.findByRole('heading', { name: 'Quy trình phân tích' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Lưu cấu hình' })).not.toBeInTheDocument();
  const rounds = screen.getByLabelText('Số vòng tranh luận đầu tư');
  await userEvent.clear(rounds);
  await userEvent.type(rounds, '3');
  expect(screen.getByText('1 thay đổi chưa lưu')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
  expect(update).toHaveBeenCalledWith({ max_debate_rounds: 3 });
  expect(await screen.findByText('Đã lưu cấu hình.')).toBeInTheDocument();
});

it('shows settings and provider options from the application API', async () => {
  vi.spyOn(api, 'settings').mockResolvedValue({
    source: 'core_defaults_and_environment',
    read_only: true,
    values: { output_language: 'Vietnamese' },
  });
  vi.spyOn(api, 'capabilities').mockResolvedValue({
    ...capabilities,
    providers: [
      {
        id: 'sample-provider',
        models: { quick: [{ id: 'sample-model', label: 'Sample model' }] },
        allows_custom_model: true,
      },
    ],
  });
  renderApp('/settings');
  expect(await screen.findByText('Vietnamese')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Mô hình và chuyên viên hỗ trợ'));
  await userEvent.click(screen.getByText('sample-provider'));
  expect(screen.getByText('Sample model')).toBeInTheDocument();
});

it('shows settings API errors without crashing', async () => {
  vi.spyOn(api, 'settings').mockRejectedValue(new Error('offline'));
  vi.spyOn(api, 'capabilities').mockResolvedValue(capabilities);
  renderApp('/settings');
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

it('renders the analysis form', async () => {
  renderApp('/analysis/new');
  expect(await screen.findByRole('heading', { name: 'Phân tích mới' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Bắt đầu phân tích' })).toBeInTheDocument();
  expect(screen.getByLabelText('Mã cổ phiếu hoặc tài sản')).toBeInTheDocument();
  expect(await screen.findByDisplayValue('2026-10-31')).toBeInTheDocument();
});

it('renders persisted analysis history', async () => {
  vi.spyOn(api, 'analyses').mockResolvedValue([]);
  renderApp('/history');
  expect(await screen.findByRole('heading', { name: 'Lịch sử' })).toBeInTheDocument();
  expect(await screen.findByText('Chưa có phân tích nào.')).toBeInTheDocument();
});

it('hides stale running progress for jobs that have failed', async () => {
  vi.spyOn(api, 'analyses').mockResolvedValue([
    {
      id: 'failed-job',
      ticker: 'WMT',
      trade_date: '2026-10-31',
      asset_type: 'stock',
      analysts: ['market'],
      status: 'failed',
      progress: {
        phase: 'research',
        label: 'Research Team đang tranh luận các phát hiện',
        attempt: 1,
        max_attempts: 2,
        steps: [{ key: 'market', label: 'Market Analyst', status: 'running' }],
        reports: {},
        messages: [],
      },
      error: 'Phân tích bị gián đoạn sau khi máy chủ khởi động lại.',
      result: null,
      created_at: '2026-10-31T10:00:00Z',
      updated_at: '2026-10-31T10:01:00Z',
    },
  ]);
  renderApp('/history');
  expect(await screen.findByRole('alert')).toHaveTextContent('Phân tích bị gián đoạn');
  expect(screen.queryByRole('region', { name: 'Tiến trình phân tích' })).not.toBeInTheDocument();
  expect(screen.queryByText('Đang chạy')).not.toBeInTheDocument();
});

it('lets the user collapse live analysis output', async () => {
  const job = {
    id: 'running-job',
    ticker: 'NVDA',
    trade_date: '2026-10-31',
    asset_type: 'stock' as const,
    analysts: ['market'],
    status: 'running' as const,
    progress: {
      phase: 'analysts',
      label: 'Đang chạy các tác tử phân tích',
      attempt: 1,
      max_attempts: 2,
      steps: [{ key: 'market', label: 'Market Analyst', status: 'running' as const }],
      reports: {},
      messages: [{ speaker: 'Market Analyst', content: 'Đang rà soát xu hướng.' }],
    },
    error: null,
    result: null,
    created_at: '2026-10-31T10:00:00Z',
    updated_at: '2026-10-31T10:00:00Z',
  };
  vi.spyOn(api, 'createAnalysis').mockResolvedValue(job);
  vi.spyOn(api, 'analysis').mockResolvedValue(job);
  renderApp('/analysis/new');
  await userEvent.type(await screen.findByLabelText('Mã cổ phiếu hoặc tài sản'), 'NVDA');
  await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu phân tích' }));
  const summary = await screen.findByText('Cập nhật trực tiếp');
  const disclosure = summary.closest('details');
  expect(disclosure).toHaveAttribute('open');
  await userEvent.click(summary);
  expect(disclosure).not.toHaveAttribute('open');
});
