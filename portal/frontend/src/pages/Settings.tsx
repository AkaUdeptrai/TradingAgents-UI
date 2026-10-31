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
  if (value === null) return 'Mặc định của nhà cung cấp / Core';
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
          <p className="eyebrow">CẤU HÌNH MÔI TRƯỜNG CHẠY</p>
          <h1>Cài đặt</h1>
          <p>Giá trị mặc định của Core sau khi áp dụng cấu hình môi trường.</p>
        </div>
        <span className="phase-tag">Chỉ đọc</span>
      </div>
      {loading && (
        <p role="status" className="notice">
          Đang tải cấu hình Core…
        </p>
      )}
      {error && <ErrorState retry={retry} />}
      {!loading && !error && values.length === 0 && (
        <EmptyState title="Chưa có cài đặt">
          chưa trả về cấu hình công khai nào.
        </EmptyState>
      )}
      {values.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Cài đặt Core</h2>
            <span className="muted">Từ TradingAgents</span>
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
            <h2>Nhà cung cấp và model</h2>
            <span className="muted">Danh mục Core · khả năng sử dụng tùy cấu hình nhà cung cấp</span>
            </div>
            {(capabilities.providers ?? []).length === 0 ? (
              <p className="panel-padding">Không có nhà cung cấp nào được trả về.</p>
            ) : (
              <div className="provider-grid">
                {capabilities.providers.map((provider) => (
                  <details key={provider.id}>
                    <summary>
                      {provider.id}
                      <span>Xem model</span>
                    </summary>
                    {Object.entries(provider.models).map(([tier, models]) => (
                      <div className="model-tier" key={tier}>
                        <h3>Mức suy luận {tier}</h3>
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
                      <p className="muted">Core hỗ trợ ID model tùy chỉnh.</p>
                    )}
                  </details>
                ))}
              </div>
            )}
          </section>
          <section className="panel panel-padding">
            <h2>Chuyên viên phân tích</h2>
            <div className="chips">
              {(capabilities.analysts ?? []).map((analyst) => (
                <span className="chip" key={analyst.id}>
                  {analyst.label}
                </span>
              ))}
            </div>
            <h2>Ngôn ngữ đầu ra</h2>
            <p>{capabilities.output_languages?.description}</p>
            <p className="muted">
              Gợi ý hiện tại: {capabilities.output_languages?.suggestions.join(', ') || 'Không có'}
            </p>
          </section>
        </>
      )}
    </>
  );
}
