import type { AnalysisJob } from '../api/client';
import { ratingLabels, ratingTone } from '../lib/job-labels';

const statusLabels: Record<AnalysisJob['status'], string> = {
  queued: 'Đang chờ',
  running: 'Đang chạy',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
};

export function StatusBadge({ status }: { status: AnalysisJob['status'] }) {
  return <span className={`badge status-${status}`}>{statusLabels[status]}</span>;
}

export function RatingBadge({ rating }: { rating: string | null | undefined }) {
  return (
    <span className={`badge rating-${ratingTone(rating)}`}>
      {rating ? (ratingLabels[rating.toLowerCase()] ?? rating) : 'Chưa có xếp hạng'}
    </span>
  );
}
