"use server";

import { requireAppIdentity } from "@/lib/auth/app-route";
import type { StoreIncomingEvidenceAttestation } from "@/lib/incoming-evidence/types";
import { loadStoreIncomingEvidenceAttestations } from "@/lib/incoming-evidence/load";
import { buildInventoryExplainerEvidence } from "@/lib/inventory-explainer/build-evidence";
import {
  explainInventorySkuFromEvidence,
  serverResolvedInventoryExplainerOptions,
} from "@/lib/inventory-explainer/orchestrate";
import { isInventoryExplainerQuestionId } from "@/lib/inventory-explainer/questions";
import { resolveServerInventoryExplainerEnablement } from "@/lib/inventory-explainer/server-enablement";
import type {
  IncomingTrustClass,
  InventoryExplainerAnswer,
  InventoryExplainerRejectionCode,
} from "@/lib/inventory-explainer/types";
import { loadMerchantInventoryIntelligence } from "@/lib/inventory-intelligence/load";
import { loadMerchantPlanningInputs } from "@/lib/planning-inputs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleHasPermission } from "@/lib/tenancy/permissions";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ExplainInventorySkuActionResult =
  | { ok: true; answer: InventoryExplainerAnswer }
  | {
      ok: false;
      code: InventoryExplainerRejectionCode;
      error: string;
    };

function resolveIncomingTrust(
  storeId: string,
  attestations: readonly StoreIncomingEvidenceAttestation[],
): IncomingTrustClass {
  const match = attestations.find((a) => a.storeId === storeId);
  if (match?.evidenceComplete === true) {
    return "attested_complete";
  }
  return "unknown";
}

/**
 * Server-owned SKU explainer. Client supplies grain + question only.
 * Tenant, membership, permissions, and facts are resolved on the server.
 */
export async function explainInventorySkuAction(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  questionId: string;
  /** Client hint only — server recomputes from readiness freshness. */
  stockObservationsStaleHint?: boolean;
}): Promise<ExplainInventorySkuActionResult> {
  const organizationId = input.organizationId?.trim() ?? "";
  const storeId = input.storeId?.trim() ?? "";
  const locationId = input.locationId?.trim() ?? "";
  const variantId = input.variantId?.trim() ?? "";
  const questionIdRaw = input.questionId?.trim() ?? "";

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(storeId) ||
    !UUID_RE.test(locationId) ||
    !UUID_RE.test(variantId)
  ) {
    return {
      ok: false,
      code: "GRAIN_NOT_FOUND",
      error: "A valid store, location, and variant are required.",
    };
  }

  if (!isInventoryExplainerQuestionId(questionIdRaw)) {
    return {
      ok: false,
      code: "INVALID_QUESTION",
      error: "That question is not supported.",
    };
  }

  try {
    const identity = await requireAppIdentity();
    const resolution = await resolveServerOrganizationContext(
      identity,
      organizationId,
    );

    if (!resolution.ok) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        error: "You do not have access to this organization.",
      };
    }

    if (!roleHasPermission(resolution.context.role, "inventory.read")) {
      return {
        ok: false,
        code: "PERMISSION_DENIED",
        error: "You do not have permission to view inventory explanations.",
      };
    }

    // Ensure auth session is live for subsequent loads.
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Sign in again to continue.",
      };
    }

    const [intelligence, planning, attestations] = await Promise.all([
      loadMerchantInventoryIntelligence(organizationId),
      loadMerchantPlanningInputs(organizationId),
      loadStoreIncomingEvidenceAttestations(organizationId),
    ]);

    const grainKey = `${storeId}:${locationId}:${variantId}`;
    const row = intelligence.rows.find(
      (r) =>
        r.organizationId === organizationId &&
        r.storeId === storeId &&
        r.locationId === locationId &&
        r.variantId === variantId &&
        r.grainKey === grainKey,
    );

    if (!row) {
      return {
        ok: false,
        code: "GRAIN_NOT_FOUND",
        error: "That SKU grain was not found in this organization.",
      };
    }

    // Freshness: prefer server pending/stale signals over client hint.
    const stockObservationsStale =
      row.coverStatus === "stale" ||
      row.coverStatus === "pending_freshness" ||
      input.stockObservationsStaleHint === true;

    const evidence = buildInventoryExplainerEvidence({
      row,
      organizationId,
      stockObservationsStale,
      planning,
      incomingTrust: resolveIncomingTrust(storeId, attestations),
    });

    if (
      evidence.organizationId !== organizationId ||
      evidence.storeId !== storeId ||
      evidence.locationId !== locationId ||
      evidence.variantId !== variantId
    ) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        error: "Evidence scope did not match the requested grain.",
      };
    }

    const enablement =
      resolveServerInventoryExplainerEnablement(organizationId);
    const options = serverResolvedInventoryExplainerOptions({ enablement });

    const answer = await explainInventorySkuFromEvidence(
      evidence,
      questionIdRaw,
      options,
    );

    return { ok: true, answer };
  } catch {
    return {
      ok: false,
      code: "AI_UNAVAILABLE",
      error: "Unable to explain this SKU right now.",
    };
  }
}
