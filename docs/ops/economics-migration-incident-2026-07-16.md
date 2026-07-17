# Candidate economics migration incident — 2026-07-16

## Status

- External publishing remains paused.
- No business row was deleted or rewritten.
- The currently served six-container stack was not connected to the affected database.
- A post-incident full backup and schema-only backup were captured and hashed.

## What happened

At 2026-07-16 15:47:57 Asia/Shanghai, a disposable migration replay
overrode `DATABASE_URL` but did not override `DATABASE_ADMIN_URL`. Prisma's
schema uses `directUrl = env("DATABASE_ADMIN_URL")`, so `prisma migrate
deploy` connected to the host-mapped `shopmate-postgres/shopmate_codex`
database instead of the disposable PostgreSQL container.

Migration `20260716230000_add_candidate_economics_evidence` completed in
approximately 0.12 seconds with checksum
`75e6a6170405342e7451366f3c67e6e6773c22304d1e8a8f85206ea13ee30538`.

## Read-only impact evidence

The affected database contained 210 organizations, 227 users, 166 products,
one product candidate, and no product launch, publish snapshot, or external
submission rows. After the migration:

- all five new evidence/evaluation tables contained zero rows;
- all new launch, snapshot, and submission proof-link columns contained zero
  non-null links;
- the migration added schema objects only;
- the active backend continued to use the separate
  `shopmate-local-postgres/shopmate_codex` database and remained healthy.

## Backup evidence

Post-incident backups are stored under
`.local-server/backups/20260716-155102-economics-migration-incident/`:

- `shopmate_codex.post-incident.dump` — 51,041,768 bytes — SHA-256
  `24fcf5ebd558c74689b0aadfde2a93986273126c5ea51163600d8cb4ef6bf0d9`
- `shopmate_codex.post-incident.schema.sql` — 384,901 bytes — SHA-256
  `4f1d0a4ac800a1ccc32dbf1da9103ee428da853ca937b7685d64b0af7e8f267b`

The verified pre-change runtime-stack backup remains
`.local-server/backups/20260716-144451/database.dump`, SHA-256
`e8b63e71a8cd2d4b416f0dd24f085a0a2a0afa09c025b014fe9cf707074c012e`.

## Corrective actions

1. The offending task was interrupted and its disposable container stopped.
2. `db:migrate:deploy` now runs through
   `scripts/migrations/deploy-guarded.mjs`.
3. The guard requires `DATABASE_URL` and `DATABASE_ADMIN_URL` to identify the
   exact same host, port, and database before Prisma can run.
4. Regression tests prove mismatched runtime/direct URLs fail before Prisma.
5. A clean disposable PostgreSQL instance was restored from the verified
   87-migration backup, then both candidate-economics migrations were applied
   through the guarded command.
6. Transactional semantic verification proved:
   - a PASS evaluation with zero input rows is rejected;
   - an exact 11-input v3 proof chain is accepted;
   - the external submission can progress through claim, request, and success;
   - snapshot deletion is rejected;
   - all semantic test rows are removed by `ROLLBACK`.

## Remaining decision

The accidentally affected host-mapped database is not used by the current
served stack. It is intentionally left in its additive, backed-up state; no
destructive rollback will be attempted while the new tables are empty and the
forward migration remains compatible. The follow-up hardening migration has
only been applied to disposable PostgreSQL so far.
