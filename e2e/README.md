# End-to-end tests

Playwright, driving the Chrome already installed on the machine (`channel:
'chrome'`) rather than downloading its own — this repo is developed on a host
with no container runtime, and a browser bundle per checkout is a poor trade
for a suite that needs one Chromium.

## Running

The stack must already be up: PostgreSQL, the API, and the web app.

The API has to be started with a raised sign-in limit. The suite signs in more
than ten times a minute and the production default is ten, so a run against a
default stack fails partway through on 429:

```bash
RATE_LIMIT_AUTH_PER_MINUTE=1000 RATE_LIMIT_DEFAULT_PER_MINUTE=100000 \
  pnpm --filter @cheque-flow/api dev
```

The general limit matters too: a full run makes a few hundred requests, and
back-to-back runs while fixing something will exhaust the default 120 a minute
and start failing on setup rather than on anything under test.

```bash
E2E_PASSWORD='<the seeded development password>' pnpm test:e2e:ui
```

`E2E_PASSWORD` is required and has no default. No password is ever written
into this repository; the suite refuses to start without the variable rather
than falling back to a guess.

| Variable        | Default                        | What it is                       |
| --------------- | ------------------------------ | -------------------------------- |
| `E2E_BASE_URL`  | `http://localhost:3000`        | the web app                      |
| `E2E_API_URL`   | `http://localhost:3333/api/v1` | the API                          |
| `E2E_PASSWORD`  | *(required)*                   | the seeded password              |
| `E2E_OWNER`     | `admin`                        | an account with every permission |
| `E2E_VIEWER`    | `viewer`                       | a read-only account              |

Point it at a disposable stack. The suite writes and deletes records; every
one it creates is named `QA_TEST_…` so anything left behind is identifiable.

## Sessions

Only `auth.spec.ts` drives the sign-in form. Every other spec installs a
session through `signInThroughStorage`, so a broken login page fails one spec
instead of all of them, and the password is handled in one place.

Sign-in is rate limited to ten a minute, so the suite signs in **once per
role** and shares it (`apiLogin`). A spec that destroys its own session takes
a disposable one instead of clearing the shared cache — otherwise every later
spec would sign in again and the run would fail on 429 somewhere unrelated to
whatever actually broke.

## Tests that are red on purpose

One spec fails, and it is a real defect rather than a flaky test. It is
written to pass once the defect is fixed:

- `%` in the search box reaches SQL `LIKE` unescaped and returns every row

Five others were red and are now green: the impossible calendar date, the real
leap day, the invented currency code, the per-keystroke search request, and
`Escape` in the contact edit dialog.
