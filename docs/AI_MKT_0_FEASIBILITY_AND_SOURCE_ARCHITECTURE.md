# AI-MKT-0 — Market Intelligence Feasibility, Data Rights & Source Architecture

| Field | Value |
|---|---|
| Document ID | AI-MKT-0-FEASIBILITY-AND-SOURCE-ARCHITECTURE |
| Slice | **AI-MKT-0** |
| DoD | **`LOCAL_COMPLETE`** (docs/design only) |
| As-of | 2026-11-27 (Asia/Dubai) |
| Actual HEAD (verified at authoring) | `c216ded` — `docs(ai-arch): fix 1f report whitespace` |
| Full SHA | `c216ded57de7d8e41780646f3f8ebb31badaa8cb` |
| `origin/main` | **Aligned** at tip (tracking; **no CI claim**) |
| Mode | Documentation / design feasibility — **not** application implementation, provider execution, hosted ops, billing, or activation |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_ARCH_0_TECHNICAL_DESIGN.md` · `docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md` · `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` · `lib/commerce-agent/types.ts` · master handoff |

---

## 0. Boundaries and non-claims

**Authorized this slice:** feasibility, data-rights review from **public official documentation/terms** (read-only), country/category assessment, evidence-authority design, provider-independent architecture proposal, security/privacy design, commercial modeling with labeled assumptions, MVP GO/CONDITIONAL/NO-GO recommendations, AI-MKT-1 offline acceptance definition.

**Forbidden this slice:** app/`lib`/test runtime changes; migrations; dependencies; env edits; live AI/search API calls; OAuth; SyncRun; vault; workers/cron; billing; purchases; scraping; creating accounts/subscriptions; paid calls; activation; reopening 57/57 migration sync or completed AI-ARCH slices; Git writes.

**Prior evidence preserved (not re-run):** AI-ARCH-1a–1f **CLOSED/PUSHED** @ `c216ded` (1a–1d `d56de33`; 1e `1c75de5`; 1f through `c216ded`); offline eval **38/38**; AI-ARCH Vitest **121/121**; AI-INV **27/27**; soft-enable **OFF**. CONN-1 exit **UNMET**; V8 hosted JWT **NOT VERIFIED**; binding **`NOT_YET_VERIFIED`**; D13/D14 **DEFERRED**.

**Verification method note:** Source/rights/pricing cells cite public docs fetched **read-only** on **2026-11-27**. Claims not confirmed from those docs are marked **`UNKNOWN`**. Unresolved licensing requires **owner/legal review** — this document is **not** legal advice and **not** a license grant.

---

## 1. Merchant use cases (prioritized)

Priority score = **merchant value** × **evidence availability** × **commercial feasibility** (rights + cost + coverage). Scores are design judgments, not ROI claims.

| Rank | Use case | Merchant question | Primary evidence needed | Value | Evidence avail. | Commercial feasibility | MVP stance |
|---|---|---|---|---|---|---|---|
| 1 | **SKU / country research (bounded)** | “What do public sources say about this product class in country X?” | Sourced web snippets, listings descriptions, public reviews, search-interest *proxies* | High | Medium (web grounding) | Medium–High (adapter + credits) | **MVP primary** |
| 2 | **Zero-Sales Detective (internal-first)** | “Why might this in-stock SKU show zero sales?” | Internal M5/AI-INV situations + *optional* external hypotheses | High | High internal; low external causal | High if internal-first | **MVP primary (internal)**; external optional later |
| 3 | **Product / color / variant opportunity** | “Which variant/color/country looks promising to investigate?” | Comparative search interest, public assortment breadth, own sell-through | High | Medium (proxies only) | Medium | **CONDITIONAL** after #1 |
| 4 | **Seasonality / future buying intelligence** | “Is demand seasonal? What should I watch before buying?” | Own history + labeled external seasonality proxies | High | Medium–Low externally | Medium | **Deferred** deep; light proxy OK later |
| 5 | **Competitor / customer sentiment (COMP-1)** | “What are competitors and customers saying?” | Public reviews, competitor public pages (licensed/API/permitted) | High | Low–Medium; rights fragile | Low–Medium | **COMP-1**; not AI-MKT-1 MVP |

### Use-case notes

1. **SKU/country research** delivers the clearest credit-gated merchant value without inventing sales: show *sourced signals* with claim classes, match quality, and abstention.
2. **Zero-Sales Detective** must stay **internal-first** (AI-INV-1.1 situations + AI-MKT-2). External research may only add **labeled hypotheses**, never “confirmed causes.”
3. **Opportunity / seasonality** may use proxies only; opportunity ≠ guaranteed demand; search interest ≠ units sold.
4. **Competitor sentiment** is high value but higher legal/scraping risk → separate **COMP-1** after rights gates; no scraping without rights.

---

## 2. Source feasibility matrix

**Legend for rights columns:** `OK` = public docs appear to permit the described SaaS pattern under stated conditions · `CONDITIONAL` = permitted with strict UI/retention/attribution constraints · `RESTRICTED` = generally unsuitable for StoreAgent multi-tenant derived indexes · `UNKNOWN` = not verified from public docs · `LEGAL` = owner/legal review required before product commitment.

### 2.1 OpenAI Responses API + `web_search`

| Dimension | Assessment | Evidence / notes |
|---|---|---|
| Supported signals | Web-sourced answers with URL citations; optional domain allow/block filters; search/open_page/find_in_page actions on reasoning models | Docs: [Web search](https://developers.openai.com/api/docs/guides/tools-web-search) (verified 2026-11-27) |
| Country / category coverage | Broad web coverage; **not** a commerce catalog. Country support for *API access* is a separate OpenAI supported-countries list — product geography ≠ API residency. Category coverage = whatever public web contains → **UNKNOWN** for UAE/SA retail depth | Supported countries link in Business Terms glossary; retail-category completeness **UNKNOWN** |
| Access method | Server-side Responses API; tool `{ "type": "web_search" }`; **no** execution in AI-MKT-0 | Same docs |
| Commercial rights | Business/API use governed by **OpenAI Services Agreement (Business Terms)**; Customer owns Output; OpenAI does **not** use Customer Content to improve Services unless Customer opts in | [Business Terms](https://openai.com/policies/business-terms/) §§2.2, 4.1–4.2 (verified 2026-11-27). Consumer ToU is **not** the API authority |
| SaaS redistribution / derived output | Building Customer Applications for End Users is contemplated. Restrictions include: no competing-model training from Output (with Permitted Exception); no unauthorized data extraction; Customer responsible for Output accuracy and third-party rights in sources | Business Terms §§3.3, 4.3. **Cited web page content** remains subject to **third-party site rights** — OpenAI Output ownership ≠ license to republish third-party pages |
| Attribution | Docs require **inline citations as prominent clickable links** when displaying web results | Web search guide |
| Caching / retention | OpenAI deletes Customer Content within **30 days** after termination (legal exceptions). Product-side caching of *search-derived claims* for merchant history: **CONDITIONAL / LEGAL** — not forbidden by Business Terms text reviewed, but third-party content rights + StoreAgent minimization still apply | Business Terms §11.3 |
| Model-processing permissions | Paid Business path: OpenAI will **not** use Customer Content to develop/improve Services unless Customer explicitly agrees | §4.2 |
| Freshness | Live web when `external_web_access` true; offline/cache-only mode available | Web search guide |
| Reliability | Probabilistic synthesis; citations help but do **not** prove sales/units | Accuracy caveats inherent; treat as `sourced_signal` |
| Pricing (documented) | Web search: **$10.00 / 1k calls** + search content tokens at model rates. Preview (non-reasoning): **$25.00 / 1k** with free search content tokens. Some mini models: fixed **8,000** search-content input tokens/call | [Pricing](https://developers.openai.com/api/docs/pricing) (verified 2026-11-27) |
| Limitations | Not verified sales; rate limits; domain filters ≠ allowlist of licensed commerce DBs; must not invent competitor units/ROAS | — |
| **Gate** | **CONDITIONAL GO** for AI-MKT adapter design (primary candidate) — live spend **NO-GO** until AI-MKT-1.1 + security gates | |

### 2.2 Gemini API — Grounding with Google Search

| Dimension | Assessment | Evidence / notes |
|---|---|---|
| Supported signals | Grounded answers + URL citation annotations + Search Suggestions HTML | [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) (verified 2026-11-27) |
| Country / category coverage | Docs claim grounding works with **all available languages**; retail category depth per country **UNKNOWN** | Same |
| Access method | `google_search` tool on Gemini API / Interactions API | Same |
| Commercial rights | Gemini API Additional Terms — Grounding section is **strict** | [Gemini API Additional Terms](https://aistudio.google.com/docs/terms) (effective date on page: March 23, 2026; verified 2026-11-27) |
| SaaS redistribution / derived output | **RESTRICTED for StoreAgent evidence warehouse pattern:** may only display Grounded Results **with associated Search Suggestions** to the **end user who submitted the prompt**; **must not** cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results/Search Suggestions (narrow exceptions) | Additional Terms — Grounding Use Restrictions |
| Attribution / UI | Must show Search Suggestions with Grounded Results; limited modification of results | Same |
| Caching / retention | Default: **no cache**. Allowed exceptions include: store Grounded Result **text** up to **2 years** for (1) display evaluation/optimization, (2) **that end user’s chat history**, (3) temporary refine-via-function-call; legal retention; end-user personal copy without building a database. Google stores prompts/context/output **30 days** for grounding debug/testing | Same |
| Model-processing | Paid Services: Google does **not** use prompts/responses to improve products (DPA path); grounding still stores 30 days for grounding systems | Additional Terms — Paid Services + Grounding data |
| Freshness | Real-time Google Search | Docs |
| Reliability | Grounded ≠ sales-verified; multiple queries may fire per prompt | Docs |
| Pricing (documented) | Gemini **3+**: 5,000 free search requests/month then **$14 / 1k** search requests; default **1,500 RPD**/project on Developer API. Gemini **2.5**: free RPD then **$35 / 1k grounded prompts**. Billing can exceed visible `google_search_call` queries | [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) + grounding docs (verified 2026-11-27) |
| Limitations | Cross-tenant evidence reuse / org-level research cache / shared opportunity indexes appear **incompatible** with “no cache / no analyze / end-user-only display” without **LEGAL** carve-outs. UX must render Search Suggestions | — |
| **Gate** | **CONDITIONAL** as **fallback UX-synchronous** grounding only — **NO-GO** as primary durable evidence store / cross-session research cache without legal waiver | |

### 2.3 Authorized marketplace APIs (merchant-owned)

| Source | Signals | Coverage | Access | Rights / SaaS | Gate |
|---|---|---|---|---|---|
| **Shopify Admin / merchant scopes** | Merchant’s own products, inventory, orders, analytics (when scopes granted) | That merchant’s stores only | OAuth + scopes (CONN path) | Merchant Data for **that merchant’s Application services**; no systematic harvesting / commerce index; AI training restrictions without consent ([Shopify API Terms](https://www.shopify.com/legal/api-terms), verified 2026-11-27) | **GO** for *internal* evidence (already AI-ARCH/M5 path). **NO-GO** as competitor market DB. Live OAuth still **OFF** |
| **Shopify Catalog / Global Catalog** | Shopper product discovery | Catalog products | Catalog APIs | Shopper experiences only; short cache TTLs; **no** bulk harvest, training, redistribution ([Catalog guidelines](https://shopify.dev/docs/agents/catalog)) | **NO-GO** for AI-MKT merchant intelligence warehouse |
| **Amazon SP-API (authorized seller)** | Seller’s own listings, pricing helpers, orders | Amazon marketplaces the seller is authorized for | Developer registration + seller auth | AUP: no cross-Authorized-User aggregation to sell insights; no promoting non-Amazon data services vending Amazon site data; seller-support use | **CONDITIONAL** after Amazon connector contract — merchant-own only; **NO-GO** for cross-merchant competitor sales |
| **Noon / other GCC marketplaces** | **UNKNOWN** without partner docs | UAE/SA relevant | Partner APIs **UNKNOWN** | **UNKNOWN / LEGAL** | **NO-GO** until partner terms reviewed |
| **WooCommerce** | Merchant store data | That store | Merchant credentials | Merchant-owned; StoreAgent adapter path | Same as Shopify-own: internal **GO** design-wise; live still gated |

### 2.4 Licensed datasets

| Dimension | Assessment |
|---|---|
| Candidates | Nielsen/ Circana-class retail, Euromonitor, Statista enterprise, licensed review corpora, licensed keyword volumes |
| Rights | Typically **contract-specific** redistribution, derived-output, and SaaS display rights — **LEGAL** per vendor |
| Pricing | Enterprise; **UNKNOWN** without quotes — do not invent |
| MVP | **Deferred** — pursue only if owner prioritizes paid data after AI-MKT-1.1 |
| Gate | **NO-GO for MVP**; **CONDITIONAL** later with signed license |

### 2.5 Permitted trend / search-interest sources

| Source | Assessment | Gate |
|---|---|---|
| **Google Trends (website export/embed)** | Help says reuse subject to Google ToS with **attribution** ([Trends Help](https://support.google.com/trends/answer/4365538), verified 2026-11-27). Automated bulk harvest / permanent DB / SaaS resale of Trends series: **UNKNOWN / LEGAL**. Search interest ≠ sales | **CONDITIONAL** manual/light use only after legal; **NO-GO** scrape-based pipeline |
| **Google Trends API (alpha)** | Limited tester access ([Search Central blog](https://developers.google.com/search/blog/2025/07/trends-api)); commercial ToS for StoreAgent **UNKNOWN** | **NO-GO** until access + terms approved |
| **Ad-platform keyword planners** | Often ToS-restricted; CREATIVE-0 territory | Defer to **CREATIVE-0** |

### 2.6 Competitor public information

| Approach | Assessment | Gate |
|---|---|---|
| Public pages via **licensed search adapters** (OpenAI/Gemini) with citations | Treat snippets as `sourced_signal`; never invent units/revenue | **CONDITIONAL** under adapter rights + claim class |
| Direct scraping / bots | High ToS/legal risk; StoreAgent policy forbids unauthorized scraping | **NO-GO** |
| Licensed review/sentiment vendors | Contract-dependent | Deferred **COMP-1** |

### 2.7 Merchant-owned analytics & supplier data

| Source | Signals | Rights | Gate |
|---|---|---|---|
| StoreAgent M5/M6/M7 + AI-INV evidence | Observed sales, cover, situations | Tenant-owned under StoreAgent tenancy | **GO** (canonical) |
| Merchant-uploaded CSV / planning inputs | Cost, lead time, assumptions | Merchant-provided; provenance required | **GO** with trust classes |
| Supplier quotes (Supplier Intelligence V1) | Stated terms | Merchant/supplier provided; no auto-buy | Later; not AI-MKT-0 MVP |

### 2.8 Matrix summary (GO / CONDITIONAL / NO-GO)

| Source | MVP research role | Verdict |
|---|---|---|
| OpenAI `web_search` adapter | **Primary** external research candidate | **CONDITIONAL GO** (design); live **NO-GO** until 1.1 + gates |
| Gemini Search grounding | **Fallback** UX-sync only; weak durable cache | **CONDITIONAL** (UX) / **NO-GO** (warehouse) |
| Merchant-owned store analytics | Internal spine | **GO** |
| Amazon/Noon public competitor harvest | — | **NO-GO** |
| Shopify Catalog as market DB | — | **NO-GO** |
| Licensed panel datasets | Deferred | **NO-GO** MVP |
| Trends scrape / unlicensed API | — | **NO-GO** |
| Unauthorized scraping | — | **NO-GO** |

---

## 3. Country / category feasibility

**Candidates assessed (no launch commitment):** UAE (AE), Saudi Arabia (SA), United Kingdom (GB), United States (US), plus roadmap awareness of other GCC/EU markets.

| Market | English/web evidence density (design judgment) | Local marketplace API readiness for StoreAgent | Currency / unit notes | Recommendation |
|---|---|---|---|---|
| **US** | High public-web density for many categories | Shopify-first path; Amazon SP-API later gated | USD | Strong coverage; **not** required for smallest MVP |
| **UK** | High | Same | GBP | Same |
| **UAE** | Medium — English retail web exists; Arabic content common; Noon/Amazon.ae depth **UNKNOWN** without partners | Noon partner **UNKNOWN**; Shopify merchants possible | AED; VAT norms **UNKNOWN** for claims | **Preferred ICP geography for product narrative**; evidence via web adapters + merchant-own data |
| **Saudi Arabia** | Medium–Lower public English density; Arabic important | Similar | SAR | Phase after AE patterns proven |
| Other | Do not assume global support | — | — | Explicit allowlist only |

### Smallest viable launch geography / category (recommendation)

| Dimension | Recommendation | Rationale |
|---|---|---|
| Geography allowlist (MVP design) | **`AE` primary**; optional **`US`/`GB`** as *evidence-rich* sandbox countries for offline fixtures — **not** a production launch commitment | Balances ICP (GCC) with web-signal availability; avoids pretending Noon/Amazon.ae APIs exist |
| Category allowlist (MVP design) | **1–2 merchant categories** with clear public SKU naming (example classes: home/kitchen small durables **or** beauty accessories) — exact category chosen per design partner, not global catalog | Improves match quality; reduces ambiguous apparel size/color collisions |
| Language | English-first research prompts/results; Arabic **CONDITIONAL** later with localization QA | Adapter language support ≠ StoreAgent UX readiness |
| Explicit non-commit | No “we support all countries”; unsupported country → `UNSUPPORTED_GEO` abstention | Fail closed |

**Do not** treat this section as authorization to market “UAE launch.”

---

## 4. Evidence authority

### 4.1 Claim / signal taxonomy (extends AI-ARCH)

| Class | Meaning | May drive buy advice? |
|---|---|---|
| `observed_fact` | Tenant-scoped measurement from StoreAgent engines/loaders | Yes, subject to freshness/PB1 |
| `engine_calculation` | Deterministic M5/M6/M7 math | Yes (numeric authority) |
| `sourced_signal` | External licensed/authorized retrieval with provenance | **No** as sales proof |
| `estimate` | Numeric approximation explicitly labeled; method cited | No without human accept |
| `hypothesis` | Untested explanation | Never as fact |
| `conflict` | Divergent evidence recorded | Force uncertainty / abstain on merge |
| `unavailable` / `unknown` | Missing; **unknown ≠ zero** | Abstain |

### 4.2 Hard non-equivalences

| Signal | Must not be treated as |
|---|---|
| Search interest / Trends index | Verified units sold or revenue |
| Marketplace Best Sellers rank | Verified sell-through for merchant |
| Star ratings / review counts | Demand volume or conversion rate |
| Competitor public price | Competitor margin or units |
| LLM narrative without citation | Any fact class |
| Opportunity score | Guaranteed future demand |

### 4.3 Matching, independence, freshness, normalization, abstention

| Concern | Rule |
|---|---|
| Product / variant match | Require structured match attempt: GTIN/barcode > brand+MPN > normalized title+attributes. Emit `matchQuality`: `exact` \| `partial` \| `mismatch` \| `unknown`. Mismatch → do not compare |
| Country match | Research `countryCode` must equal resolved merchant context country (or explicit multi-country request). Else `UNSUPPORTED_GEO` / abstain |
| Source independence | Prefer ≥2 independent source systems before elevating confidence class; correlated mirrors ≠ independence |
| Confidence | Ordinal only (`low`/`medium`/`high`) derived from matchQuality + freshness + independence + licenseOk — **never** a fake probability of sales |
| Freshness | `retrievedAt`, optional `observationPeriodStart/End`, `freshnessClass`. Stale external signals cannot unlock reorder |
| Currency / units | Normalize to ISO currency + explicit unit; never silently convert with unknown FX. If FX used later: cite rate source + timestamp or abstain |
| Conflicts | Record `conflictIds`; do not average ranks/prices into a fake consensus |
| Abstention | Prefer safe abstention over invented fill (`INSUFFICIENT_EVIDENCE`, `LICENSE_DENIED`, `MATCH_AMBIGUOUS`, etc.) |

---

## 5. Provider-independent design (docs-only DTOs)

Extend the existing **Commerce Decision Loop** and `lib/commerce-agent` evidence contracts. **Do not** duplicate M5–M7 engines or fork a second agent.

```text
UNDERSTAND → RESOLVE CONTEXT → PLAN → COLLECT → NORMALIZE → VALIDATE
→ ANALYZE → VERIFY → RESPOND → TRACK OUTCOME
```

External research plugs in at **COLLECT/NORMALIZE/VALIDATE** via allowlisted tools (future `market.*`) behind the same orchestrator bounds.

### 5.1 Components (conceptual)

| Component | Role |
|---|---|
| **Source registry / rights policy** | Versioned allowlist of `sourceId`, jurisdictions, permitted claim classes, retention TTL, attribution rules, cache eligibility, revocation flag |
| **Research adapters** | `openai_web_search_v1`, `gemini_search_grounding_v1`, `merchant_internal_v1` — normalize to one DTO; product code never binds to one SDK |
| **Bounded investigation** | Reuse AI-ARCH step/tool/deadline caps; add **credit reservation** hook (AI-MKT-1.1) before paid adapters |
| **Evidence normalization** | Map provider payloads → `EvidenceRecord` + research-specific fields |
| **Claim-level validation** | Existing draft validators + new rules: no sales-from-search; citation required for sourced_signal; licenseOk; matchQuality gates |
| **Safe synthesis** | LLM may draft over **verified** claims only; hypotheses labeled; fallback deterministic internal facts |

### 5.2 Prospective DTOs (documentation only — not implemented)

```typescript
/** AI-MKT prospective — docs only; not in lib/ yet */
export type ResearchDepth = "quick_lookup" | "standard" | "deep";

export type SignalClass =
  | "search_interest"
  | "public_listing"
  | "public_review"
  | "public_price"
  | "editorial"
  | "rank_proxy"
  | "other_sourced"
  | "merchant_internal";

export type SourceRightsClass =
  | "merchant_owned"
  | "provider_output_owned" // e.g. OpenAI Output assignment — still subject to third-party page rights
  | "display_only_no_cache" // e.g. Gemini Grounded Results pattern
  | "licensed_dataset"
  | "unknown_requires_legal";

export type MarketSourcePolicy = {
  schemaVersion: "market-source-policy-v1";
  policyVersion: string; // e.g. "2026-11-27.mkt0"
  sourceId: string;
  adapterId: string;
  rightsClass: SourceRightsClass;
  allowedCountries: readonly string[]; // ISO; empty = none
  allowedSignalClasses: readonly SignalClass[];
  attributionRequired: boolean;
  cacheEligible: boolean;
  maxRetentionDays: number | null; // null = no store beyond request
  modelTrainingConsentImplied: false; // always false — never implicit
  revocationAction: "purge_tenant_cache" | "block_adapter" | "both";
};

export type ResearchRequest = {
  schemaVersion: "market-research-request-v1";
  clientRequestId: string;
  organizationId: string; // from MerchantContext only
  storeId?: string;
  variantId?: string;
  sku?: string;
  countryCode: string;
  currencyCode?: string;
  categoryHint?: string;
  depth: ResearchDepth;
  intentClass: "market_opportunity" | "zero_sales_diagnosis" | "competitor_research";
  question: string; // merchant-facing; sanitized
  sourcePolicyVersion: string;
  maxCredits?: number; // reserved by AI-MKT-1.1
  allowAdapters: readonly string[]; // subset of registry
};

export type ResearchFailureCode =
  | "UNAUTHORIZED"
  | "TENANT_SCOPE_MISMATCH"
  | "UNSUPPORTED_GEO"
  | "UNSUPPORTED_CATEGORY"
  | "LICENSE_DENIED"
  | "SOURCE_REVOKED"
  | "BUDGET"
  | "CREDIT_RESERVATION_FAILED"
  | "PROVIDER_FORBIDDEN" // live path blocked
  | "SSRF_BLOCKED"
  | "TIMEOUT"
  | "TRANSIENT"
  | "MATCH_AMBIGUOUS"
  | "INSUFFICIENT_EVIDENCE"
  | "ATTRIBUTION_REQUIRED"
  | "CACHE_FORBIDDEN"
  | "PROMPT_INJECTION_SUSPECT";

export type ResearchProvenance = {
  sourceId: string;
  adapterId: string;
  providerRequestId?: string;
  sourceUrls: readonly string[]; // citation URLs
  retrievedAt: string; // ISO
  observationPeriodStart?: string;
  observationPeriodEnd?: string;
  attributionText?: string;
  searchSuggestionsRef?: string; // Gemini: opaque UI blob ref, not a warehouse key
  licenseOk: boolean;
  rightsClass: SourceRightsClass;
  sourcePolicyVersion: string;
};

export type ResearchEvidenceItem = {
  evidenceId: string; // stable within run; may map to EvidenceRecord.evidenceId
  claimClass: "sourced_signal" | "estimate" | "hypothesis" | "unknown";
  signalClass: SignalClass;
  label: string;
  value: string;
  unit?: string | null;
  countryCode: string;
  currencyCode?: string | null;
  matchQuality: "exact" | "partial" | "mismatch" | "unknown";
  freshnessClass: "current" | "stale" | "unknown";
  confidenceClass: "low" | "medium" | "high";
  provenance: ResearchProvenance;
  permittedFields: readonly string[]; // allowlist of fields safe to show/store
};

export type ResearchResult =
  | {
      ok: true;
      schemaVersion: "market-research-result-v1";
      requestId: string;
      organizationId: string;
      evidence: readonly ResearchEvidenceItem[];
      conflicts: readonly { conflictId: string; evidenceIds: readonly string[]; summary: string }[];
      abstentions: readonly { code: ResearchFailureCode; detail: string }[];
      creditSettlement?: "reserved" | "settled" | "refunded" | "not_applicable";
    }
  | {
      ok: false;
      schemaVersion: "market-research-result-v1";
      code: ResearchFailureCode;
      detail: string;
      creditSettlement?: "refunded" | "not_applicable";
    };
```

### 5.3 Mapping into existing `EvidenceRecord`

| Research field | `EvidenceRecord` field |
|---|---|
| `evidenceId` | `evidenceId` |
| `claimClass` | `claimClass` (`sourced_signal` / `estimate` / `hypothesis` / `unknown`) |
| `provenance.sourceId` | `sourceSystem` |
| citation URL | `sourceRef` |
| `retrievedAt` | `observedAt` / `asOf` |
| `organizationId` | `organizationId` |
| `matchQuality` / `freshnessClass` / `licenseOk` | same |
| `signalClass` | encode in `label` or future optional field — **do not** overload `claimClass` |

### 5.4 Tooling stance relative to L1

Current L1 forbids `web_search` / `market.*` (`lib/commerce-agent/tools/ids.ts`). AI-MKT-1 may introduce **separately enablemented** tools only after offline mocks + credits gates — never by silently expanding L1.

---

## 6. Security / privacy

| Control | Requirement |
|---|---|
| Tenant scope | `organizationId` / store / variant only from `MerchantContext`; cross-tenant research reuse **forbidden** |
| Data minimization | Send providers the minimum SKU/title/country needed; no vault secrets; no customer PII in research prompts |
| Prompt injection | Treat all external page text / reviews as **untrusted data**, not instructions; reuse AI-ARCH injection discard |
| Untrusted content | Strip tool-calling directives; never elevate to `observed_fact` |
| SSRF | Adapters use **provider-hosted** search tools only in MVP; no arbitrary merchant-supplied URL fetch without allowlist + SSRF defenses (CREATIVE/COMP later) |
| Provider egress policy | Explicit allowlist of provider endpoints; deny arbitrary egress from research workers |
| Secret handling | Provider API keys in server secret store only (future); never in evidence DTOs, traces to client, or logs |
| Retention / deletion | Honor source `maxRetentionDays`; tenant delete → purge research cache; Gemini paths may **forbid** shared cache |
| Source revocation | Policy version bump + `SOURCE_REVOKED` → block adapter + purge eligible caches |
| Training consent | **No implicit training consent.** Prefer paid API tiers that document non-training defaults (OpenAI Business §4.2; Gemini Paid Services). Document residual provider debug retention (e.g. Gemini grounding 30 days) |
| Isolation | No cross-tenant evidence leakage in caches, traces, or error messages |

CONN-1 exit / V8 JWT / binding remain **unmet** for production connector paths; they are **required before AI-MKT production use** that depends on live merchant channel context, but AI-MKT-1 **offline/mock** may proceed under separate auth without unlocking OAuth.

---

## 7. Commercial feasibility (assumptions labeled)

**No invented usage.** Figures below use **documented list prices** where cited, plus **clearly labeled ASSUMPTIONS** for token mix and depth.

### 7.1 Documented unit costs (2026-11-27)

| Provider | Meter | Documented price |
|---|---|---|
| OpenAI web_search | Per 1k search calls | **$10** (+ search content tokens @ model rates) |
| OpenAI web_search_preview (non-reasoning) | Per 1k calls | **$25** (search content tokens free) |
| Gemini 3+ Search | Per 1k search requests (after 5k free/mo) | **$14** |
| Gemini 2.5 Search | Per 1k grounded prompts (after free RPD) | **$35** |

### 7.2 Illustrative cost model (**ASSUMPTION** band)

Assumptions (explicit): (A1) OpenAI standard research uses 1–3 `web_search` calls/request; (A2) search-content + completion tokens add **$0.01–$0.15**/request depending on model (order-of-magnitude; **re-measure before pricing**); (A3) deep research may use reasoning model + more calls → **5–15×** standard; (A4) retries ≤1 transient; (A5) Gemini multi-query can bill **>1** search per merchant question.

| Depth | OpenAI order-of-magnitude COGS (**ASSUMPTION**) | Gemini order-of-magnitude COGS (**ASSUMPTION**) | Cache eligibility |
|---|---|---|---|
| Quick lookup | ~$0.01–$0.05 tool + tokens | ~$0.014+/query after free tier | OpenAI: CONDITIONAL tenant cache; Gemini: generally **no** shared cache |
| Standard | ~$0.03–$0.20 | ~$0.014–$0.05 if 1–3 queries | Same |
| Deep | ~$0.20–$2.00+ | Higher if many hidden queries; RPD cap risk | Prefer OpenAI for deep if caching/audit needed |

**Margin sensitivity:** Without AI-MKT-1.1 caps, a stuck loop or deep-research abuse can create **worst-case unbounded spend**. Worst-case design assumption: enforce hard per-org daily credit + per-request `maxCredits` **before** any live adapter.

### 7.3 Conceptual merchant credits (design only — no billing impl)

| Concept | Rule |
|---|---|
| Internal AI-ARCH / AI-INV Q&A | **0 research credits** |
| External research | Merchant confirm → **reserve** credits → settle/refund |
| Credit weights (**ASSUMPTION placeholders**) | quick=1 · standard=3 · deep=10 — tune after measured COGS |
| Cache hit | 0 or fractional credit if rights allow replay |
| Failure | Refund reservation |

Live paid research **NO-GO** until **AI-MKT-1.1** and applicable security gates.

---

## 8. Recommended MVP

### 8.1 Source / use-case selection

| Role | Choice |
|---|---|
| Primary external source | **OpenAI Responses `web_search` adapter** (provider-independent interface; CONDITIONAL rights) |
| Fallback external source | **Gemini Search grounding** for UX-synchronous answers **only** when Search Suggestions can be rendered; **not** for durable cross-session warehouse |
| Internal spine | Merchant-owned M5 + AI-INV evidence (**GO**) |
| First research use cases | (1) Bounded **SKU/country research**; (2) **Zero-Sales Detective** internal-first with optional external hypotheses |
| Geography / category | Allowlist **`AE`** (+ fixture **`US`/`GB`**); **1–2** categories; fail closed otherwise |
| Deferred | Licensed panels; Trends API; Noon; Amazon competitor aggregate; COMP-1 scraping; CREATIVE ad graphs; deep seasonality models |

### 8.2 GO / CONDITIONAL / NO-GO by source & use case

| Item | Verdict |
|---|---|
| AI-MKT-0 docs feasibility | **GO / LOCAL_COMPLETE** |
| OpenAI web_search as primary adapter *design* | **CONDITIONAL GO** |
| Gemini grounding as durable evidence DB | **NO-GO** |
| Gemini grounding as fallback live UX | **CONDITIONAL** |
| Merchant-own analytics | **GO** |
| SKU/country research MVP scope | **CONDITIONAL GO** (offline AI-MKT-1 first) |
| Zero-sales external “root cause confirmed” | **NO-GO** |
| Competitor sales invention | **NO-GO** |
| Live paid research before AI-MKT-1.1 | **NO-GO** |
| AI-MKT production without CONN/security reconcile | **NO-GO** |
| Start AI-MKT-1 without owner auth | **NO-GO** |

### 8.3 AI-MKT-1 offline acceptance (future — not started)

AI-MKT-1 remains **offline/mock** until separately authorized. Acceptance targets (prospective):

1. Research request/result DTOs + source policy registry **in code** with fixtures only (`supportsLiveNetwork=false`).
2. Adapter interface with **recorded_replay / offline_stub**; forbidden live egress tests PASS.
3. Normalization into `EvidenceRecord`; claim validation rejects search≠sales and license failures.
4. Orchestrator: `market.*` tools remain disabled under L1 soft-enable; separate research enablement flag default OFF.
5. Focused vitest pack: geo deny, cache-forbidden Gemini fixture, citation required, tenant isolation, injection in review text, budget/credit **stub** (no ledger yet).
6. No migrations for credits until AI-MKT-1.1; no provider keys required for offline.

### 8.4 Future live certification requirements (after 1.1 + gates)

1. AI-MKT-1.1 credit reserve/settle/refund + per-org caps + worst-case kill switch.
2. Paid provider accounts under Business/Paid terms; non-training defaults verified.
3. Attribution UI (OpenAI citations; Gemini Search Suggestions where used).
4. Egress allowlist + secret handling + retention/purge drills.
5. CONN-1 exit / V8 JWT / binding reconciled **before** production use that depends on live merchant channel context.
6. Measured COGS replaces ASSUMPTION bands; merchant credit weights recalibrated.
7. Country/category allowlist enforced server-side; adversarial live cert pack PASS.
8. Explicit owner authorization for first live spend.

---

## 9. Unresolved licensing / source questions (owner/legal)

1. Confirm OpenAI Business Terms + any **Service-Specific Terms** for displaying/caching **third-party cited page content** inside a multi-tenant SaaS research history.
2. Confirm whether any Gemini **written waiver** could ever allow tenant-level research cache; until then treat Gemini as display-only.
3. Google Trends automated commercial reuse for StoreAgent — **LEGAL**.
4. Noon / Amazon.ae partner data products for UAE competitive signals — **UNKNOWN**.
5. Licensed dataset shortlist + redistribution rights if owner wants non-web truth sources.
6. FX rate source policy for cross-currency opportunity views.
7. Arabic research UX + moderation requirements for AE/SA.

---

## 10. Sequence preservation

```text
AI-MKT-0 (this doc) → connectivity/security gates as applicable
→ AI-MKT-1 (offline/mock) → AI-MKT-1.1 (credits)
→ AI-MKT-2 → COMP-1 → AI-MKT-3 → CREATIVE-0…2 → AI-MKT-4 → LOOP-1
```

**STOP for owner review. Do not start AI-MKT-1 from this document alone.**

---

## 11. Governance addendum (permanent rule)

**Installed:** `.cursor/rules/commerce-intelligence-governance.mdc` (`alwaysApply: true`).

Encodes the StoreAgent Commerce Intelligence Governance principle and guardrails (deterministic M5–M7 authority, claim-level evidence, authorized sources with UNKNOWN→fail-closed, market provenance, honesty classes, bounds, future credits, tenancy, untrusted external content, provider independence, human approval, UX/a11y/localization, execution discipline).

**Non-duplication verified:**

| Concern | Authority |
|---|---|
| Migration local↔hosted DoD | `.cursor/rules/migration-synchronization-policy.mdc` only |
| Next.js agent framework notes | Protected `AGENTS.md` (unchanged) |
| AI-MKT source/MVP design | This document |
| L1 contracts / offline eval | AI-ARCH-0/1 docs + `lib/commerce-agent` |

### Implemented today vs future requirements

| Control | Status |
|---|---|
| Principle + L1 claim classes / validators / bounds / tenant resolution / injection discard / soft-enable OFF | **Implemented** in AI-ARCH-1 (offline); soft-enable remains **OFF** |
| Forbidden `web_search` / `market.*` on L1 allowlist | **Implemented** |
| Source registry, research DTOs, rights policy versioning | **Docs only** (this file §5) — code in AI-MKT-1+ |
| Live adapters, paid calls, durable credit ledger, authorized research cache | **Future** — AI-MKT-1 offline → AI-MKT-1.1 before paid; CONN/security before production market use |
| Cursor governance rule | **Installed** this addendum — agent guidance ≠ runtime enforcement |

Rules do **not** authorize AI-MKT-1, live providers, credits, or activation.

---

## 12. Checkpoint allowlist (owner Git when authorized)

Stage **only**:

```text
docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md
.cursor/rules/commerce-intelligence-governance.mdc
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

**Do not stage:** protected dirty/untracked set (`BACKGROUND_JOBS.md`, `SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, deleted roadmap DOCX, `AGENTS.md`, `.tmp/`, `.vitest/`, operator scripts, archives, SQL snippets, etc.). Preserve migration rule file; do not reopen 57/57 sync.

---

## 13. Status pin

| Item | Value |
|---|---|
| Slice | AI-MKT-0 (+ governance addendum) |
| DoD | **`LOCAL_COMPLETE`** |
| HEAD | `c216ded` |
| Migrations | **57/57** prior evidence (unchanged; not reopened) |
| Catalog | **23/23** prior |
| Activation | **OFF** |
| AI-ARCH-1 | **CLOSED/PUSHED** @ `c216ded` |
| Governance rule | `.cursor/rules/commerce-intelligence-governance.mdc` installed |
| Live research / AI-MKT-1 | **NO-GO** until separate authorization |
