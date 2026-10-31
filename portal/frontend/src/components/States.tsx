import type { ReactNode } from 'react';

export function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="notice error" role="alert">
      <div>
        <strong>Không thể tải dữ liệu Portal</strong>
        <p>Kiểm tra backend đang chạy rồi thử lại.</p>
      </div>
      <button className="button secondary" onClick={retry}>
        Thử lại
      </button>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        ◇
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
