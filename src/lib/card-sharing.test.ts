import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { query, invalidate, cache } = vi.hoisted(() => ({ query: vi.fn(), invalidate: vi.fn(), cache: vi.fn((fn) => fn) }));
vi.mock('./db', () => ({ sql: () => query }));
vi.mock('next/cache', () => ({ unstable_cache: cache, revalidateTag: invalidate }));
import { getCardSharing, changeCardSharing } from './card-sharing';
beforeEach(() => { vi.clearAllMocks(); query.mockReset(); vi.stubEnv('DATABASE_URL', 'test'); vi.stubEnv('CARD_SHARING_ENABLED', 'true'); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('adds no database traffic when not opted in', async () => {
  vi.stubEnv('CARD_SHARING_ENABLED', '');
  expect(await getCardSharing(900000001)).toEqual({ enabled: true, version: 'legacy' });
  expect(await changeCardSharing(900000001, true)).toBe(false);
  expect(query).not.toHaveBeenCalled();
});
it('turns off the optional feature for missing database, missing table and malformed rows', async () => {
  vi.stubEnv('DATABASE_URL', '');
  expect(await getCardSharing(900000001)).toBeNull();
  expect(query).not.toHaveBeenCalled();
  vi.stubEnv('DATABASE_URL', 'test');
  query.mockRejectedValueOnce(new Error('missing relation'));
  expect(await getCardSharing(900000001)).toBeNull();
  query.mockResolvedValueOnce([{ enabled: 'bad' }]);
  expect(await getCardSharing(900000001)).toBeNull();
  query.mockRejectedValueOnce(new Error('offline'));
  expect(await changeCardSharing(900000001, false)).toBe(false);
});
it('bounds slow reads without changing unknown policy to enabled', async () => {
  vi.useFakeTimers(); query.mockReturnValue(new Promise(() => {}));
  const pending = getCardSharing(900000001);
  await vi.advanceTimersByTimeAsync(1001);
  expect(await pending).toBeNull();
});
it('reads a small policy using a per-owner cache tag and never creates schema', async () => {
  query.mockResolvedValue([{ enabled: false, version: 'revoked' }]);
  expect(await getCardSharing(900000001)).toEqual({ enabled: false, version: 'revoked' });
  expect(cache).toHaveBeenCalledWith(expect.any(Function), ['card-sharing-v1', '900000001'], { revalidate: 300, tags: ['card-sharing:900000001'] });
  expect(query.mock.calls[0][0].join('')).toMatch(/^select enabled, version/);
});
it('rotates only the owner with a rate-limited write and invalidates that owner cache', async () => {
  query.mockResolvedValue([{ user_id: 900000001 }]);
  expect(await changeCardSharing(900000001, true)).toBe(true);
  const [parts, id, enabled, nonce] = query.mock.calls[0];
  expect(parts.join('')).toContain("interval '5 seconds'");
  expect(parts.join('')).not.toContain('create table');
  expect([id, enabled]).toEqual([900000001, true]);
  expect(nonce).toMatch(/^[0-9a-f-]{36}$/);
  expect(invalidate).toHaveBeenCalledWith('card-sharing:900000001');
  invalidate.mockClear(); query.mockResolvedValue([]);
  expect(await changeCardSharing(900000001, true)).toBe(false);
  expect(invalidate).not.toHaveBeenCalled();
});
