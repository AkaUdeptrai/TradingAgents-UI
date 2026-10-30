import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useResource } from '../api/use-resource';
import { EmptyState, ErrorState } from '../components/States';

export function Dashboard() {
  const health = useResource(api.health);
  const version = useResource(api.version);
  const backend = health.loading ? 'Checking…' : health.data ? 'Connected' : 'Disconnected';
  const core = health.loading
    ? 'Checking…'
    : health.data?.core === 'available'
      ? 'Available'
      : 'Unavailable';
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE OVERVIEW</p>
          <h1>TradingAgents Portal</h1>
          <p>Your workspace for multi-agent market research.</p>
        </div>
        <span className="phase-tag">Foundation phase</span>
      </div>
      {(health.error || version.error) && (
        <ErrorState
          retry={() => {
            health.retry();
            version.retry();
          }}
        />
      )}
      <section className="status-grid" aria-label="System status">
        <article className="status-card">
          <span className="card-label">Backend</span>
          <strong>
            <i className={`dot ${health.data ? 'good' : 'pending'}`} />
            {backend}
          </strong>
          <p>Portal API connection</p>
        </article>
        <article className="status-card">
          <span className="card-label">TradingAgents Core</span>
          <strong>
            <i className={`dot ${health.data?.core === 'available' ? 'good' : 'pending'}`} />
            {core}
          </strong>
          <p>Core runtime import</p>
        </article>
        <article className="status-card">
          <span className="card-label">Version</span>
          <strong>
            {version.loading ? 'Checking…' : version.data ? `v${version.data.core}` : 'Unavailable'}
          </strong>
          <p>TradingAgents{version.data ? ` · Portal v${version.data.portal}` : ''}</p>
        </article>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Analysis workspace</h2>
          <span className="muted">Getting started</span>
        </div>
        <EmptyState title="Your research starts here">
          Analysis execution and saved history are not connected in this phase. Explore the current
          core configuration to get oriented.
        </EmptyState>
        <div className="panel-action">
          <Link className="button" to="/settings">
            Explore settings <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <div className="info-row">
        <span className="info-symbol" aria-hidden="true">
          i
        </span>
        <p>
          Connected to the existing TradingAgents runtime. Settings are read-only during
          initialization.
        </p>
      </div>
    </>
  );
}
