/**
 * AI-MKT-1e — guarded merchant research (testable core).
 * Auth → membership → inventory.read → independent research enablement →
 * exact grain resolution → trusted target attributes → bounded 1d orchestration.
 *
 * Browser supplies identifiers + supported selections only.
 * Production paths never inject synthetic fixtures. Preview isolation is
 * ports-only (tests / local harness) — never request/env/public demo.
 */

import { buildTrustedMerchantContext } from "@/lib/commerce-agent/merchant-context";
import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { OpenAiOfflineFixtureId } from "@/lib/market-research/adapters/types";
import {
  getDefaultMarketResearchConfig,
  mayRunMarketResearch,
  readMarketResearchServerConfig,
  type MarketResearchServerConfig,
} from "@/lib/market-research/enablement";
import {
  getMerchantResearchCountryOption,
  isForbiddenResearchDepth,
  isMerchantResearchCountryCode,
  isMerchantResearchStructuredDepth,
  isMerchantResearchStructuredIntent,
  isUnsupportedMerchantResearchIntent,
  type MerchantResearchCountryCode,
  type MerchantResearchStructuredDepth,
  type MerchantResearchStructuredIntent,
} from "@/lib/market-research/merchant-intents";
import {
  assertMerchantResearchSafeDto,
  merchantResearchError,
  toMerchantResearchDto,
  type MerchantResearchDto,
} from "@/lib/market-research/merchant-response";
import { OPENAI_NORMALIZE_CONDITIONS } from "@/lib/market-research/normalize/pipeline";
import type { ProductMatchTarget } from "@/lib/market-research/normalize/types";
import {
  OPENAI_ANALYZE_CONDITIONS,
  OPENAI_RETRIEVE_CONDITIONS,
  runMarketResearchOrchestration,
  type RunMarketResearchOrchestrationInput,
} from "@/lib/market-research/orchestration";
import {
  assertProductionMarketResearchExecutionForbidden,
  detectForbiddenSyntheticEnvOverrides,
} from "@/lib/market-research/preview-isolation";
import {
  MARKET_ADAPTER_IDS,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_RESEARCH_REQUEST_VERSION,
  MARKET_SOURCE_IDS,
} from "@/lib/market-research/types";
import type { Permission } from "@/lib/tenancy/permissions";
import { permissionsForRole, roleHasPermission } from "@/lib/tenancy/permissions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MerchantResearchInput = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  intentClass: string;
  countryCode: string;
  depth: string;
  clientRequestId: string;
};

/**
 * Public action input must never accept these. Tests assert absence.
 */
export const FORBIDDEN_MERCHANT_RESEARCH_CLIENT_KEYS = [
  "forceEnabled",
  "allowSyntheticFixtures",
  "syntheticFixtureMode",
  "fixtureId",
  "config",
  "draftAdapter",
  "bounds",
  "licenseOk",
  "approval",
  "adapter",
  "deps",
  "organizationAllowlist",
  "targetProduct",
  "targetMetadata",
  "satisfiedRetrieveConditions",
  "satisfiedNormalizeConditions",
  "satisfiedAnalyzeConditions",
  "satisfiedDisplayConditions",
  "rightsConditions",
  "untrustedAuthority",
  "requestLiveNetwork",
  "claimActualSpend",
  "claimCredits",
] as const;

export type MerchantResearchIdentity = {
  userId: string;
};

export type MerchantResearchOrgContext = {
  organizationId: string;
  role: OrganizationMemberRole;
  countryCode?: string | null;
  currencyCode?: string | null;
};

/**
 * Preview isolation ports — production action never sets allowSyntheticFixtures.
 * Only local/test harnesses inject trusted fixtures through these ports.
 */
export type MerchantResearchPreviewPorts = {
  allowSyntheticFixtures: true;
  syntheticFixtureMode: true;
  fixtureId?: OpenAiOfflineFixtureId;
  registryKey?: string;
  satisfiedRetrieveConditions?: readonly string[];
  satisfiedNormalizeConditions?: readonly string[];
  satisfiedAnalyzeConditions?: readonly string[];
  draftAdapter?: RunMarketResearchOrchestrationInput["draftAdapter"];
  nowIso?: string;
  nowMs?: number;
  signal?: AbortSignal;
};

export type MerchantResearchPorts = {
  requireIdentity: () => Promise<MerchantResearchIdentity>;
  resolveOrganization: (
    identity: MerchantResearchIdentity,
    organizationId: string,
  ) => Promise<
    | { ok: true; context: MerchantResearchOrgContext }
    | { ok: false }
  >;
  /**
   * Membership-scoped intelligence for grain proof.
   * Invoked only after research enablement / preview gate passes.
   */
  loadIntelligenceRows: (
    organizationId: string,
  ) => Promise<readonly MerchantInventoryIntelligenceRow[]>;
  /** Default: readMarketResearchServerConfig(). Tests inject. */
  readConfig?: () => MarketResearchServerConfig;
  /**
   * Isolated preview injection. Production action MUST omit this.
   * When absent, orchestration never runs (zero adapter calls).
   */
  previewIsolation?: MerchantResearchPreviewPorts;
  /** Wall clock override for tests. */
  nowMs?: number;
  nowIso?: string;
  /** Optional abort for cancel tests. */
  signal?: AbortSignal;
  /**
   * When true (default for production action), refuse if forbidden env
   * synthetic overrides are present — fail closed.
   */
  enforceProductionEnvIsolation?: boolean;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function validateInput(
  input: MerchantResearchInput,
):
  | {
      ok: true;
      normalized: {
        organizationId: string;
        storeId: string;
        locationId: string;
        variantId: string;
        intentClass: MerchantResearchStructuredIntent;
        countryCode: MerchantResearchCountryCode;
        depth: MerchantResearchStructuredDepth;
        clientRequestId: string;
      };
    }
  | { ok: false; dto: MerchantResearchDto } {
  const organizationId = input.organizationId?.trim() ?? "";
  const storeId = input.storeId?.trim() ?? "";
  const locationId = input.locationId?.trim() ?? "";
  const variantId = input.variantId?.trim() ?? "";
  const intentRaw = input.intentClass?.trim() ?? "";
  const countryRaw = (input.countryCode?.trim() ?? "").toUpperCase();
  const depthRaw = input.depth?.trim() ?? "";
  const clientRequestId = input.clientRequestId?.trim() ?? "";

  if (
    !isUuid(organizationId) ||
    !isUuid(storeId) ||
    !isUuid(locationId) ||
    !isUuid(variantId)
  ) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "INVALID_INPUT",
        error: "A valid store, location, and variant are required.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (isUnsupportedMerchantResearchIntent(intentRaw)) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "UNSUPPORTED_INTENT",
        error:
          intentRaw === "competitor_research"
            ? "Competitor research is not available yet."
            : "Zero-sales market causality research is not available yet.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (!isMerchantResearchStructuredIntent(intentRaw)) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "UNSUPPORTED_INTENT",
        error: "That research type is not supported.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (isForbiddenResearchDepth(depthRaw)) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "UNSUPPORTED_DEPTH",
        error: "Deep research is not available.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (!isMerchantResearchStructuredDepth(depthRaw)) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "UNSUPPORTED_DEPTH",
        error: "That research depth is not supported.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (!isMerchantResearchCountryCode(countryRaw)) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "UNSUPPORTED_GEO",
        error: "That country is not available for market research.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (
    clientRequestId.length < 8 ||
    clientRequestId.length > 128 ||
    !/^[\w.:-]+$/.test(clientRequestId)
  ) {
    return {
      ok: false,
      dto: merchantResearchError({
        code: "INVALID_INPUT",
        error: "A valid request id is required.",
      }),
    };
  }

  return {
    ok: true,
    normalized: {
      organizationId,
      storeId,
      locationId,
      variantId,
      intentClass: intentRaw,
      countryCode: countryRaw,
      depth: depthRaw,
      clientRequestId,
    },
  };
}

/**
 * Trusted target attributes derived from membership-scoped grain only.
 * Browser product metadata is never accepted as authority.
 */
export function buildTrustedTargetProductFromRow(
  row: MerchantInventoryIntelligenceRow,
): ProductMatchTarget {
  return {
    title: row.productTitle?.trim() || row.sku,
    role: "product",
  };
}

function buildServerResearchQuestion(input: {
  sku: string;
  title: string;
  countryCode: MerchantResearchCountryCode;
  intentClass: MerchantResearchStructuredIntent;
}): string {
  return `SYNTHETIC preview: sourced signals for SKU ${input.sku} (${input.title}) in ${input.countryCode} — intent ${input.intentClass}. Not live research.`;
}

/**
 * Run a guarded structured market-research request for the merchant UX.
 * Rejects disabled/unauthorized requests before grain load / orchestration.
 */
export async function runGuardedMerchantResearch(
  input: MerchantResearchInput,
  ports: MerchantResearchPorts,
): Promise<MerchantResearchDto> {
  const validated = validateInput(input);
  if (!validated.ok) {
    return validated.dto;
  }
  const {
    organizationId,
    storeId,
    locationId,
    variantId,
    intentClass,
    countryCode,
    depth,
    clientRequestId,
  } = validated.normalized;

  // Production isolation: env overrides never unlock synthetic execution.
  const enforceEnv = ports.enforceProductionEnvIsolation !== false;
  if (enforceEnv && !ports.previewIsolation) {
    const envProbe = detectForbiddenSyntheticEnvOverrides();
    if (envProbe.blocked) {
      assertProductionMarketResearchExecutionForbidden();
      return merchantResearchError({
        code: "PREVIEW_ISOLATION_VIOLATION",
        error: "Market research preview overrides are not allowed.",
        clientRequestId,
      });
    }
  }

  let identity: MerchantResearchIdentity;
  try {
    identity = await ports.requireIdentity();
  } catch {
    return merchantResearchError({
      code: "UNAUTHORIZED",
      error: "Sign in again to continue.",
      clientRequestId,
    });
  }

  if (!identity.userId?.trim()) {
    return merchantResearchError({
      code: "UNAUTHORIZED",
      error: "Sign in again to continue.",
      clientRequestId,
    });
  }

  const resolution = await ports.resolveOrganization(identity, organizationId);
  if (!resolution.ok) {
    return merchantResearchError({
      code: "UNAUTHORIZED",
      error: "You do not have access to this organization.",
      clientRequestId,
    });
  }

  if (!roleHasPermission(resolution.context.role, "inventory.read")) {
    return merchantResearchError({
      code: "PERMISSION_DENIED",
      error: "You do not have permission to run market research.",
      clientRequestId,
    });
  }

  const config =
    ports.readConfig?.() ??
    (ports.previewIsolation
      ? getDefaultMarketResearchConfig()
      : readMarketResearchServerConfig());

  const preview = ports.previewIsolation;
  const allowSynthetic = preview?.allowSyntheticFixtures === true;

  // Independent research enablement — distinct from L1 commerce-agent soft-enable.
  const enablement = mayRunMarketResearch({
    organizationId,
    allowSyntheticFixtures: allowSynthetic || undefined,
    config,
  });

  if (!allowSynthetic) {
    // Production / non-preview: never orchestrate (live + synthetic locked).
    assertProductionMarketResearchExecutionForbidden();
    return merchantResearchError({
      code: "RESEARCH_DISABLED",
      error: "Market research is not enabled for this organization.",
      clientRequestId,
    });
  }

  if (!enablement.mayRunSyntheticFixtures) {
    return merchantResearchError({
      code: "RESEARCH_DISABLED",
      error: "Market research is not enabled for this organization.",
      clientRequestId,
    });
  }

  const countryOption = getMerchantResearchCountryOption(countryCode);
  if (
    countryOption.usageClass === "synthetic_fixture_only" &&
    !allowSynthetic
  ) {
    return merchantResearchError({
      code: "UNSUPPORTED_GEO",
      error: "That country is only available in isolated synthetic preview.",
      clientRequestId,
    });
  }

  let rows: readonly MerchantInventoryIntelligenceRow[];
  try {
    rows = await ports.loadIntelligenceRows(organizationId);
  } catch {
    return merchantResearchError({
      code: "AI_UNAVAILABLE",
      error: "Unable to run market research for this SKU right now.",
      clientRequestId,
    });
  }

  const grainKey = `${storeId}:${locationId}:${variantId}`;
  const row = rows.find(
    (candidate) =>
      candidate.organizationId === organizationId &&
      candidate.storeId === storeId &&
      candidate.locationId === locationId &&
      candidate.variantId === variantId &&
      candidate.grainKey === grainKey,
  );

  if (!row) {
    return merchantResearchError({
      code: "GRAIN_NOT_FOUND",
      error: "That SKU grain was not found in this organization.",
      clientRequestId,
    });
  }

  const permissions = [
    ...permissionsForRole(resolution.context.role),
  ] as Permission[];

  const context = buildTrustedMerchantContext({
    userId: identity.userId,
    organizationId: resolution.context.organizationId,
    role: resolution.context.role,
    permissions,
    storeId,
    locationId,
    variantId,
    countryCode,
    currencyCode: countryOption.currencyCode,
  });

  const targetProduct = buildTrustedTargetProductFromRow(row);
  const nowIso = preview?.nowIso ?? ports.nowIso ?? new Date().toISOString();
  const nowMs = preview?.nowMs ?? ports.nowMs;

  const rawRequest = {
    schemaVersion: MARKET_RESEARCH_REQUEST_VERSION,
    clientRequestId,
    organizationId,
    storeId,
    variantId,
    sku: row.sku,
    countryCode,
    currencyCode: countryOption.currencyCode,
    depth,
    intentClass,
    question: buildServerResearchQuestion({
      sku: row.sku,
      title: row.productTitle?.trim() || row.sku,
      countryCode,
      intentClass,
    }),
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
    allowAdapters: [MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH],
  };

  // Preview-only orchestration through actual 1d pipeline.
  const result = await runMarketResearchOrchestration({
    merchantContext: context,
    rawRequest,
    targetProduct,
    sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
    nowIso,
    nowMs,
    allowSyntheticFixtures: true,
    syntheticFixtureMode: true,
    fixtureId: preview?.fixtureId ?? "openai_success_citations_v1",
    registryKey: preview?.registryKey ?? "openai_offline_stub",
    satisfiedRetrieveConditions:
      preview?.satisfiedRetrieveConditions ?? [...OPENAI_RETRIEVE_CONDITIONS],
    satisfiedNormalizeConditions:
      preview?.satisfiedNormalizeConditions ?? [...OPENAI_NORMALIZE_CONDITIONS],
    satisfiedAnalyzeConditions:
      preview?.satisfiedAnalyzeConditions ?? [...OPENAI_ANALYZE_CONDITIONS],
    draftAdapter: preview?.draftAdapter,
    signal: preview?.signal ?? ports.signal,
  });

  const dto = toMerchantResearchDto({
    result,
    clientRequestId,
    intentClass,
    countryCode,
    depth,
  });

  assertMerchantResearchSafeDto(dto);
  return dto;
}
