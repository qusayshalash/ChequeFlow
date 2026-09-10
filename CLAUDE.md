# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the contribution conventions (style, commit format, where tests live) and `README.md` is the full setup guide, in Arabic. This file covers what neither makes obvious: how the workspace is wired, and the invariants that span several files.

## Commands

```bash
pnpm lint && pnpm typecheck && pnpm test   # the three that gate every change
pnpm --filter @cheque-flow/api test -- review-duplicate    # one Jest suite, by name
pnpm --filter @cheque-flow/web test -- cheques-default-sort # one Vitest file
pnpm --filter @cheque-flow/api dev         # API on :3333, docs at /api/docs
pnpm --filter @cheque-flow/web dev         # dashboard on :3000
```

Jest runs the API; Vitest runs web, mobile and every package; Playwright (`pnpm test:e2e:ui`, specs in `e2e/tests`) drives a running stack and needs `E2E_BASE_URL` / `E2E_API_URL` plus credentials from the environment. It uses `channel: 'chrome'`, so no browser download. API integration suites (`apps/api/test/*e2e-spec.ts`) skip themselves without `TEST_DATABASE_URL`, and eight of them need object storage listening.

## Running without Docker

This machine has no container runtime, so `pnpm infra:up` is not the path here:

```bash
bash scripts/db.sh start        # PostgreSQL from ~/ChequeFlowData/pgdata, port 5433
bash scripts/storage.sh start   # S3 stub for cheque images, 127.0.0.1 only
```

Both keep their data in `~/ChequeFlowData`, outside the repo on purpose. Node lives outside the standard path; export it before any command that spawns a subprocess:

```bash
export PATH="$HOME/.local/opt/node/bin:$HOME/.local/opt/postgres/bin:$PATH"
```

Web dev uses `dev:webpack` in `.claude/launch.json` — Turbopack cannot spawn its CSS subprocess in restricted environments.

## Workspace wiring

Packages are consumed as built output (`dist`), not source. **After editing `shared-types`, `validation`, `api-client`, `localization` or `ui`, build that package** or the apps typecheck and run against the previous version:

```bash
pnpm --filter @cheque-flow/shared-types build
```

`node-linker=hoisted` in `.npmrc` is required by Metro and is not negotiable.

## Architecture

**The state machine is the only writer of `status`.** Every transition goes through `assertTransition()` in `packages/shared-types/src/cheque-state-machine.ts`, and writes a `cheque_events` row inside the same transaction. The table also carries each action's required permission, so RBAC and the transition graph cannot disagree. No controller sets `status` directly.

**`organizationId` comes from the session only** and is never accepted from a client. Every query filters by it, and by `deletedAt: null` — deletion is soft everywhere, so a record removed from the lists keeps its images and its event history.

**`cheque_events` and `audit_logs` are append-only**, enforced by database triggers, not by convention. UPDATE and DELETE on them fail. Data corrections go through the API so the audit records them; raw SQL bypasses the story of what happened.

**Money is a string end to end** — NUMERIC in PostgreSQL, `MoneyString` in TypeScript, summed in SQL. No amount passes through a JavaScript float. Account numbers are AES-256-GCM encrypted with `FIELD_ENCRYPTION_KEY` and returned masked.

**Cheques carry `version` for optimistic locking**; a stale write is a conflict, not a silent overwrite.

**Duplicate detection** (`duplicate-detector.service.ts`) has two independent checks — the business key (org + bank + number + amount + due date) and the SHA-256 of an uploaded image. Neither is a database constraint, because a re-issued cheque can legitimately repeat a number: the caller decides via `allowDuplicate`, and the error carries the matches so a screen can name them. The capture flow is the subtle case — it creates a placeholder under a `TMP-` number exempt from the check, so the real check runs at review, on the confirmed values.

**OCR output is a suggestion until a human confirms it.** `process` stores an extraction and moves the cheque to `PENDING_REVIEW`; fields below 0.75 confidence are flagged for the reviewer; `review` applies the confirmed values and hands the status change to the state machine. Providers (`mock`, `google`, `claude`) implement one interface and are chosen by `OCR_PROVIDER`; without that provider's credentials the factory falls back to `mock` and logs why — in production the app refuses to boot instead, since serving synthetic readings in a financial system is worse than not starting. The cheque parser in `apps/api/src/modules/ocr/providers/` is tested against real-cheque fixtures — add a fixture when a new hand or bank breaks it.

## Arabic, RTL and localization

The UI is Arabic-first and `dir="rtl"`; code, filenames and comments are English. In RTL, **`end-0` is the left edge** — anchoring a popover there pushes it off-screen. The localization suite scans every `t('...')` and every `labelKey: '...'` in the apps and in `packages/shared-types/src`, and fails on a key that does not resolve in both languages or that points at a branch instead of a leaf.

**JavaScript's `\b` is ASCII-only and never fires between Arabic letters.** A pattern written with it silently matches nothing. Use `(?!\p{L})` with the `u` flag, or split into tokens.

## Testing conventions

Web and mobile have no DOM test environment: their suites read the component source and assert on it (`apps/web/lib/*.test.ts`). That is deliberate for faults that are one CSS class or one default value, and the file's comment should say which fault it pins. When adding such a test, reintroduce the original fault once to confirm it actually fails.
