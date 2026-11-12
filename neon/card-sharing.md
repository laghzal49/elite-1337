# Optional card-link revocation

This feature is off by default. Core authentication, guards, rankings and 42 reads do not use this table.

1. Review and apply `neon/card-sharing.sql` explicitly to staging, then production. Application requests never create this table or any trigger.
2. Set `CARD_SHARING_ENABLED=true` only after the migration succeeds and DATABASE_URL is available.
3. Test regeneration with your own test account. Existing legacy links remain valid until their owner disables or regenerates them.

With the flag off, there are zero new database reads or writes and existing card caching is preserved. With the flag on, successful policy reads use the Next.js Data Cache for 300 seconds, per owner; mutations invalidate that owner's tag. Expect one small database select per cold policy cache and no select on fresh cache hits. Revalidation is infrastructure dependent, so revocation is not instantaneous; stale images may remain for several minutes or longer in third-party caches. Each successful regeneration writes one row; repeat writes within five seconds are refused. No new 42 requests or ranking cache changes are introduced.

Missing database, missing table, invalid rows, errors or a read taking over one second disable only the sharing feature. Core pages and sign-in keep their existing behavior. The public image returns 503 when policy is unknown, so a revoked legacy link is never deliberately restored as an outage fallback. Reads that time out may finish in the background; the UI timeout does not cancel the database request. Mutations report failure without claiming success; retry after an uncertain response may rotate again.

Rollback: leave the table intact. Turning the flag off or rolling back to the old app restores legacy token acceptance. Do not do that after revocations unless that consequence is acceptable; keep the flag on to fail closed for this optional feature during a database outage. Do not drop rows to save space: their nonces preserve revocations.
