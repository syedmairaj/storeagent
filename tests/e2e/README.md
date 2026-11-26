# Actions Playwright E2E

Bootstrap for R1/R2.a/R2.b Actions acceptance. Synthetic demo only.

## Local Supabase ports (storeagent)

| Surface | URL / port |
|---|---|
| Studio (dashboard you open) | `http://127.0.0.1:55323/project/default` |
| API + Auth (app / Playwright) | `http://127.0.0.1:55321` |
| Postgres | `127.0.0.1:55322` |
| App | `http://localhost:3000` |

Do **not** point `NEXT_PUBLIC_SUPABASE_URL` at Studio (`:55323`). It must stay on the API port (`:55321`).

## Auth diagnosis (2026-11-03 local)

Independently confirmed:

1. **Password login works** (`grant_type=password` reaches GoTrue; health `200`).
2. **`M14_TEST_EMAIL` is not present** in local `auth.users` → Playwright gets `invalid_credentials`.
3. Local Auth has existing password users; at least one has organization membership.
4. **`auth.admin.listUsers` is broken** (`confirmation_token` NULL scan) — affects admin listing only, not password sign-in.
5. Studio `:55323` vs API `:55321` is **not** a misconfiguration for the app.

## Credentials (gitignored)

```bash
# Preferred for automated magic-link (no password required):
# Must already exist in local auth.users with snapstore (or PLAYWRIGHT_ORG_ID) membership.
E2E_EMAIL=...
# optional preferred org (snapstore uuid):
# PLAYWRIGHT_ORG_ID=349e3ad3-c17b-4658-b3ae-a0ba00f226d0

# Password fallback only:
# E2E_AUTH_MODE=password
# E2E_PASSWORD=...
```

`M14_TEST_*` is accepted as a fallback email/password source but may **not** match any local Auth user — setup fails closed (no user creation).

### Onboarding vs auth failure

Authenticated `/app/onboarding` with heading **Set your organization context** means **AUTH_PASS** with a single incomplete org profile (null country or `XXX` currency), **not** login failure. The harness reports `ORG_MEMBERSHIP_BLOCKED` and will not auto-complete onboarding.

## Mailpit (storeagent local)

| Surface | URL |
|---|---|
| Mailpit UI | `http://127.0.0.1:55324` |
| Auth API | `http://127.0.0.1:55321` |

Do **not** use `:54324` (other local Supabase stack). Magic-link OTPs are **single-use**: the first `GET /auth/v1/verify` consumes the token; a second open returns `otp_expired` / `access_denied` and the app shows `auth_error=callback`.

## Commands

```bash
npx playwright install chromium
# Suite is Chromium-only. Mobile projects emulate phone viewports under Chromium
# (do not spread Playwright iPhone device presets — those default to WebKit).
npm run dev

# Automated FE-ACCEPT-1C (magic-link via Mailpit API, isolated outputs)
# Requires E2E_EMAIL = existing local Auth user with complete org membership.
npm run test:e2e:fe-accept-1c

# Actions-only (same setup project — magic-link by default)
npm run test:e2e:actions

# Manual headed capture — default magic-link /login (no Auth DB mutation)
MANUAL_AUTH_CAPTURE=1 npx playwright test --project=manual-auth --headed

# Re-run acceptance using captured storage state
PLAYWRIGHT_REUSE_AUTH=1 npm run test:e2e:actions
```

Automated magic-link flow (unattended): UI **Send magic link** → Mailpit `:55324` API retrieves matching new message → Playwright navigates verify URL **once** in the same browser context → GoTrue PKCE/callback → org contract gates → Actions banner before saving storage state.


### Manual magic-link capture (same Chromium context)

1. Start capture with isolation env (below) and `MANUAL_AUTH_CAPTURE=1` headed.
2. On `/login`, request **one** new magic link.
3. In Mailpit `:55324`, **copy** the verify URL — do **not** click Open/browser.
4. Paste that URL **once** into the Playwright Chromium address bar (keeps PKCE).
5. Wait until authenticated `/app` is visible (org picker or workspace).
6. Resume the inspector. Capture verifies org membership + synthetic Actions banner before writing `user.json`.

Password sign-in via “Use password instead” remains allowed in the same window.

Auth state: `playwright/.auth/` (gitignored) or `PLAYWRIGHT_AUTH_DIR`.
Screenshots: `tests/e2e/artifacts/` (gitignored) or `PLAYWRIGHT_ARTIFACTS_DIR`.

Optional isolation (keep evidence outside the repo / protect existing artifacts):

```bash
export PLAYWRIGHT_AUTH_DIR="$HOME/Library/Application Support/StoreAgent/fe-accept-1-final/auth"
export PLAYWRIGHT_ARTIFACTS_DIR="$HOME/Library/Application Support/StoreAgent/fe-accept-1-final/artifacts"
export PLAYWRIGHT_OUTPUT_DIR="$HOME/Library/Application Support/StoreAgent/fe-accept-1-final/test-results"
export PLAYWRIGHT_HTML_REPORT="$HOME/Library/Application Support/StoreAgent/fe-accept-1-final/playwright-report"
```

Isolated auth dirs live under Application Support (not Git). In-repo `playwright/.auth/` stays gitignored.

## Mutations that need explicit approval

- Creating a new Auth user
- Resetting an existing user’s password
- Inserting organization membership rows
- `supabase db reset` / destructive SQL / Auth schema repairs for `confirmation_token`
