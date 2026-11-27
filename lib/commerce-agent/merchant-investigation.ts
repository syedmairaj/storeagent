/**
 * AI-ARCH-1e — guarded merchant investigation (testable core).
 * Auth → membership → inventory.read → enablement → grain → L1 run → DTO.
 * Browser IDs are untrusted selectors only. No forceEnabled / adapters exposed.
 */

import {
  COMMERCE_AGENT_QUERY_VERSION,
  type AgentQuery,
  type MerchantContext,
} from "@/lib/commerce-agent/types";
import { buildTrustedMerchantContext } from "@/lib/commerce-agent/merchant-context";
import {
  mayRunCommerceAgent,
  readCommerceAgentServerConfig,
  type CommerceAgentServerConfig,
} from "@/lib/commerce-agent/orchestrator/enablement";
import { runCommerceAgent } from "@/lib/commerce-agent/orchestrator/run";
import type { L1ToolDeps } from "@/lib/commerce-agent/tools/deps";
import {
  isCommerceAgentStructuredIntent,
  type CommerceAgentStructuredIntent,
} from "@/lib/commerce-agent/intents";
import {
  assertMerchantSafeDto,
  merchantInvestigationError,
  toMerchantInvestigationDto,
  type MerchantInvestigationDto,
} from "@/lib/commerce-agent/merchant-response";
import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";
import type { IncomingTrustClass } from "@/lib/inventory-explainer/types";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { Permission } from "@/lib/tenancy/permissions";
import { permissionsForRole, roleHasPermission } from "@/lib/tenancy/permissions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MerchantInvestigationInput = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  intentClass: string;
  clientRequestId: string;
  /** Client hint only — server recomputes from grain cover status. */
  stockObservationsStaleHint?: boolean;
};

/**
 * Public action input must never accept these. Tests assert absence.
 * Listed here so static analysis / docs stay explicit.
 */
export const FORBIDDEN_CLIENT_OVERRIDE_KEYS = [
  "forceEnabled",
  "config",
  "draftAdapter",
  "deps",
  "planOverride",
  "organizationAllowlist",
] as const;

export type MerchantInvestigationIdentity = {
  userId: string;
};

export type MerchantInvestigationOrgContext = {
  organizationId: string;
  role: OrganizationMemberRole;
};

export type MerchantInvestigationPorts = {
  requireIdentity: () => Promise<MerchantInvestigationIdentity>;
  resolveOrganization: (
    identity: MerchantInvestigationIdentity,
    organizationId: string,
  ) => Promise<
    | { ok: true; context: MerchantInvestigationOrgContext }
    | { ok: false }
  >;
  /**
   * Load membership-scoped intelligence for grain proof.
   * Invoked only after enablement passes.
   */
  loadIntelligenceRows: (
    organizationId: string,
  ) => Promise<readonly MerchantInventoryIntelligenceRow[]>;
  /** Injectable L1 deps — production wires authorized loaders. */
  createToolDeps: () => L1ToolDeps;
  resolveIncomingTrust?: (storeId: string) => Promise<IncomingTrustClass>;
  /** Default: readCommerceAgentServerConfig(). Tests inject. */
  readConfig?: () => CommerceAgentServerConfig;
  /** Wall clock for orchestrator. */
  nowMs?: number;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function validateInput(
  input: MerchantInvestigationInput,
):
  | { ok: true; normalized: {
      organizationId: string;
      storeId: string;
      locationId: string;
      variantId: string;
      intentClass: CommerceAgentStructuredIntent;
      clientRequestId: string;
      stockObservationsStaleHint: boolean;
    } }
  | { ok: false; dto: MerchantInvestigationDto } {
  const organizationId = input.organizationId?.trim() ?? "";
  const storeId = input.storeId?.trim() ?? "";
  const locationId = input.locationId?.trim() ?? "";
  const variantId = input.variantId?.trim() ?? "";
  const intentRaw = input.intentClass?.trim() ?? "";
  const clientRequestId = input.clientRequestId?.trim() ?? "";

  if (
    !isUuid(organizationId) ||
    !isUuid(storeId) ||
    !isUuid(locationId) ||
    !isUuid(variantId)
  ) {
    return {
      ok: false,
      dto: merchantInvestigationError({
        code: "INVALID_INPUT",
        error: "A valid store, location, and variant are required.",
        clientRequestId: clientRequestId || undefined,
      }),
    };
  }

  if (!isCommerceAgentStructuredIntent(intentRaw)) {
    return {
      ok: false,
      dto: merchantInvestigationError({
        code: "UNSUPPORTED_INTENT",
        error: "That investigation type is not supported.",
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
      dto: merchantInvestigationError({
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
      clientRequestId,
      stockObservationsStaleHint: input.stockObservationsStaleHint === true,
    },
  };
}

/**
 * Run a guarded structured-intent investigation for the merchant UX.
 * Rejects disabled/unauthorized requests before evidence loads or tool calls.
 */
export async function runGuardedMerchantInvestigation(
  input: MerchantInvestigationInput,
  ports: MerchantInvestigationPorts,
): Promise<MerchantInvestigationDto> {
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
    clientRequestId,
    stockObservationsStaleHint,
  } = validated.normalized;

  let identity: MerchantInvestigationIdentity;
  try {
    identity = await ports.requireIdentity();
  } catch {
    return merchantInvestigationError({
      code: "UNAUTHORIZED",
      error: "Sign in again to continue.",
      clientRequestId,
    });
  }

  if (!identity.userId?.trim()) {
    return merchantInvestigationError({
      code: "UNAUTHORIZED",
      error: "Sign in again to continue.",
      clientRequestId,
    });
  }

  const resolution = await ports.resolveOrganization(
    identity,
    organizationId,
  );
  if (!resolution.ok) {
    return merchantInvestigationError({
      code: "UNAUTHORIZED",
      error: "You do not have access to this organization.",
      clientRequestId,
    });
  }

  if (!roleHasPermission(resolution.context.role, "inventory.read")) {
    return merchantInvestigationError({
      code: "PERMISSION_DENIED",
      error: "You do not have permission to run inventory investigations.",
      clientRequestId,
    });
  }

  const config =
    ports.readConfig?.() ?? readCommerceAgentServerConfig();
  const enablement = mayRunCommerceAgent({
    organizationId,
    config,
  });

  if (!enablement.mayRun) {
    // Fail closed before any business evidence load / tool invocation.
    return merchantInvestigationError({
      code: "AGENT_DISABLED",
      error: "Merchant intelligence is not enabled for this organization.",
      clientRequestId,
    });
  }

  let rows: readonly MerchantInventoryIntelligenceRow[];
  try {
    rows = await ports.loadIntelligenceRows(organizationId);
  } catch {
    return merchantInvestigationError({
      code: "AI_UNAVAILABLE",
      error: "Unable to investigate this SKU right now.",
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
    return merchantInvestigationError({
      code: "GRAIN_NOT_FOUND",
      error: "That SKU grain was not found in this organization.",
      clientRequestId,
    });
  }

  const stockObservationsStale =
    row.coverStatus === "stale" ||
    row.coverStatus === "pending_freshness" ||
    stockObservationsStaleHint;

  const permissions = [
    ...permissionsForRole(resolution.context.role),
  ] as Permission[];

  const context: MerchantContext = buildTrustedMerchantContext({
    userId: identity.userId,
    organizationId: resolution.context.organizationId,
    role: resolution.context.role,
    permissions,
    storeId,
    locationId,
    variantId,
    countryCode: null,
    currencyCode: null,
  });

  const query: AgentQuery = {
    schemaVersion: COMMERCE_AGENT_QUERY_VERSION,
    locale: "en-US",
    intentClass,
    clientRequestId,
    hintGrain: {
      organizationId,
      storeId,
      locationId,
      variantId,
    },
  };

  let incomingTrust: IncomingTrustClass = "unknown";
  if (ports.resolveIncomingTrust) {
    try {
      incomingTrust = await ports.resolveIncomingTrust(storeId);
    } catch {
      incomingTrust = "unknown";
    }
  }

  // forceEnabled intentionally omitted — production path never bypasses soft-enable.
  const result = await runCommerceAgent({
    query,
    context,
    deps: ports.createToolDeps(),
    stockObservationsStale,
    incomingTrust,
    config,
    nowMs: ports.nowMs,
  });

  const dto = toMerchantInvestigationDto({
    result,
    clientRequestId,
    intentClass,
  });

  // Abstention AGENT_DISABLED from orchestrator should not occur after mayRun,
  // but keep merchant-safe mapping if it does.
  assertMerchantSafeDto(dto);
  return dto;
}
