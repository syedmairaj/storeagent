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
# Preferred — must be an existing local Auth email/password user:
E2E_EMAIL=...
E2E_PASSWORD=...
# optional:
# PLAYWRIGHT_ORG_ID=<uuid>
```

`M14_TEST_*` is accepted by the harness but currently does **not** match any local Auth user.

## Commands

```bash
npx playwright install chromium
# Suite is Chromium-only. Mobile projects emulate phone viewports under Chromium
# (do not spread Playwright iPhone device presets — those default to WebKit).
npm run dev

# Automated login (requires valid E2E_* for an existing user)
npm run test:e2e:actions

# Manual headed capture (no DB mutation) — sign in yourself, resume inspector
MANUAL_AUTH_CAPTURE=1 npx playwright test --project=manual-auth --headed

# Re-run acceptance using captured storage state
PLAYWRIGHT_REUSE_AUTH=1 npm run test:e2e:actions
```

Auth state: `playwright/.auth/` (gitignored).
Screenshots: `tests/e2e/artifacts/` (gitignored).

## Mutations that need explicit approval

- Creating a new Auth user
- Resetting an existing user’s password
- Inserting organization membership rows
- `supabase db reset` / destructive SQL / Auth schema repairs for `confirmation_token`
