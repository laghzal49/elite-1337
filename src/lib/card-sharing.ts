import { randomUUID } from 'node:crypto';
import { unstable_cache, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { sql } from './db';
import { withTimeout } from './timeout';

const schema = z.object({ enabled: z.boolean(), version: z.string().min(1).max(80) });
export type CardSharing = z.infer<typeof schema>;
/** Opt in only after the explicit card-sharing migration has been reviewed and applied. */
export const cardSharingEnabled = () => process.env.CARD_SHARING_ENABLED === 'true';
const tag = (id: number) => `card-sharing:${id}`;
/** An unavailable optional store disables only card sharing, never the signed-in app. */
export async function getCardSharing(userId: number): Promise<CardSharing | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (!cardSharingEnabled()) return { enabled: true, version: 'legacy' };
  if (!process.env.DATABASE_URL) return null;
  try {
    const read = unstable_cache(async () => {
      const rows = await sql()`select enabled, version from card_sharing where user_id = ${userId}`;
      return rows.length ? schema.parse(rows[0]) : { enabled: true, version: 'legacy' };
    }, ['card-sharing-v1', String(userId)], { revalidate: 300, tags: [tag(userId)] });
    return await withTimeout(read(), 1_000, null);
  } catch { return null; }
}
/** Rotate only this owner's link; a five-second write limit bounds repeated submissions. */
export async function changeCardSharing(userId: number, enabled: boolean): Promise<boolean> {
  if (!cardSharingEnabled() || !process.env.DATABASE_URL || !Number.isSafeInteger(userId) || userId <= 0) return false;
  try {
    const rows = await sql()`insert into card_sharing (user_id, enabled, version) values (${userId}, ${enabled}, ${randomUUID()})
      on conflict (user_id) do update set enabled = excluded.enabled, version = excluded.version, updated_at = now()
      where card_sharing.updated_at < now() - interval '5 seconds' returning user_id`;
    if (!rows.length) return false;
    revalidateTag(tag(userId));
    return true;
  } catch { return false; }
}
