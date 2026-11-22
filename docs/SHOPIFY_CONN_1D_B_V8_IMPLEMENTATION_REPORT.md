# SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT

**Status:** PARTIAL → offline V8 **PASS (SQL role + claim-stub)** — **STOP for owner review**
**As-of:** 2026-11-22
**Baseline:** `main` @ `636725c` (`security(storeagent): add CONN-1d-A secret ingestion guards`)
**Mode:** Tests + report only. No product migrations, no production resolver, no Git ops.

| Gate | State |
|---|---|
| Offline V8 disposable matrix (G/A/R/N/X/S SQL + S3/T1 unit) | **PASS** |
| Hosted PostgREST / real JWT (PE1.b.6b) | **NOT claimed / BLOCKED** |
| `CREDENTIAL_BINDING_AUTHORIZATION_STATUS` | **`NOT_YET_VERIFIED`** |
| V11 / V12 | V11 **PARTIAL**; V12 offline **PASS** (unchanged) |
| CONN-1d-C/D | **Not started** |

---

## A. Baseline and changed paths

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `636725c` (= `origin/main`) |
| Staging | empty (no `git add` / commit / push) |
| Protected dirty tree | **Preserved** |

### Exact six paths

1. `tests/sql/shopify-conn-1d-b-v8-membership-bootstrap.sql`
2. `tests/sql/shopify-conn-1d-b-v8-role-membership-adversarial.sql`
3. `tests/sql/shopify-conn-1d-b-v15-bootstrap-rollback.sql`
4. `tests/unit/shopify-conn-1d-b-v8-isolation.live.test.ts`
5. `tests/unit/shopify-conn-1d-b-v8-architecture.test.ts`
6. `docs/SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT.md` (this file)

---

## B. Exact fixture / policy provenance

| Artifact | Provenance |
|---|---|
| `organization_members` shape | M1.3 `20261009090000` (test-only create on disposable DB; absent from CONN-1a bootstrap) |
| `organization_members` grants + `organization_members_select_self` | M1.5 `20261009150000` — **using-clause verified identical** via architecture test |
| `integrations` SELECT grant + `integrations_select_member` | M2.7 `20261011153000` — **using-clause verified identical** via architecture test |
| `auth.uid()` / `request.jwt.claim.sub` | CONN-1a disposable bootstrap stub (claim stub **≠** real JWT) |
| Vault tables / α/β RPCs | Tracked product migrations applied only on disposable DB |

No product migration files edited. No new product RLS policies committed to `supabase/migrations/`.

---

## C. V8 matrix outcomes

Disposable host: Homebrew PG on `127.0.0.1:55427` / `conn1d_b_v8_verify`
Datadir asserted under StoreAgent `restore-scratch` (not `/var/lib/postgresql/data`)
Forbidden: `:55322`, `:54322`, shared `postgres` on `:5432`

| ID | Result | Notes |
|---|---|---|
| **V8-G1** | **PASS** | anon/authenticated/service_role table DML false; RPC EXECUTE service_role only |
| **V8-G2** | **PASS** | vault policies = 0; `integrations_select_member` present from bootstrap |
| **V8-A1** | **PASS** | active member + claim stub → vault SELECT **privilege DENY** |
| **V8-A2** | **PASS** | same actor → integrations SELECT **RLS allow** (1 row) |
| **V8-A3** | **PASS** | authenticated vault RPC EXECUTE **privilege DENY** |
| **V8-R1** | **PASS** | membership DELETE → integrations **RLS zero-row** |
| **V8-R2** | **PASS** | revoked former → vault still **privilege DENY** |
| **V8-N1** | **PASS** | non-member integrations empty + vault privilege DENY |
| **V8-X1** | **PASS** | org-B member cannot see org-A integrations; sees own |
| **V8-X2** | **PASS** | foreign user vault privilege DENY |
| **V8-S1** | **PASS** | service_role direct vault SELECT DENY |
| **V8-S2** | **PASS** | service_role load RPC returns sealed bytes for scoped ids; wrong org → 0 rows |
| **V8-S3** | **PASS** | unit: fabricated/unbranded `TrustedCredentialScope` rejected |
| **V8-T1** | **PASS** | unit: empty memberships → `membership_not_found` |

---

## D. Rollback / baseline preservation

`shopify-conn-1d-b-v15-bootstrap-rollback.sql`:

- Deletes only `c01d0b00-…` fixture rows
- Drops test-only `integrations_select_member` / `organization_members_select_self`
- Drops test-only `organization_members` table
- Asserts `integrations`, `integration_credentials`, α load RPC, β acquire RPC **remain**

---

## E. Tests and regressions

```text
RUN_CONN1D_B_ISOLATED_LIVE=1 \
CONN1D_B_PGHOST=127.0.0.1 CONN1D_B_PGPORT=55427 \
CONN1D_B_PGDATABASE=conn1d_b_v8_verify CONN1D_B_PGUSER=postgres \
npx vitest run tests/unit/shopify-conn-1d-b-v8-isolation.live.test.ts \
  tests/unit/shopify-conn-1d-b-v8-architecture.test.ts
→ 2 files / 10 tests PASS

npx vitest run α/β architecture+repository + tenant-resolution + 1d-A boundaries + 1d-B architecture
→ 7 files / 52 tests PASS

npm run typecheck → PASS
npm run lint → PASS (0 errors; 2 pre-existing unrelated warnings)
git diff --check (six paths) → PASS
```

No hosted Supabase connection. No product migration apply outside disposable DB.

---

## F. V8 evidence classification

| Claim | Classification |
|---|---|
| Browser/authenticated cannot read vault secrets (grants + zero policies) | **Offline PASS** (SQL role + claim stub) |
| Revoked / non-member / cross-org isolation vs integrations contrast | **Offline PASS** |
| service_role RPC ≠ tenant authorization | **Offline PASS** (wrong-scope empty + branded scope unit) |
| Hosted JWT → PostgREST → vault denial | **NOT VERIFIED** (separate PE1.b.6b gate) |
| Production `IntegrationOwnershipLookup` | **NOT_YET_VERIFIED** (unchanged) |

---

## G. Remaining production blockers

- Hosted vault migration apply
- Real JWT / PE1.b.6b J-matrix
- Production ownership lookup / binding flip
- KEK wiring, OAuth, Shopify HTTP, workers, M6/M7
- CONN-1d-C disconnect/revoke protocol
- V11 DB-level / exotic-input gaps remain PARTIAL

---

## H. Proposed six-file Git manifest

Do **not** stage/commit under this gate alone. When owner authorizes:

```text
tests/sql/shopify-conn-1d-b-v8-membership-bootstrap.sql
tests/sql/shopify-conn-1d-b-v8-role-membership-adversarial.sql
tests/sql/shopify-conn-1d-b-v15-bootstrap-rollback.sql
tests/unit/shopify-conn-1d-b-v8-isolation.live.test.ts
tests/unit/shopify-conn-1d-b-v8-architecture.test.ts
docs/SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT.md
```

---

## I. PASS / PARTIAL / BLOCKED

### **PARTIAL overall / offline V8 PASS**

CONN-1d-B delivers disposable offline V8 acceptance with explicit privilege-DENY vs RLS-zero-row evidence and M2.7-verbatim policy reuse.

**Do not claim hosted JWT isolation.**
**Binding remains `NOT_YET_VERIFIED`.**
**CONN-1d-C/D remain BLOCKED.**

**STOP for owner review.** No staging/commit/push performed.
