import type { components } from './schema';

export type Health = components['schemas']['HealthResponse'];
export type Version = components['schemas']['VersionResponse'];
export type Capabilities = components['schemas']['CapabilitiesResponse'];
export type Settings = components['schemas']['SettingsResponse'];
export type User = components['schemas']['UserIdentity'];
export type AuthStatus = components['schemas']['AuthStatus'];
export type AnalysisJob = components['schemas']['AnalysisJob'];
export type AnalysisCreate = components['schemas']['AnalysisCreate'];
export type AnalysisProgress = components['schemas']['AnalysisProgress'];
export type ScanPlan = components['schemas']['ScanPlan'];
export type ScanPlanCreate = components['schemas']['ScanPlanCreate'];

export class ApiError extends Error {
  constructor(
    public status: number,
    detail?: string,
  ) {
    super(detail || `TradingAgents UI returned ${status}.`);
  }
}

const baseUrl = (import.meta.env.TRADINGAGENTS_UI_API_URL || '/api').replace(/\/$/, '');

async function get<T>(
  path: string,
  signal?: AbortSignal,
  acceptDegraded = false,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(`${baseUrl}${path}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    credentials: 'include',
    method,
    headers:
      body === undefined
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && path !== '/auth/me') {
    window.dispatchEvent(new Event('tradingagents-ui:unauthorized'));
  }
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json();
  if (
    acceptDegraded &&
    response.status === 503 &&
    typeof json === 'object' &&
    json !== null &&
    'status' in json &&
    json.status === 'degraded' &&
    'core' in json &&
    json.core === 'unavailable'
  ) {
    return json as T;
  }
  if (!response.ok) {
    const detail =
      typeof json === 'object' &&
      json !== null &&
      'detail' in json &&
      typeof json.detail === 'string'
        ? json.detail
        : undefined;
    throw new ApiError(response.status, detail);
  }
  if (json === null || typeof json !== 'object')
    throw new Error('TradingAgents UI returned an empty response.');
  return json as T;
}

export const api = {
  authStatus: (signal?: AbortSignal) => get<AuthStatus>('/auth/config', signal),
  me: (signal?: AbortSignal) => get<User>('/auth/me', signal),
  logout: () => get<void>('/auth/logout', undefined, false, 'POST'),
  health: (signal?: AbortSignal) => get<Health>('/health', signal, true),
  version: (signal?: AbortSignal) => get<Version>('/version', signal),
  capabilities: (signal?: AbortSignal) => get<Capabilities>('/capabilities', signal),
  settings: (signal?: AbortSignal) => get<Settings>('/settings', signal),
  updateSettings: (values: Record<string, unknown>) =>
    get<Settings>('/settings', undefined, false, 'PUT', { values }),
  analyses: (signal?: AbortSignal) => get<AnalysisJob[]>('/analysis', signal),
  analysis: (id: string, signal?: AbortSignal) =>
    get<AnalysisJob>(`/analysis/${encodeURIComponent(id)}`, signal),
  createAnalysis: (data: AnalysisCreate) =>
    get<AnalysisJob>('/analysis', undefined, false, 'POST', data),
  scans: (signal?: AbortSignal) => get<ScanPlan[]>('/scans', signal),
  createScan: (data: ScanPlanCreate) => get<ScanPlan>('/scans', undefined, false, 'POST', data),
  setScanEnabled: (id: string, enabled: boolean) =>
    get<ScanPlan>(`/scans/${encodeURIComponent(id)}?enabled=${enabled}`, undefined, false, 'PATCH'),
  deleteScan: (id: string) =>
    get<void>(`/scans/${encodeURIComponent(id)}`, undefined, false, 'DELETE'),
};

export function authLoginUrl(next: string): string {
  return `${baseUrl}/auth/google/login?next=${encodeURIComponent(next)}`;
}
