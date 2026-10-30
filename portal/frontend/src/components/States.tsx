import type { ReactNode } from 'react';

export function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="notice error" role="alert">
      <div>
        <strong>Unable to load Portal data</strong>
        <p>Check that the backend is running, then try again.</p>
      </div>
      <button className="button secondary" onClick={retry}>
        Try again
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
