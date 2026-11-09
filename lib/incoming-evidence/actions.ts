"use server";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { refreshMetricsAfterPlanningChange } from "@/lib/planning-inputs/refresh-metrics-after-planning-change";
import {
  planningMetricsRefreshFailureReport,
  reportPlanningMetricsRefresh,
  type PlanningMetricsRefreshReport,
} from "@/lib/planning-inputs/refresh-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleHasPermission } from "@/lib/tenancy/permissions";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SaveIncomingEvidenceAttestationResult =
  | {
      ok: true;
      evidenceComplete: boolean;
      metricsRefresh: PlanningMetricsRefreshReport;
    }
  | { ok: false; error: string };

function mapRpcError(message: string): string {
  if (/Authentication required/i.test(message)) {
    return "Sign in again to save incoming evidence attestation.";
  }
  if (/membership required/i.test(message)) {
    return "You do not have access to this organization.";
  }
  if (/owner or admin/i.test(message)) {
    return "Only owners and admins can attest incoming evidence completeness.";
  }
  if (/Store not found/i.test(message)) {
    return "Store not found.";
  }
  return "Unable to save incoming evidence attestation right now.";
}

/**
 * Owner/admin attestation that destination-scoped PO evidence for a store is
 * complete. Empty current-day grains become known-zero only after this is true.
 * Upsert+invalidation are atomic in SQL; drain is best-effort.
 */
export async function saveStoreIncomingEvidenceAttestationAction(input: {
  organizationId: string;
  storeId: string;
  evidenceComplete: boolean;
}): Promise<SaveIncomingEvidenceAttestationResult> {
  const organizationId = input.organizationId?.trim() ?? "";
  const storeId = input.storeId?.trim() ?? "";
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(storeId)) {
    return { ok: false, error: "Organization and store are required." };
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
        error: "You do not have access to this organization.",
      };
    }

    if (
      !roleHasPermission(resolution.context.role, "organization.manage")
    ) {
      return {
        ok: false,
        error:
          "Only owners and admins can attest incoming evidence completeness.",
      };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "upsert_current_user_store_incoming_evidence_attestation",
      {
        p_organization_id: organizationId,
        p_store_id: storeId,
        p_evidence_complete: input.evidenceComplete === true,
      },
    );

    if (error) {
      return { ok: false, error: mapRpcError(error.message) };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const evidenceComplete =
      row &&
      typeof row === "object" &&
      "evidence_complete" in row &&
      (row as { evidence_complete: boolean }).evidence_complete === true;

    let metricsRefresh: PlanningMetricsRefreshReport;
    try {
      const refresh = await refreshMetricsAfterPlanningChange({
        organizationId,
        ownerId: `incoming-evidence-refresh:${identity.userId}`,
      });
      metricsRefresh = reportPlanningMetricsRefresh(refresh);
    } catch {
      metricsRefresh = planningMetricsRefreshFailureReport();
    }

    return {
      ok: true,
      evidenceComplete,
      metricsRefresh,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error.";
    return { ok: false, error: mapRpcError(message) };
  }
}
