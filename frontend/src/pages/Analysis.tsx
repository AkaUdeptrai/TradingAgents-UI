import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Circle, FileText, LoaderCircle } from 'lucide-react';
import {
  api,
  ApiError,
  type AnalysisCreate,
  type AnalysisJob,
  type AnalysisProgress,
} from '../api/client';
import { ErrorState } from '../components/States';
import { MarkdownReport } from '../components/MarkdownReport';
import { RatingBadge, StatusBadge } from '../components/JobBadges';
import { assetTypeLabel, reportTitle } from '../lib/job-labels';

type Analyst = AnalysisCreate['analysts'][number];

const analystLabels: Record<Analyst, string> = {
  market: 'Kỹ thuật',
  social: 'Tâm lý thị trường',
  news: 'Tin tức',
  fundamentals: 'Doanh nghiệp',
};

const pipeline = [
  'Các chuyên viên phân tích dữ liệu',
  'Nhóm nghiên cứu tranh luận tăng/giảm',
  'Lập kế hoạch giao dịch',
  'Đánh giá rủi ro',
  'Quyết định cuối cùng',
];

const isActive = (status?: AnalysisJob['status']) => status === 'queued' || status === 'running';

export function Analysis() {
  const [params] = useSearchParams();
  const [ticker, setTicker] = useState(params.get('ticker') ?? '');
  const [tradeDate, setTradeDate] = useState('');
  const [assetType, setAssetType] = useState<'stock' | 'crypto'>('stock');
  const [analysts, setAnalysts] = useState<Analyst[]>(['market', 'social', 'news', 'fundamentals']);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateLoading, setDateLoading] = useState(true);
  const jobQuery = useQuery({
    queryKey: ['analysis', job?.id],
    queryFn: () => api.analysis(job!.id),
    enabled: Boolean(job && isActive(job.status)),
    refetchInterval: (query) => (isActive(query.state.data?.status ?? 'queued') ? 2000 : false),
  });
  const visibleJob = jobQuery.data ?? job;
  const jobCreatedAt = visibleJob?.created_at;
  const jobStatus = visibleJob?.status;
  const [elapsed, setElapsed] = useState(0);
  const availableAnalysts = (Object.keys(analystLabels) as Analyst[]).filter(
    (key) => assetType !== 'crypto' || key !== 'fundamentals',
  );

  useEffect(() => {
    let active = true;
    api
      .capabilities()
      .then((capabilities) => {
        if (active) setTradeDate(capabilities.current_trade_date);
      })
      .catch(() => {
        if (active) setError('Không thể tải thông tin để xác định ngày phân tích.');
      })
      .finally(() => {
        if (active) setDateLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!jobCreatedAt || !isActive(jobStatus)) return;
    const startedAt = Date.parse(jobCreatedAt);
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [jobCreatedAt, jobStatus]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setJob(
        await api.createAnalysis({
          ticker: ticker.trim().toUpperCase(),
          trade_date: tradeDate,
          asset_type: assetType,
          analysts,
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Không thể gửi yêu cầu phân tích. Hãy kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Phân tích mới</h1>
          <p>Chọn mã và nội dung cần xem. Phân tích dùng cấu hình hiện tại trong Cài đặt.</p>
        </div>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="split">
        <section className="panel panel-body form-panel" aria-label="Thông tin phân tích">
          <form className="form" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span className="field-label">Mã cổ phiếu hoặc tài sản</span>
              <input
                required
                maxLength={32}
                value={ticker}
                onChange={(event) => setTicker(event.target.value)}
                placeholder="NVDA hoặc BTC-USD"
              />
            </label>
            <label className="field">
              <span className="field-label">Ngày phân tích</span>
              <input
                required
                type="date"
                max={tradeDate || undefined}
                value={tradeDate}
                onChange={(event) => setTradeDate(event.target.value)}
              />
            </label>
            <fieldset className="field">
              <legend className="field-label">Loại tài sản</legend>
              <div className="segmented">
                {(['stock', 'crypto'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="asset-type"
                      value={value}
                      checked={assetType === value}
                      onChange={() => {
                        setAssetType(value);
                        if (value === 'crypto') {
                          setAnalysts((current) =>
                            current.filter((item) => item !== 'fundamentals'),
                          );
                        }
                      }}
                    />
                    <span>{assetTypeLabel(value)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field-label">Nội dung cần phân tích</legend>
              <div className="chip-group">
                {availableAnalysts.map((analyst) => (
                  <label className="chip-toggle" key={analyst}>
                    <input
                      type="checkbox"
                      checked={analysts.includes(analyst)}
                      onChange={(event) =>
                        setAnalysts((current) =>
                          event.target.checked
                            ? [...current, analyst]
                            : current.filter((item) => item !== analyst),
                        )
                      }
                    />
                    <span>{analystLabels[analyst]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="button block"
              disabled={
                busy ||
                dateLoading ||
                !tradeDate ||
                !analysts.length ||
                isActive(visibleJob?.status)
              }
            >
              {busy ? 'Đang tạo…' : 'Bắt đầu phân tích'}
            </button>
          </form>
        </section>

        {visibleJob ? (
          <section className="panel" aria-label="Kết quả phân tích">
            <div className="panel-header">
              <h2>
                {visibleJob.ticker} <span className="muted">· {visibleJob.trade_date}</span>
              </h2>
              <StatusBadge status={visibleJob.status} />
            </div>
            <div className="panel-body stack">
              {isActive(visibleJob.status) && (
                <JobProgress progress={visibleJob.progress} elapsed={elapsed} />
              )}
              {jobQuery.isError && (
                <p role="alert" className="notice error">
                  Tạm thời không thể cập nhật tiến trình. Đang tiếp tục thử lại.
                </p>
              )}
              {visibleJob.status === 'failed' && (
                <div className="notice error" role="alert">
                  <div>
                    <strong>Phân tích chưa hoàn tất</strong>
                    <p>{visibleJob.error}</p>
                    <p>Kiểm tra thiết lập dịch vụ hoặc thử lại với mã khác.</p>
                  </div>
                </div>
              )}
              {visibleJob.result && <JobResult job={visibleJob} />}
            </div>
          </section>
        ) : (
          <section className="panel panel-body placeholder" aria-label="Quy trình phân tích">
            <h2>Quy trình phân tích</h2>
            <p>Sau khi bắt đầu, tiến trình và báo cáo từng bước sẽ hiển thị tại đây.</p>
            <ol className="pipeline">
              {pipeline.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}

export function AnalysisHistory() {
  const [jobs, setJobs] = useState<AnalysisJob[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .analyses()
        .then((items) => {
          if (active) {
            setJobs(items);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Lịch sử</h1>
          <p>Các phân tích do tài khoản của bạn khởi chạy, mới nhất ở trên.</p>
        </div>
      </header>
      {error && (
        <ErrorState
          retry={() =>
            api
              .analyses()
              .then(setJobs)
              .catch(() => setError(true))
          }
        />
      )}
      {jobs === null ? (
        !error && (
          <p className="muted" role="status">
            Đang tải…
          </p>
        )
      ) : jobs.length === 0 ? (
        <section className="panel panel-body empty-inline">
          <p>Chưa có phân tích nào.</p>
        </section>
      ) : (
        <ul className="panel history">
          {jobs.map((item) => (
            <li key={item.id}>
              <details className="history-item" open={isActive(item.status)}>
                <summary className="job-row">
                  <ChevronRight className="chevron" size={16} aria-hidden="true" />
                  <span className="job-ticker">{item.ticker}</span>
                  <span className="job-meta">
                    {item.trade_date} · {assetTypeLabel(item.asset_type)}
                  </span>
                  <span className="job-badges">
                    {item.result && <RatingBadge rating={item.result.final_rating} />}
                    <StatusBadge status={item.status} />
                  </span>
                </summary>
                <div className="history-body stack">
                  {isActive(item.status) && <JobProgress progress={item.progress} />}
                  {item.status === 'failed' && (
                    <p className="notice error" role="alert">
                      {item.error}
                    </p>
                  )}
                  {item.result && <JobResult job={item} />}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function JobResult({ job }: { job: AnalysisJob }) {
  const result = job.result!;
  return (
    <>
      <div className="decision">
        <div className="decision-head">
          <span className="eyebrow">Quyết định cuối cùng</span>
          <RatingBadge rating={result.final_rating} />
        </div>
        <MarkdownReport content={result.final_trade_decision ?? ''} />
      </div>
      {Object.entries(result.reports ?? {})
        .filter(([key]) => key !== 'final_trade_decision')
        .map(([key, value]) => (
          <details className="disclosure" key={key}>
            <summary>{reportTitle(key)}</summary>
            <MarkdownReport content={String(value)} />
          </details>
        ))}
    </>
  );
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function JobProgress({
  progress,
  elapsed,
}: {
  progress?: AnalysisProgress | null;
  elapsed?: number;
}) {
  const steps = progress?.steps ?? [];
  const reports = progress?.reports ?? {};
  const messages = progress?.messages ?? [];
  return (
    <section className="progress" aria-label="Tiến trình phân tích">
      <div className="progress-head">
        <div>
          <span className="eyebrow">
            Tiến trình
            {progress?.max_attempts && progress.max_attempts > 1
              ? ` · Lần thử ${progress.attempt ?? 1}/${progress.max_attempts}`
              : ''}
          </span>
          <strong>{progress?.label ?? 'Đang chờ lượt chạy'}</strong>
        </div>
        {elapsed !== undefined && <span className="progress-time">{formatElapsed(elapsed)}</span>}
      </div>
      {progress?.phase !== 'complete' && (
        <div className="progress-track" aria-hidden="true">
          <span />
        </div>
      )}
      {steps.length ? (
        <ol className="steps">
          {steps.map((step) => {
            const Icon =
              step.status === 'completed'
                ? Check
                : step.status === 'running'
                  ? LoaderCircle
                  : Circle;
            return (
              <li className={`step ${step.status}`} key={step.key}>
                <Icon size={15} aria-hidden="true" />
                <span>{stepLabel(step.label)}</span>
                <small>
                  {step.status === 'completed'
                    ? 'Hoàn tất'
                    : step.status === 'running'
                      ? 'Đang chạy'
                      : 'Đang chờ'}
                </small>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">Đang chuẩn bị các chuyên viên phân tích…</p>
      )}
      {messages.length > 0 && (
        <details className="disclosure live" open>
          <summary>
            Đang phân tích <span className="muted">Cập nhật trực tiếp</span>
          </summary>
          <div className="live-log" role="log" aria-live="polite" aria-relevant="additions">
            {messages.slice(-12).map((message, index) => (
              <article className="live-message" key={`${message.speaker}-${index}`}>
                <span className="eyebrow">{stepLabel(message.speaker)}</span>
                <MarkdownReport content={message.content} />
              </article>
            ))}
          </div>
        </details>
      )}
      {Object.keys(reports).length > 0 && (
        <details className="disclosure">
          <summary>
            <FileText size={15} aria-hidden="true" />
            Báo cáo đã có ({Object.keys(reports).length})
          </summary>
          {Object.entries(reports).map(([key, value]) => (
            <details className="disclosure nested" key={key}>
              <summary>{reportTitle(key)}</summary>
              <MarkdownReport content={value} />
            </details>
          ))}
        </details>
      )}
    </section>
  );
}

function stepLabel(label: string) {
  return (
    {
      'Market Analyst': 'Phân tích kỹ thuật',
      'Sentiment Analyst': 'Phân tích tâm lý thị trường',
      'News Analyst': 'Phân tích tin tức',
      'Fundamentals Analyst': 'Phân tích cơ bản',
      'Research Team': 'Tranh luận đầu tư',
      Trader: 'Lập kế hoạch giao dịch',
      'Risk Management Team': 'Đánh giá rủi ro',
      'Portfolio Manager': 'Quyết định danh mục',
    }[label] ?? label
  );
}
