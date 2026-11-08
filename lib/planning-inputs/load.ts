import "server-only";

import {
  EMPTY_MERCHANT_PLANNING_INPUTS,
  type MerchantPlanningInputsRecord,
} from "@/lib/planning-inputs/types";
import { AppError } from "@/lib/observability/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PlanningRow = {
  organization_id: string;
  lead_time_days: number | null;
  safety_stock_days: number | null;
  review_period_days: number | null;
  updated_at: string | null;
  updated_by_user_id: string | null;
};

/**
 * Member-scoped read of organization planning defaults.
 * Missing row → all fields unknown (null), never invented zeros.
 */
export async function loadMerchantPlanningInputs(
  organizationId: string,
): Promise<MerchantPlanningInputsRecord> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AppError({
      code: "AUTHENTICATION_REQUIRED",
      kind: "expected",
      message: "Authentication required for planning inputs.",
      publicMessage: "Sign in to view planning inputs.",
      httpStatus: 401,
      cause: userError,
    });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to verify organization membership for planning inputs.",
      publicMessage: "Unable to load planning inputs right now.",
      httpStatus: 500,
      cause: membershipError,
    });
  }

  if (!membership) {
    throw new AppError({
      code: "TENANT_ACCESS_DENIED",
      kind: "expected",
      message: "Caller is not a member of the requested organization.",
      publicMessage: "You do not have access to this organization.",
      httpStatus: 403,
    });
  }

  const { data, error } = await supabase
    .from("organization_planning_inputs")
    .select(
      "organization_id,lead_time_days,safety_stock_days,review_period_days,updated_at,updated_by_user_id",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load organization planning inputs.",
      publicMessage: "Unable to load planning inputs right now.",
      httpStatus: 500,
      cause: error,
    });
  }

  if (!data) {
    return {
      organizationId,
      ...EMPTY_MERCHANT_PLANNING_INPUTS,
      updatedAt: null,
      updatedByUserId: null,
    };
  }

  const row = data as PlanningRow;
  return {
    organizationId: row.organization_id,
    leadTimeDays: row.lead_time_days,
    safetyStockDays: row.safety_stock_days,
    reviewPeriodDays: row.review_period_days,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
  };
}
