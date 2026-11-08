"use server";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { parseMerchantPlanningInputs } from "@/lib/planning-inputs/parse";
import { refreshMetricsAfterPlanningChange } from "@/lib/planning-inputs/refresh-metrics-after-planning-change";
import {
  planningMetricsRefreshFailureReport,
  reportPlanningMetricsRefresh,
  type PlanningMetricsRefreshReport,
} from "@/lib/planning-inputs/refresh-status";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleHasPermission } from "@/lib/tenancy/permissions";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SaveMerchantPlanningInputsResult =
  | {
      ok: true;
      value: MerchantPlanningInputs;
      metricsRefresh: PlanningMetricsRefreshReport;
    }
  | { ok: false; error: string };

function mapRpcError(message: string): string {
  if (/Authentication required/i.test(message)) {
    return "Sign in again to save planning inputs.";
  }
  if (/membership required/i.test(message)) {
    return "You do not have access to this organization.";
  }
  if (/owner or admin/i.test(message)) {
    return "Only owners and admins can edit planning inputs.";
  }
  if (/Organization not found/i.test(message)) {
    return "Organization not found.";
  }
  if (/non-negative integer/i.test(message)) {
    return "Planning days must be whole numbers ≥ 0, or blank for unknown.";
  }
  return "Unable to save planning inputs right now.";
}

/**
 * Trusted write: owner/admin only via SECURITY DEFINER RPC.
 * Partial configs and explicit zeros are preserved; blanks stay null.
 * Upsert+invalidation are atomic in SQL; refresh drain is best-effort and
 * reported honestly (never claims metrics ready when work remains).
 */
export async function saveMerchantPlanningInputsAction(input: {
  organizationId: string;
  leadTimeDays?: string | number | null;
  safetyStockDays?: string | number | null;
  reviewPeriodDays?: string | number | null;
}): Promise<SaveMerchantPlanningInputsResult> {
  const organizationId = input.organizationId?.trim() ?? "";
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, error: "Organization is required." };
  }

  const parsed = parseMerchantPlanningInputs(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
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
        error: "Only owners and admins can edit planning inputs.",
      };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "upsert_current_user_organization_planning_inputs",
      {
        p_organization_id: organizationId,
        p_lead_time_days: parsed.value.leadTimeDays,
        p_safety_stock_days: parsed.value.safetyStockDays,
        p_review_period_days: parsed.value.reviewPeriodDays,
      },
    );

    if (error) {
      return { ok: false, error: mapRpcError(error.message) };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") {
      return { ok: false, error: "Unable to save planning inputs right now." };
    }

    const saved = row as {
      lead_time_days: number | null;
      safety_stock_days: number | null;
      review_period_days: number | null;
    };

    const value: MerchantPlanningInputs = {
      leadTimeDays: saved.lead_time_days,
      safetyStockDays: saved.safety_stock_days,
      reviewPeriodDays: saved.review_period_days,
    };

    // Upsert already dirtied current metric grains in-txn. Drain is separate
    // and must not invent a "ready" claim when bounded work remains.
    let metricsRefresh: PlanningMetricsRefreshReport;
    try {
      const summary = await refreshMetricsAfterPlanningChange({
        organizationId,
        ownerId: `planning-inputs-refresh:${identity.userId}`,
      });
      metricsRefresh = reportPlanningMetricsRefresh(summary);
    } catch {
      metricsRefresh = planningMetricsRefreshFailureReport();
    }

    return {
      ok: true,
      value,
      metricsRefresh,
    };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message
        : "Unable to save planning inputs right now.";
    return { ok: false, error: mapRpcError(message) };
  }
}
