import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('./db', () => ({ sql: () => query }));
beforeEach(() => { vi.resetModules(); query.mockReset(); vi.stubEnv('DATABASE_URL', 'test'); });
afterEach(() => vi.unstubAllEnvs());
it('adds a neutral entry without resetting an existing restriction', async () => {
  query.mockResolvedValue([]);
  const { addUserControl } = await import('./user-controls');
  expect(await addUserControl('blocked', 'admin')).toBe(true);
  expect(await addUserControl('blocked', 'admin')).toBe(true);
  const writes = query.mock.calls.filter(([parts]) => parts.join('').includes('insert into'));
  expect(writes).toHaveLength(2);
  for (const [parts, ...values] of writes) {
    expect(parts.join('')).toContain('on conflict (login) do nothing');
    expect(parts.join('')).not.toContain('allowed');
    expect(values).toEqual(['blocked', 'admin']);
  }
});
it('returns unavailable without querying when the database is absent', async () => {
  vi.stubEnv('DATABASE_URL', '');
  const { addUserControl } = await import('./user-controls');
  expect(await addUserControl('student', 'admin')).toBe(false);
  expect(query).not.toHaveBeenCalled();
});
it('keeps the existing environment fallback during an outage', async () => {
  query.mockRejectedValue(new Error('offline'));
  const { addUserControl, userControl } = await import('./user-controls');
  expect(await addUserControl('student', 'admin')).toBe(false);
  expect(await userControl('student')).toMatchObject({ allowed: true, source: 'environment' });
});
