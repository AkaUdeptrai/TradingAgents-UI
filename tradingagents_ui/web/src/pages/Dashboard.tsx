import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useResource } from '../api/use-resource';
import { EmptyState, ErrorState } from '../components/States';

export function Dashboard() {
  const health = useResource(api.health);
  const version = useResource(api.version);
  const appStatus = health.loading ? 'Đang kiểm tra…' : health.data ? 'Đã kết nối' : 'Mất kết nối';
  const core = health.loading
    ? 'Đang kiểm tra…'
    : health.data?.core === 'available'
      ? 'Khả dụng'
      : 'Không khả dụng';
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TỔNG QUAN KHÔNG GIAN LÀM VIỆC</p>
          <h1>TradingAgents UI</h1>
          <p>Không gian nghiên cứu thị trường với nhiều tác tử.</p>
        </div>
        <span className="phase-tag">Giai đoạn nền tảng</span>
      </div>
      {(health.error || version.error) && (
        <ErrorState
          retry={() => {
            health.retry();
            version.retry();
          }}
        />
      )}
      <section className="status-grid" aria-label="Trạng thái hệ thống">
        <article className="status-card">
          <span className="card-label">Ứng dụng</span>
          <strong>
            <i className={`dot ${health.data ? 'good' : 'pending'}`} />
            {appStatus}
          </strong>
          <p>Trạng thái TradingAgents UI</p>
        </article>
        <article className="status-card">
          <span className="card-label">TradingAgents Core</span>
          <strong>
            <i className={`dot ${health.data?.core === 'available' ? 'good' : 'pending'}`} />
            {core}
          </strong>
          <p>Nạp môi trường chạy Core</p>
        </article>
        <article className="status-card">
          <span className="card-label">Phiên bản</span>
          <strong>
            {version.loading ? 'Đang kiểm tra…' : version.data ? `v${version.data.core}` : 'Không khả dụng'}
          </strong>
          <p>TradingAgents UI{version.data ? ` · v${version.data.ui}` : ''}</p>
        </article>
      </section>
      <section className="panel">
        <div className="panel-heading">
            <h2>Khu vực phân tích</h2>
            <span className="muted">Bắt đầu</span>
        </div>
        <EmptyState title="Bắt đầu nghiên cứu tại đây">
          Giai đoạn này chưa hỗ trợ chạy phân tích và lưu lịch sử. Bạn có thể xem cấu hình Core hiện
          tại để làm quen.
        </EmptyState>
        <div className="panel-action">
          <Link className="button" to="/settings">
            Xem cài đặt <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <div className="info-row">
        <span className="info-symbol" aria-hidden="true">
          i
        </span>
        <p>
          Đã kết nối với môi trường chạy TradingAgents hiện có. Cài đặt chỉ có thể xem trong giai
          đoạn khởi tạo.
        </p>
      </div>
    </>
  );
}
