import { expect, it, vi } from 'vitest';
import { api } from './client';

it('uses the API base path and passes the abort signal', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ values: {} })));
  vi.stubGlobal('fetch', fetchMock);
  await api.settings(new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/settings',
    expect.objectContaining({ signal: expect.any(AbortSignal), credentials: 'include' }),
  );
});

it('preserves a degraded health response', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'degraded', backend: 'available', core: 'unavailable' }),
          { status: 503 },
        ),
      ),
  );
  expect(await api.health()).toMatchObject({ status: 'degraded', core: 'unavailable' });
});

it('rejects HTTP failures and empty responses', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 500 }))
    .mockResolvedValueOnce(new Response('null'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(api.settings()).rejects.toThrow('500');
  await expect(api.settings()).rejects.toThrow('empty');
});
