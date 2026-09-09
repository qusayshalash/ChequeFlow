# Repository Guidelines

## Project Structure & Module Organization

ChequeFlow is a pnpm/Turborepo TypeScript monorepo. Applications live in `apps/`: `api` is a NestJS REST service, `web` is a Next.js App Router dashboard, and `mobile` is an Expo Router app. Reusable code belongs in `packages/`, including `database` (Prisma schema and migrations), `shared-types`, `validation`, `api-client`, `ui`, and `localization`. Infrastructure definitions are in `infrastructure/`, architectural and API notes in `docs/`, Playwright configuration and browser tests at the root, and shell acceptance scenarios in `tests/`.

Keep application-specific behavior inside its app. Move contracts, validation, design primitives, or localization shared by multiple clients into the appropriate package.

## Build, Test, and Development Commands

Use Node.js 22.12+ and pnpm 10.15.0.

- `pnpm install` installs all workspace dependencies.
- `cp .env.example .env && pnpm infra:up` configures local settings and starts PostgreSQL, Redis, and MinIO.
- `pnpm dev` starts workspace development tasks; target one app with `pnpm --filter @cheque-flow/web dev` (or `api`/`mobile`).
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` run repository-wide Turbo tasks.
- `pnpm test:e2e` runs API integration suites; `pnpm test:e2e:ui` runs Playwright tests.
- `pnpm db:deploy && pnpm db:seed` applies migrations and loads development fixtures.

## Coding Style & Naming Conventions

Prettier enforces two-space indentation, single quotes, semicolons, trailing commas, and a 100-character line width. Run `pnpm format:check` before submitting; use `pnpm format` to fix formatting. ESLint requires typed imports, handled promises, and no explicit `any`. Use `PascalCase` for React components and classes, `camelCase` for functions and variables, and descriptive kebab-case filenames such as `cheque-actions.service.ts`. Keep UI copy localized; the product is Arabic-first and RTL while code and filenames remain English.

## Testing Guidelines

Place unit tests beside source as `*.test.ts(x)` or `*.spec.ts`; API integration tests belong in `apps/api/test/*e2e-spec.ts`. Jest covers the API, Vitest covers web/mobile/shared packages, and Playwright covers browser flows. Add regression tests for bug fixes and state transitions. No numeric coverage threshold is enforced, but changed behavior should be exercised. API e2e tests require `TEST_DATABASE_URL` and running object storage; see `README.md`.

## Commit & Pull Request Guidelines

History follows Conventional Commit prefixes such as `feat:`, `fix:`, `test:`, `docs:`, `chore:`, and `revert:`. Write imperative, outcome-focused subjects. Pull requests should explain the user-visible change, list verification commands, link relevant issues, and include screenshots or recordings for web/mobile UI changes. Call out migrations, environment changes, and security implications explicitly. Never commit `.env`, credentials, service-account keys, or generated build directories.
