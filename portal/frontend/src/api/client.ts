import type { components } from './schema';

export type Health = components['schemas']['HealthResponse'];
export type Version = components['schemas']['VersionResponse'];
export type Capabilities = components['schemas']['CapabilitiesResponse'];
export type Settings = components['schemas']['SettingsResponse'];
export type User = components['schemas']['UserIdentity'];
export type AuthStatus = components['schemas']['AuthStatus'];

export class ApiError extends Error {
  constructor(public status: number) {
    super(`TradingAgents UI returned ${status}.`);
  }
}

const baseUrl = (import.meta.env.PORTAL_API_URL || '/api').replace(/\/$/, '');

async function get<T>(
  path: string,
  signal?: AbortSignal,
  acceptDegraded = false,
  method = 'GET',
): Promise<T> {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(`${baseUrl}${path}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: 'application/json' },
    credentials: 'include',
    method,
  });
  if (response.status === 401 && path !== '/auth/me') {
    window.dispatchEvent(new Event('portal:unauthorized'));
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
  if (!response.ok) throw new ApiError(response.status);
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
};

export function authLoginUrl(next: string): string {
  return `${baseUrl}/auth/google/login?next=${encodeURIComponent(next)}`;
}
