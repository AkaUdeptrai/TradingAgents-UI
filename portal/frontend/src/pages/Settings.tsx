import { api } from '../api/client';
import { useResource } from '../api/use-resource';
import { EmptyState, ErrorState } from '../components/States';

const loadSettings = async (signal: AbortSignal) => {
  const [settings, capabilities] = await Promise.all([
    api.settings(signal),
    api.capabilities(signal),
  ]);
  return { settings, capabilities };
};

function showValue(value: unknown): string {
  if (value === null) return 'Provider / core default';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function Settings() {
  const { data, error, loading, retry } = useResource(loadSettings);
  const values = Object.entries(data?.settings.values ?? {});
  const capabilities = data?.capabilities;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RUNTIME CONFIGURATION</p>
          <h1>Settings</h1>
          <p>Current core defaults with environment overrides applied.</p>
        </div>
        <span className="phase-tag">Read-only</span>
      </div>
      {loading && (
        <p role="status" className="notice">
          Loading core configuration…
        </p>
      )}
      {error && <ErrorState retry={retry} />}
      {!loading && !error && values.length === 0 && (
        <EmptyState title="No settings available">
          The backend has not returned any public configuration.
        </EmptyState>
      )}
      {values.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Core settings</h2>
            <span className="muted">From TradingAgents</span>
          </div>
          <dl className="settings-list">
            {values.map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll('_', ' ')}</dt>
                <dd>
                  <pre>{showValue(value)}</pre>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {capabilities && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Providers & models</h2>
              <span className="muted">Core catalog · availability depends on provider setup</span>
            </div>
            {(capabilities.providers ?? []).length === 0 ? (
              <p className="panel-padding">No providers returned.</p>
            ) : (
              <div className="provider-grid">
                {capabilities.providers.map((provider) => (
                  <details key={provider.id}>
                    <summary>
                      {provider.id}
                      <span>View models</span>
                    </summary>
                    {Object.entries(provider.models).map(([tier, models]) => (
                      <div className="model-tier" key={tier}>
                        <h3>{tier} thinking</h3>
                        <ul>
                          {models.map((model) => (
                            <li key={model.id}>
                              <span>{model.label}</span>
                              <code>{model.id}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {provider.allows_custom_model && (
                      <p className="muted">Custom model IDs supported by core.</p>
                    )}
                  </details>
                ))}
              </div>
            )}
          </section>
          <section className="panel panel-padding">
            <h2>Analysts</h2>
            <div className="chips">
              {(capabilities.analysts ?? []).map((analyst) => (
                <span className="chip" key={analyst.id}>
                  {analyst.label}
                </span>
              ))}
            </div>
            <h2>Output language</h2>
            <p>{capabilities.output_languages?.description}</p>
            <p className="muted">
              Current suggestion: {capabilities.output_languages?.suggestions.join(', ') || 'None'}
            </p>
          </section>
        </>
      )}
    </>
  );
}
