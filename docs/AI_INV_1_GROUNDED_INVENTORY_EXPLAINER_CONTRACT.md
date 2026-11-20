# AI-INV-1 — Grounded Inventory Explainer Contract

**Document ID:** AI-INV-1-CONTRACT
**As-of:** 2026-11-20
**Mode:** Offline / mock-backed, read-only. **Not** live model authorization, M6/M7 unlock, or purchasing.

---

## 1. Thesis

Deterministic server evidence owns every numeric fact. AI (when enabled) may only summarize allowlisted evidence into merchant prose. Missing evidence → abstain. Invented numbers, actions, forecasts, ROQ, savings, confidence, or supplier facts → reject.

## 2. Scope

| In | Out |
|---|---|
| Fixed contextual questions on SKU inspector | Free-form chatbot / agent tools |
| Org/store/location/variant/SKU evidence DTO | Client-supplied facts as authority |
| Offline stub / recorded-replay adapters | Live provider network calls |
| Schema-validated answers + citations | DB writes, auto REORDER/REDUCE/PROMOTE/WATCH |
| Per-org soft budget + evidence-hash cache | Hosted JWT / workers / SyncRun |

## 3. Allowlisted questions

| Id | Merchant label |
|---|---|
| `why_flagged` | Why is this SKU flagged? |
| `sales_rate_meaning` | What does this sales rate mean? |
| `cover_unavailable` | Why is stock cover unavailable? |
| `missing_data` | What data is missing? |
| `verify_before_replenishing` | What should I verify before replenishing? |

## 4. Evidence DTO (server-owned)

Built only from authenticated membership + `loadMerchantInventoryIntelligence` row (+ planning / incoming attestation presence). Client may pass grain keys for lookup; never tenant IDs as sole authority.

Required groups:

- Identity grain (org, store, location, variant, sku)
- Observed stock + observedAt (unknown ≠ zero; stale ≠ current)
- Velocity / eligible days / window (zero demand ≠ unknown demand)
- Cover status + days when calculable
- SS / ROP / target with reason-code provenance (thresholds ≠ buy qty)
- Saved planning assumptions (explicit null stays unknown)
- Incoming trust class: `unknown` \| `attested_complete` \| `trusted_po_presence` (provider-observed ≠ trusted PO)
- Missing evidence labels + deterministic next-step code
- `evidenceHash` (reproducibility / cache only — not auth)

## 5. Answer contract

```
{
  schemaVersion: "inventory-explainer-answer-v1",
  questionId,
  status: "answered" | "abstained" | "rejected" | "unavailable",
  merchantAnswer,          // concise first
  abstentionReason?,
  citations: [{ factId, label, value, source, asOf? }],
  nextSteps: [{ code, label }],  // allowlisted codes only
  evidenceHash,
  generator: "deterministic" | "ai_validated" | "fallback_deterministic",
  diagnostics: privacy-safe only
}
```

## 6. Validation law

- Every number / date in prose must appear in allowlisted citation values (normalized).
- Forbidden tokens: REORDER/REDUCE/PROMOTE/WATCH as action verbs; buy/purchase/order now; stockout date; ROQ; savings/$/ROI; confidence %; supplier MOQ/LT inventions.
- Prompt-injection in product titles must not alter facts or next steps.
- Cross-org / missing membership / missing `inventory.read` → deny (no evidence leak).

## 7. Enablement

- `STOREAGENT_INVENTORY_EXPLAINER_ENABLED` default unset/false
- `STOREAGENT_INVENTORY_EXPLAINER_ORG_ALLOWLIST` empty by default
- Distinct from Actions `STOREAGENT_AI_EXPLANATION_*`
- Client flags never trusted
- Soft-enable may attempt offline stub polish; fail-closed → deterministic

## 8. Cost / rate

- Bound input/output tokens; timeout wall-clock
- In-memory per-org daily token soft budget (process-local; not durable ledger)
- Cache identical `(org, grain, questionId, evidenceHash)` answers
- Safe logging: no secrets, no raw PII beyond already-displayed sku/title length caps

## 9. Exit (offline)

Golden Q&A, abstention, hallucination rejection, injection, tenant isolation, budget/timeout, SKU inspector regression — no live AI/network/DB writes required.

## 10. AI-INV-1.1 guidance upgrade

- Situation classifier distinguishes recorded OOS + positive sales, in-stock zero sales, short history, stale/pending, unknown stock/demand, missing metrics, low/high cover.
- Next steps are prioritized **1–3** and situation-specific (not a generic identical list).
- Zero-sales hypotheses are labeled **untested** — never confirmed causes.
- AI validator rejects unsupported causal/popularity/financial assertions even when numbers match evidence literals; structural constants are not freely allowed unless present in the grain allowlist.
- UX ranks contextual questions per SKU; evidence/provenance stay progressive disclosure.
