import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { useResource } from '../api/use-resource';
import { ErrorState } from '../components/States';
import { RatingBadge, StatusBadge } from '../components/JobBadges';
import { assetTypeLabel } from '../lib/job-labels';

const loadRecent = async (signal: AbortSignal) => (await api.analyses(signal)).slice(0, 5);

export function Dashboard() {
  const navigate = useNavigate();
  const [ticker, setTicker] = useState('');
  const health = useResource(api.health);
  const version = useResource(api.version);
  const recent = useResource(loadRecent);
  const coreReady = health.data?.core === 'available';
  const statusTone = health.loading
    ? 'pending'
    : !health.data
      ? 'error'
      : coreReady
        ? 'ok'
        : 'warn';

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Tổng quan</h1>
          <p>Trạng thái hệ thống và các phân tích gần đây của bạn.</p>
        </div>
        <Link className="button" to="/analysis/new">
          Phân tích mới
        </Link>
      </header>

      {(health.error || version.error) && (
        <ErrorState
          retry={() => {
            health.retry();
            version.retry();
          }}
        />
      )}

      <section className="status-strip" aria-label="Trạng thái hệ thống">
        <div className="status-item">
          <span className={`dot ${statusTone}`} aria-hidden="true" />
          <span className="status-label">Ứng dụng</span>
          <strong>
            {health.loading ? 'Đang kiểm tra…' : health.data ? 'Đã kết nối' : 'Mất kết nối'}
          </strong>
        </div>
        <div className="status-item">
          <span className="status-label">Bộ máy phân tích</span>
          <strong>
            {health.loading ? 'Đang kiểm tra…' : coreReady ? 'Khả dụng' : 'Không khả dụng'}
          </strong>
        </div>
        <div className="status-item">
          <span className="status-label">Phiên bản</span>
          <strong>{version.data ? `v${version.data.core}` : version.loading ? '…' : '—'}</strong>
          {version.data && <span className="muted">UI v{version.data.ui}</span>}
        </div>
      </section>

      <section className="panel quick-start">
        <div>
          <h2>Phân tích nhanh</h2>
          <p>Nhập mã để mở form phân tích với cấu hình mặc định.</p>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const symbol = ticker.trim().toUpperCase();
            navigate(
              symbol ? `/analysis/new?ticker=${encodeURIComponent(symbol)}` : '/analysis/new',
            );
          }}
        >
          <input
            aria-label="Mã cần phân tích"
            maxLength={32}
            value={ticker}
            onChange={(event) => setTicker(event.target.value)}
            placeholder="NVDA, AAPL, BTC-USD…"
          />
          <button className="button">Tiếp tục</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Phân tích gần đây</h2>
          <Link className="text-link" to="/history">
            Xem tất cả <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {recent.loading ? (
          <p className="panel-body muted" role="status">
            Đang tải…
          </p>
        ) : recent.error ? (
          <p className="panel-body muted">Không thể tải danh sách phân tích.</p>
        ) : !recent.data?.length ? (
          <div className="panel-body empty-inline">
            <p>Chưa có phân tích nào. Bắt đầu bằng một mã bạn đang theo dõi.</p>
          </div>
        ) : (
          <ul className="job-list">
            {recent.data.map((job) => (
              <li key={job.id}>
                <Link to="/history" className="job-row">
                  <span className="job-ticker">{job.ticker}</span>
                  <span className="job-meta">
                    {job.trade_date} · {assetTypeLabel(job.asset_type)}
                  </span>
                  <span className="job-badges">
                    {job.result && <RatingBadge rating={job.result.final_rating} />}
                    <StatusBadge status={job.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
