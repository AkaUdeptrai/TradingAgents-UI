import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Trash2 } from 'lucide-react';
import { api, type ScanPlanCreate } from '../api/client';
import { assetTypeLabel } from '../lib/job-labels';

const frequencyLabel = (frequency: string) => (frequency === 'daily' ? 'Mỗi ngày' : 'Mỗi tuần');

export function Scans() {
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: ['scans'], queryFn: () => api.scans() });
  const [name, setName] = useState('Danh sách theo dõi');
  const [tickers, setTickers] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [assetType, setAssetType] = useState<'stock' | 'crypto'>('stock');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['scans'] });
  const create = useMutation({
    mutationFn: (data: ScanPlanCreate) => api.createScan(data),
    onSuccess: async () => {
      setMessage({
        tone: 'ok',
        text: 'Đã lưu lịch. Lần chạy đầu tiên sau khoảng thời gian đã chọn.',
      });
      setTickers('');
      await refresh();
    },
    onError: () =>
      setMessage({
        tone: 'error',
        text: 'Không thể lưu lịch. Hãy kiểm tra danh sách mã và thử lại.',
      }),
  });
  const change = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.setScanEnabled(id, enabled),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteScan(id),
    onSuccess: refresh,
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({
      name: name.trim(),
      tickers: tickers.split(/[\s,;]+/).filter(Boolean),
      frequency,
      asset_type: assetType,
      analysts:
        assetType === 'stock'
          ? ['market', 'social', 'news', 'fundamentals']
          : ['market', 'social', 'news'],
    });
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Lịch tự động</h1>
          <p>
            Tự động phân tích một danh sách mã mỗi ngày hoặc mỗi tuần. Kết quả lưu trong Lịch sử.
          </p>
        </div>
      </header>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`notice ${message.tone === 'error' ? 'error' : 'success'}`}
        >
          {message.text}
        </p>
      )}
      <div className="split">
        <section className="panel panel-body form-panel" aria-label="Tạo lịch mới">
          <h2>Tạo lịch mới</h2>
          <form className="form" onSubmit={submit}>
            <label className="field">
              <span className="field-label">Tên danh sách</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Mã cần phân tích</span>
              <input
                required
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                placeholder="NVDA, AAPL, MSFT"
              />
              <small className="field-help">
                Cách nhau bằng dấu phẩy hoặc khoảng trắng. Tối đa 20 mã.
              </small>
            </label>
            <fieldset className="field">
              <legend className="field-label">Loại tài sản</legend>
              <div className="segmented">
                {(['stock', 'crypto'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="scan-asset-type"
                      checked={assetType === value}
                      onChange={() => setAssetType(value)}
                    />
                    <span>{assetTypeLabel(value)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field-label">Tần suất</legend>
              <div className="segmented">
                {(['daily', 'weekly'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="scan-frequency"
                      checked={frequency === value}
                      onChange={() => setFrequency(value)}
                    />
                    <span>{frequencyLabel(value)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="button block" disabled={create.isPending}>
              {create.isPending ? 'Đang lưu…' : 'Tạo lịch'}
            </button>
          </form>
        </section>

        <section className="panel" aria-label="Lịch đã tạo">
          <div className="panel-header">
            <h2>Lịch đã tạo</h2>
            {plans.data && <span className="muted">{plans.data.length} lịch</span>}
          </div>
          {plans.isPending ? (
            <p className="panel-body muted" role="status">
              Đang tải…
            </p>
          ) : plans.isError ? (
            <p className="panel-body muted">Không thể tải danh sách lịch.</p>
          ) : plans.data.length === 0 ? (
            <div className="panel-body empty-inline">
              <p>Chưa có lịch nào. Tạo lịch ở bên cạnh để bắt đầu.</p>
            </div>
          ) : (
            <ul className="plan-list">
              {plans.data.map((plan) => (
                <li key={plan.id} className={plan.enabled ? '' : 'paused'}>
                  <div className="plan-main">
                    <strong>{plan.name}</strong>
                    <span className="plan-tickers">
                      {plan.tickers.map((symbol) => (
                        <span className="tag" key={symbol}>
                          {symbol}
                        </span>
                      ))}
                    </span>
                    <span className="muted">
                      {frequencyLabel(plan.frequency)} · {assetTypeLabel(plan.asset_type)} ·{' '}
                      {plan.enabled
                        ? `Lần tới: ${new Date(plan.next_run_at).toLocaleString('vi-VN')}`
                        : 'Đang tạm dừng'}
                    </span>
                  </div>
                  <div className="plan-actions">
                    <button
                      className="icon-button"
                      onClick={() => change.mutate({ id: plan.id, enabled: !plan.enabled })}
                      aria-label={plan.enabled ? `Tạm dừng ${plan.name}` : `Bật lại ${plan.name}`}
                      title={plan.enabled ? 'Tạm dừng' : 'Bật lại'}
                    >
                      {plan.enabled ? (
                        <Pause size={15} aria-hidden="true" />
                      ) : (
                        <Play size={15} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={() => {
                        if (window.confirm(`Xóa lịch "${plan.name}"?`)) remove.mutate(plan.id);
                      }}
                      aria-label={`Xóa ${plan.name}`}
                      title="Xóa"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
