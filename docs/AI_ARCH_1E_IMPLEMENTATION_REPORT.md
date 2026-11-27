# AI_ARCH_1E_IMPLEMENTATION_REPORT

**Slice:** Guarded Merchant Intelligence UX · thin structured-intent entry in SKU Intelligence Inspector
**Principle:** *The AI controls the investigation. It does not control what counts as a fact.*
**DoD:** `LOCAL_COMPLETE` · schema-neutral · activation **OFF** · Git checkpoint **pending**
**Final acceptance:** `docs/AI_ARCH_1E_FINAL_ACCEPTANCE_REPORT.md` (fixture visual **PASS** · live soft-enable browser **NOT EXECUTED**)

---

## A. Baseline and exact changes

| Field | Value |
|---|---|
| Verified HEAD (pre-1e tip) | `d56de33` — AI-ARCH-1a–1d CLOSED/PUSHED |
| Prior continuity | DOC-CONTINUITY-6 closed @ `d12fd04`; AI-ARCH-0 design PROPOSED |
| Migrations | **57 local / 57 hosted** (unchanged; prior DEPLOYED_VERIFIED evidence) |
| Post-catalog | **23/23 PASS** (prior) |
| Activation | **OFF** (OAuth / workers / cron / SyncRun / credentials / live AI) |
| Staging | Dirty/untracked protected set preserved; **no** Git stage/commit/push |

**Added**
- `lib/commerce-agent/intents.ts`
- `lib/commerce-agent/merchant-response.ts`
- `lib/commerce-agent/merchant-investigation.ts`
- `lib/commerce-agent/authorized-l1-deps.ts`
- `lib/commerce-agent/client-request.ts`
- `lib/commerce-agent/actions.ts`
- `components/inventory/sku-commerce-agent-panel.tsx`
- `tests/unit/ai-arch-1e-guarded-merchant-intelligence-ux.test.ts`
- `docs/AI_ARCH_1E_IMPLEMENTATION_REPORT.md`
- `docs/AI_ARCH_1E_FINAL_ACCEPTANCE_REPORT.md`

**Modified**
- `lib/commerce-agent/index.ts` (1e re-exports; no server-only deps in barrel)
- `components/inventory/sku-intelligence-inspector.tsx`
- `components/inventory/inventory-intelligence-workspace.tsx`
- `app/(app)/app/[organizationId]/inventory/page.tsx`
- `.env.example` (documented `STOREAGENT_COMMERCE_AGENT_*`, still default OFF; no real env enablement)
- `tests/unit/ai-arch-1e-guarded-merchant-intelligence-ux.test.ts` (acceptance: zero-load denial asserts)
- Continuity docs: master handoff, living ledger, status pointer, PROJECT_HANDOFF, AI roadmap pin, November plan pin

**Not modified:** M5–M7 engines, AI-INV engines, PB1, Actions redesign, migrations, hosted ops, protected dirty files (`BACKGROUND_JOBS.md`, `SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, deleted roadmap DOCX, `.tmp/` harness artifacts, `.vitest/`, operator scripts, archives).

---

## B. UX integration

| Item | Behavior |
|---|---|
| Placement | Inside existing SKU Intelligence Inspector, after AI-INV explainer |
| Intents | `inventory_fact` / `zero_sales_diagnosis` / `data_gap` / `reorder_review` with merchant labels |
| Visibility | Server `mayRunCommerceAgent` on inventory page → `commerceAgentVisible` (default hidden) |
| Honesty | Verified findings, labeled estimates/hypotheses, missing/uncertainty, provenance/as-of, coverage, generator, abstention, approval boundary; no buy/create CTA |
| Stale isolation | `clientRequestId` + grain/intent match; panel remounts on `key={row.grainKey}` |
| Layout | Spacious responsive intent grid; `min-h-11` targets; focus-visible rings; loading/error/empty/abstention states |

No global chatbot, no new dashboard, no duplicate intelligence engine, no Actions redesign.

---

## C. Security gates

| Gate | Enforcement |
|---|---|
| Identity | `requireAppIdentity` |
| Membership | `resolveServerOrganizationContext` |
| Permission | `inventory.read` |
| Grain | Exact org/store/location/variant UUID + membership-scoped row proof |
| Enablement | `STOREAGENT_COMMERCE_AGENT_ENABLED` ∧ org allowlist at **UI** and **server**; reject before evidence load / tool calls |
| Browser IDs | Untrusted selectors only; trusted context built server-side |
| Forbidden client overrides | No `forceEnabled` / `config` / `draftAdapter` / `deps` / `planOverride` on action input |
| Runtime | `runCommerceAgent` only; offline/deterministic default; no live provider; no public API route |
| DTO | Merchant-safe serialization — no traces, allowlists, adapters, or internal enablement surfaces |
| Side effects | No buy / create / approve / SyncRun / OAuth / workers |

---

## D. Tests and verification (actual)

| Check | Result |
|---|---|
| Vitest AI-ARCH-1a–1d | **62/62 PASS** |
| Vitest AI-ARCH-1e focused | **14/14 PASS** |
| Combined 1a–1e | **76/76 PASS** |
| AI-INV + inspector related | **PASS** (included in related suite run) |
| `tsc --noEmit` | **PASS** |
| ESLint (1e surfaces) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` (1e paths) | **PASS** |
| Migration count | **57** local (unchanged) |
| Isolated fixture browser matrix 375/768/1280/1440/2560 | **PASS** — evidence `.tmp/ai-arch-1e-accept/artifacts/` |
| Live soft-enable inventory / FE-ACCEPT auth browser | **NOT EXECUTED** (activation forbidden; FE-ACCEPT auth empty) |
| Hosted / live AI / paid calls | **NOT EXECUTED** (forbidden) |

---

## E. Activation and migration status

| Item | Status |
|---|---|
| Soft-enable | Default **OFF** |
| Live LLM / SDK / web search | **None** |
| OAuth / SyncRun / workers / cron | **OFF** |
| Local / hosted migrations | **57 / 57** — no new files · prior hosted evidence retained |
| DoD | AI-ARCH-1e **`LOCAL_COMPLETE`** · activation **OFF** · **Git checkpoint pending** |

---

## F. Remaining limitations

- Soft-enable stays OFF until separately authorized; UI hidden by default.
- Offline/deterministic path only; no live provider polish in merchant UX.
- No durable audit/credit tables; no NL free-form chat.
- Explain-only recommendations; M7 create/buy still blocked.
- Live authenticated soft-enable inventory browser cert **not** run (fixture injection used instead).
- Hosted JWT / binding / CONN-1 exit unchanged (**UNMET** / **NOT_YET_VERIFIED**).

---

## G. GO / NO-GO

| Decision | Verdict |
|---|---|
| Local eng + fixture visual acceptance | **GO** (`LOCAL_COMPLETE`) |
| Owner Git checkpoint (allowlist only) | **GO** — see final acceptance report §5–6 |
| Feature activation / env enablement | **NO-GO** (default OFF; owner gate) |
| Hosted ops / migrations / unsolicited Git push | **NO-GO** |
| Start AI-ARCH-1f | **NO-GO** until owner review |

**Next:** AI-ARCH-1f (evaluation pack expansion) — owner-gated only.

**STOP FOR OWNER REVIEW.** No Git stage/commit/push. No hosted operations.
