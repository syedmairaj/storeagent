# Hosted 38→52 migration runbook

**Status: CLOSED (2026-11-11)** — hosted ledger **52/52**, latest `20261110140000`.

**Mode:** Owner-authorized schema alignment only. Closing this track does **not** authorize workers, cron, JWT probes, production M7 create success, merchant approval unlock, or purchasing.

**Pin:** `qlsqminsfdntpqdkhxjx` (`postgres`, PG 17.11)
**Backup (pre-track):** `~/Library/Application Support/StoreAgent/backups/hosted-pre-38to52-20261110T164016Z/`
**Foreign fingerprint (verified MATCH after close):** `59d7d64dbcc254544f04cdb81ccff699`
**E.4 canary (verified unchanged):** org `e46e4000-…0001`, date `2026-06-15`, algo `m5-derived-metrics-v1`, queue `queued` dirty=2 / claimed=1 / applied=1 / attempt=0; leases NULL; metrics `0/0/7`

---

## Final hosted closeout evidence

| Field | Value |
|---|---|
| Migration ledger | **52/52** |
| Latest version | `20261110140000` |
| Deployed | S1–S14 via Supabase `db push` (completed successfully) |
| S4 profile RPC grants | authenticated/anon/service_role = **true/false/false** — **PASS** |
| S5 password-recovery table grants | auth no DML; service_role SELECT/INSERT/UPDATE (no DELETE) — **PASS** |
| S6 first-store RPC grants | authenticated/anon/service_role = **true/false/false** — **PASS** |
| M7 gates | `merchant_approvable=false`; production create still rejects `m5_sku_daily_metric_bound_v1` |
| Operational activation | **NOT AUTHORIZED** (workers/cron/JWT/M7 unlock/purchasing remain off) |

---

## Hosted default-privilege failures and corrections

Supabase hosted role-specific `ALTER DEFAULT PRIVILEGES` can grant EXECUTE on new functions and ALL on new tables to `service_role` (independent of `PUBLIC`). `REVOKE FROM public/anon` alone is insufficient.

| Step | Failure | Corrected source SHA-256 |
|---|---|---|
| **S4** | Initial hosted apply failed security contract: `service_role` retained EXECUTE on `complete_current_user_organization_profile`. Corrected with explicit `REVOKE ALL … FROM service_role`. | `b8fd37418217e06075a3b47e6eb3021c7e1d55c4b1e5ef3376a5f446e9465e10` |
| **S5** | Ambient table ALL left `service_role` DELETE on `password_recovery_challenges`. Corrected with `REVOKE ALL` then least-privilege `GRANT SELECT, INSERT, UPDATE`. | `8385aa77f65f66c56a7f97ed83361b3ec5f08d140fa02921f99136168c8d7a9a` |
| **S6** | Ambient `service_role` EXECUTE on `create_current_user_first_organization_store` (blocked batch until fixed). Corrected with explicit `REVOKE ALL … FROM service_role`; authenticated EXECUTE preserved; anon denied. | `e312967f5283536f3f836b00815afc466e82681959699221f360f89faa8ce59b` |

Prior blocked S6 SHA (pre-fix): `3c7f4924e245c03d13364153e7c0f657267930e7aabd00f9b49548a8d51e7949`

---

## Prep evidence (not committed artifacts)

| Artifact | Path |
|---|---|
| Pre-migration backup | `…/backups/hosted-pre-38to52-20261110T164016Z/` (SHA256SUMS verified) |
| S1–S4 fail-closed packages | `…/s1-rehearsal-20261110/` … `…/s4-rehearsal-20261111/` |
| S5 solo package | `…/s5-rehearsal-20261111/` |
| S5–S14 batch GO package | `…/s5s14-batch-rehearsal-20261111-unblock/` (`PENDING.SHA256`, evidence, owner CLI) |
| Batch disposable | PG17.11 port **55427**; restore-scratch `batch38to52-unblock-20261111T072540Z` |
| Batch sequence | verified hosted 38-base → corrected S1–S4 → exact S5–S14 under hosted-style default privileges; neg rollback PASS; disposable **52/52** before hosted push |

---

## Step ledger (historical)

| Step | Migration | Hosted after | Notes |
|---|---|---|---|
| S1 | `20261031100000_m7_2b_inventory_action_persistence` | 39/52 | CLOSED |
| S2 | `20261031120000_m7_3b_human_approval_lifecycle_schema` | 40/52 | CLOSED |
| S3 | `20261031130000_m7_3c_trusted_lifecycle_rpcs` | 41/52 | CLOSED |
| S4 | `20261107090000_m1_7_organization_profile_completion` | 42/52 | CLOSED after corrected REVOKE |
| S5–S14 | `20261107120000` … `20261110140000` (10 files) | **52/52** | Batch CLOSED after S6 grant fix + rehearsal GO |

### S5–S14 SHA-256 manifest (exact hosted apply inputs)

```
8385aa77f65f66c56a7f97ed83361b3ec5f08d140fa02921f99136168c8d7a9a  20261107120000_m1_8_password_recovery_challenges.sql
e312967f5283536f3f836b00815afc466e82681959699221f360f89faa8ce59b  20261107150000_m1_9_first_store_bootstrap.sql
22147a8eff87b903072fc6c237b6d98fc9ccc4140e025a5d212634cea1f3d753  20261108040000_m3_merchant_sales_history_immutable.sql
a71c075d39a92303528736eb7c879f3cf7ff54bc937ab5b1cd98dea9b1880c24  20261108160000_merchant_planning_inputs_v1.sql
b17a9f393d738c27ea360d5820da8dbce0ebaa653f879f4cd13ca71700f2882f  20261108170000_planning_evidence_binding_v1.sql
6b84f8f15b601a4adf5643c0d4b756b4275031ed1bdccd435495a15738d2c15e  20261108180000_trusted_incoming_evidence_v1.sql
2be10c6943be4464e9d3865b7c16196db6d6f3efdaa5f9839eff9b9d6d9502a1  20261109120000_pb1e_attestation_freshness_invalidation.sql
664b0577c19d312fdf597af98e4789110b261c25058f550b4096ad15a7c0e822  20261110120000_pb1h41_supplier_products_org_variant_serialization.sql
d7c506197d1947eed416247cfea6753320009b17a9e786757e219530504686ee  20261110130000_pb1h42_metric_grain_enqueue_serialization.sql
6b02e2853e45648b3809fae8a857bbee10f661b66e6ed6cc78dcbbfcc562ed69  20261110140000_pb1h43_create_evidence_fence_scaffold.sql
```

---

## Next milestones (not authorized by this closeout)

1. PE1.b.6b LIMITED JWT isolation proof (owner gates A3→A4→A6→A1) — still UNPROVEN
2. Workers / cron / HTTP metric or forecast enablement — OFF unless separately authorized
3. M7 production create unlock / merchant-approvable success — **BLOCKED** until PB1 fencing proven
4. Purchasing / approval-gated buying — disabled

Paying-customer launch remains **NO-GO**.
