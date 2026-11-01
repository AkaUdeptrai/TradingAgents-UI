import { useEffect, useMemo, useState } from 'react';
import { api, type Capabilities } from '../api/client';
import { useResource } from '../api/use-resource';
import { ErrorState } from '../components/States';

const loadSettings = async (signal: AbortSignal) => {
  const [settings, capabilities] = await Promise.all([
    api.settings(signal),
    api.capabilities(signal),
  ]);
  return { settings, capabilities };
};

type Kind = 'text' | 'number' | 'boolean' | 'json' | 'model';
type Field = { label: string; help?: string; kind: Kind; step?: string };

// Known keys get a label, help text and input type; unknown keys fall into "Khác".
const fields: Record<string, Field> = {
  llm_provider: {
    label: 'Nhà cung cấp mặc định',
    kind: 'text',
    help: 'Ví dụ: openai, anthropic, google.',
  },
  deep_think_provider: {
    label: 'Nhà cung cấp cho phân tích sâu',
    kind: 'text',
    help: 'Để trống để dùng nhà cung cấp mặc định.',
  },
  deep_think_llm: {
    label: 'Mô hình phân tích sâu',
    kind: 'model',
    help: 'Dùng cho tranh luận và quyết định.',
  },
  quick_think_provider: {
    label: 'Nhà cung cấp cho phản hồi nhanh',
    kind: 'text',
    help: 'Để trống để dùng nhà cung cấp mặc định.',
  },
  quick_think_llm: {
    label: 'Mô hình phản hồi nhanh',
    kind: 'model',
    help: 'Dùng cho các chuyên viên thu thập dữ liệu.',
  },
  output_language: { label: 'Ngôn ngữ kết quả', kind: 'text', help: 'Ví dụ: Vietnamese, English.' },
  temperature: {
    label: 'Temperature',
    kind: 'number',
    step: 'any',
    help: 'Thấp hơn cho kết quả ổn định hơn giữa các lần chạy.',
  },
  max_tokens: { label: 'Độ dài câu trả lời tối đa (token)', kind: 'number' },
  llm_max_retries: { label: 'Số lần thử lại khi lỗi', kind: 'number' },
  openai_reasoning_effort: {
    label: 'Mức suy luận OpenAI',
    kind: 'text',
    help: 'low, medium hoặc high.',
  },
  anthropic_effort: {
    label: 'Mức suy luận Anthropic',
    kind: 'text',
    help: 'low, medium hoặc high.',
  },
  google_thinking_level: { label: 'Mức suy luận Google', kind: 'text', help: 'low hoặc high.' },
  max_debate_rounds: { label: 'Số vòng tranh luận đầu tư', kind: 'number' },
  max_risk_discuss_rounds: { label: 'Số vòng thảo luận rủi ro', kind: 'number' },
  max_recur_limit: { label: 'Giới hạn bước của đồ thị', kind: 'number' },
  max_tool_rounds: { label: 'Số lượt dùng công cụ tối đa', kind: 'number' },
  checkpoint_enabled: { label: 'Lưu checkpoint để tiếp tục khi lỗi', kind: 'boolean' },
  holding_period_days: { label: 'Thời gian nắm giữ dự kiến (ngày)', kind: 'number' },
  memory_log_max_entries: { label: 'Số ghi chú bộ nhớ tối đa', kind: 'number' },
  news_article_limit: { label: 'Số tin tối đa mỗi mã', kind: 'number' },
  global_news_article_limit: { label: 'Số tin thị trường tối đa', kind: 'number' },
  global_news_lookback_days: { label: 'Số ngày tìm lại tin thị trường', kind: 'number' },
  benchmark_ticker: {
    label: 'Chỉ số tham chiếu',
    kind: 'text',
    help: 'Để trống để chọn theo khu vực, ví dụ SPY.',
  },
  global_news_queries: { label: 'Truy vấn tin thị trường', kind: 'json' },
  data_vendors: { label: 'Nguồn dữ liệu theo nhóm', kind: 'json' },
  tool_vendors: { label: 'Nguồn dữ liệu theo công cụ', kind: 'json' },
  benchmark_map: { label: 'Chỉ số tham chiếu theo khu vực', kind: 'json' },
};

const groups: {
  id: string;
  title: string;
  description: string;
  keys: string[];
  advanced?: boolean;
}[] = [
  {
    id: 'models',
    title: 'Mô hình AI',
    description: 'Nhà cung cấp, mô hình và cách mô hình trả lời.',
    keys: [
      'llm_provider',
      'deep_think_provider',
      'deep_think_llm',
      'quick_think_provider',
      'quick_think_llm',
      'output_language',
      'temperature',
      'max_tokens',
      'llm_max_retries',
      'openai_reasoning_effort',
      'anthropic_effort',
      'google_thinking_level',
    ],
  },
  {
    id: 'workflow',
    title: 'Quy trình phân tích',
    description: 'Độ sâu tranh luận và giới hạn của từng lượt phân tích.',
    keys: [
      'max_debate_rounds',
      'max_risk_discuss_rounds',
      'max_tool_rounds',
      'max_recur_limit',
      'holding_period_days',
      'memory_log_max_entries',
      'checkpoint_enabled',
    ],
  },
  {
    id: 'data',
    title: 'Tin tức & dữ liệu',
    description: 'Lượng tin tức và chỉ số dùng để so sánh.',
    keys: [
      'news_article_limit',
      'global_news_article_limit',
      'global_news_lookback_days',
      'benchmark_ticker',
    ],
  },
  {
    id: 'advanced',
    title: 'Nâng cao',
    description: 'Cấu hình dạng JSON. Chỉ sửa khi bạn biết rõ định dạng.',
    keys: ['global_news_queries', 'data_vendors', 'tool_vendors', 'benchmark_map'],
    advanced: true,
  },
];

const kindOf = (key: string, value: unknown): Kind =>
  fields[key]?.kind ??
  (typeof value === 'boolean'
    ? 'boolean'
    : typeof value === 'number'
      ? 'number'
      : value !== null && typeof value === 'object'
        ? 'json'
        : 'text');

const labelFor = (key: string) =>
  fields[key]?.label ??
  key.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toLocaleUpperCase());

const toRaw = (key: string, value: unknown) => {
  const kind = kindOf(key, value);
  if (kind === 'boolean') return '';
  if (kind === 'json') return JSON.stringify(value, null, 2);
  return value === null || value === undefined ? '' : String(value);
};

const displayValue = (value: unknown) =>
  value === null || value === ''
    ? 'Mặc định'
    : typeof value === 'boolean'
      ? value
        ? 'Bật'
        : 'Tắt'
      : typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);

function parse(kind: Kind, raw: string, original: unknown): { ok: boolean; value: unknown } {
  if (kind === 'number') {
    // Empty means "use the default" only where the default is itself unset.
    if (raw.trim() === '') return { ok: original === null, value: null };
    const value = Number(raw);
    return { ok: Number.isFinite(value), value };
  }
  if (kind === 'json') {
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { ok: false, value: original };
    }
  }
  return { ok: true, value: raw === '' && original === null ? null : raw };
}

function modelOptions(capabilities?: Capabilities) {
  const ids = new Set<string>();
  for (const provider of capabilities?.providers ?? []) {
    for (const models of Object.values(provider.models))
      models.forEach((model) => ids.add(model.id));
  }
  return [...ids].sort();
}

export function Settings() {
  const { data, error, loading, retry } = useResource(loadSettings);
  const [saved, setSaved] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  function reset(values: Record<string, unknown>) {
    setSaved(values);
    setDraft(values);
    setRaw(
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, toRaw(key, value)])),
    );
    setInvalid(new Set());
  }

  useEffect(() => {
    if (data) reset(data.settings.values);
  }, [data]);

  const readOnly = data?.settings.read_only ?? true;
  const values = data?.settings.values ?? {};
  const capabilities = data?.capabilities;
  const models = useMemo(() => modelOptions(capabilities), [capabilities]);
  const dirty = Object.keys(draft).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]),
  );
  const known = new Set(groups.flatMap((group) => group.keys));
  const visibleGroups = [
    ...groups,
    {
      id: 'other',
      title: 'Khác',
      description: 'Các mục cấu hình khác.',
      keys: Object.keys(values).filter((key) => !known.has(key)),
      advanced: false,
    },
  ]
    .map((group) => ({ ...group, keys: group.keys.filter((key) => key in values) }))
    .filter((group) => group.keys.length > 0);

  function edit(key: string, nextRaw: string) {
    const parsed = parse(kindOf(key, values[key]), nextRaw, saved[key]);
    setRaw((current) => ({ ...current, [key]: nextRaw }));
    setInvalid((current) => {
      const next = new Set(current);
      if (parsed.ok) next.delete(key);
      else next.add(key);
      return next;
    });
    if (parsed.ok) setDraft((current) => ({ ...current, [key]: parsed.value }));
    setSaveState('idle');
  }

  async function save() {
    setSaveState('saving');
    try {
      // Send only changed keys; the server merges them with earlier overrides.
      const settings = await api.updateSettings(
        Object.fromEntries(dirty.map((key) => [key, draft[key]])),
      );
      reset(settings.values);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  function renderInput(key: string) {
    const kind = kindOf(key, values[key]);
    const label = labelFor(key);
    if (readOnly)
      return (
        <span className={`setting-value${kind === 'json' ? ' code' : ''}`}>
          {displayValue(values[key])}
        </span>
      );
    if (kind === 'boolean')
      return (
        <input
          className="switch"
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={Boolean(draft[key])}
          onChange={(event) => {
            setDraft((current) => ({ ...current, [key]: event.target.checked }));
            setSaveState('idle');
          }}
        />
      );
    if (kind === 'json')
      return (
        <textarea
          aria-label={label}
          aria-invalid={invalid.has(key)}
          rows={6}
          spellCheck={false}
          value={raw[key] ?? ''}
          onChange={(event) => edit(key, event.target.value)}
        />
      );
    return (
      <input
        aria-label={label}
        aria-invalid={invalid.has(key)}
        type={kind === 'number' ? 'number' : 'text'}
        step={kind === 'number' ? (fields[key]?.step ?? '1') : undefined}
        list={kind === 'model' ? 'model-options' : undefined}
        placeholder={saved[key] === null ? 'Mặc định' : undefined}
        value={raw[key] ?? ''}
        onChange={(event) => edit(key, event.target.value)}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Cài đặt</h1>
          <p>
            Cấu hình cho các lượt phân tích mới.{' '}
            {readOnly
              ? 'Chỉ quản trị viên có thể thay đổi.'
              : 'Thay đổi áp dụng cho lượt phân tích tiếp theo.'}
          </p>
        </div>
        {data && (
          <span className={`badge ${readOnly ? '' : 'status-completed'}`}>
            {readOnly ? 'Chỉ xem' : 'Quản trị'}
          </span>
        )}
      </header>

      {loading && (
        <p role="status" className="muted">
          Đang tải cấu hình…
        </p>
      )}
      {error && <ErrorState retry={retry} />}
      {data && visibleGroups.length === 0 && (
        <section className="panel panel-body empty-inline">
          <p>Chưa có cài đặt nào để hiển thị.</p>
        </section>
      )}

      <datalist id="model-options">
        {models.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      {visibleGroups.map((group) => {
        const body = (
          <div className="settings-list">
            {group.keys.map((key) => (
              <div className="setting-row" key={key}>
                <div className="setting-meta">
                  <span className="setting-label" id={`setting-${key}`}>
                    {labelFor(key)}
                    {dirty.includes(key) && <span className="dirty-dot" aria-label="Đã thay đổi" />}
                  </span>
                  {fields[key]?.help && <small>{fields[key].help}</small>}
                  <code className="setting-key">{key}</code>
                </div>
                <div className="setting-control">
                  {renderInput(key)}
                  {invalid.has(key) && (
                    <small className="field-error">
                      {kindOf(key, values[key]) === 'json'
                        ? 'JSON không hợp lệ.'
                        : 'Hãy nhập một số.'}
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
        return group.advanced ? (
          <details className="panel settings-group collapsible" key={group.id}>
            <summary className="panel-header">
              <div>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
            </summary>
            {body}
          </details>
        ) : (
          <section
            className="panel settings-group"
            key={group.id}
            aria-labelledby={`group-${group.id}`}
          >
            <div className="panel-header">
              <div>
                <h2 id={`group-${group.id}`}>{group.title}</h2>
                <p>{group.description}</p>
              </div>
            </div>
            {body}
          </section>
        );
      })}

      {capabilities && (
        <details className="panel collapsible">
          <summary className="panel-header">
            <div>
              <h2>Mô hình và chuyên viên hỗ trợ</h2>
              <p>Danh sách tham khảo; không xác nhận tài khoản nhà cung cấp đã được kết nối.</p>
            </div>
          </summary>
          <div className="panel-body stack">
            {capabilities.providers.length === 0 ? (
              <p className="muted">Không có nhà cung cấp nào.</p>
            ) : (
              <div className="provider-grid">
                {capabilities.providers.map((provider) => (
                  <details className="disclosure" key={provider.id}>
                    <summary>{provider.id}</summary>
                    {Object.entries(provider.models).map(([tier, list]) => (
                      <div className="model-tier" key={tier}>
                        <span className="eyebrow">Mức {tier}</span>
                        <ul>
                          {list.map((model) => (
                            <li key={model.id}>
                              <span>{model.label}</span>
                              <code>{model.id}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {provider.allows_custom_model && (
                      <p className="muted">Có thể dùng tên mô hình tùy chỉnh.</p>
                    )}
                  </details>
                ))}
              </div>
            )}
            {capabilities.analysts.length > 0 && (
              <div>
                <span className="eyebrow">Chuyên viên phân tích</span>
                <div className="chip-group static">
                  {capabilities.analysts.map((analyst) => (
                    <span className="tag" key={analyst.id}>
                      {analyst.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {!readOnly && (dirty.length > 0 || saveState !== 'idle') && (
        <div className="save-bar" role="region" aria-label="Lưu cài đặt">
          <span className="save-status">
            {saveState === 'saved' ? (
              <span role="status">Đã lưu cấu hình.</span>
            ) : saveState === 'error' ? (
              <span role="alert">Không thể lưu. Hãy kiểm tra các giá trị rồi thử lại.</span>
            ) : (
              `${dirty.length} thay đổi chưa lưu`
            )}
          </span>
          {dirty.length > 0 && (
            <button
              className="button secondary"
              onClick={() => reset(saved)}
              disabled={saveState === 'saving'}
            >
              Hoàn tác
            </button>
          )}
          <button
            className="button"
            onClick={() => void save()}
            disabled={saveState === 'saving' || invalid.size > 0 || dirty.length === 0}
          >
            {saveState === 'saving' ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
        </div>
      )}
    </>
  );
}
