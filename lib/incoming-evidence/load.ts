import "server-only";

import type { StoreIncomingEvidenceAttestation } from "@/lib/incoming-evidence/types";
import { AppError } from "@/lib/observability/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StoreRow = {
  id: string;
  name: string;
};

type AttestationRow = {
  store_id: string;
  evidence_complete: boolean;
  updated_at: string;
};

/**
 * Load per-store incoming-evidence completeness for merchant UI.
 * Member-scoped reads only.
 */
export async function loadStoreIncomingEvidenceAttestations(
  organizationId: string,
): Promise<StoreIncomingEvidenceAttestation[]> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AppError({
      code: "AUTHENTICATION_REQUIRED",
      kind: "expected",
      message: "Authentication required for incoming evidence.",
      publicMessage: "Sign in to manage incoming evidence.",
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
      message: "Unable to verify membership for incoming evidence.",
      publicMessage: "Unable to load incoming evidence right now.",
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

  const [{ data: stores, error: storesError }, { data: rows, error }] =
    await Promise.all([
      supabase
        .from("stores")
        .select("id,name")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true })
        .limit(100),
      supabase
        .from("store_incoming_evidence_attestations")
        .select("store_id,evidence_complete,updated_at")
        .eq("organization_id", organizationId)
        .limit(100),
    ]);

  if (storesError || error) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load store incoming evidence attestations.",
      publicMessage: "Unable to load incoming evidence right now.",
      httpStatus: 500,
      cause: storesError ?? error,
    });
  }

  const byStore = new Map(
    ((rows ?? []) as AttestationRow[]).map((row) => [row.store_id, row]),
  );

  return ((stores ?? []) as StoreRow[]).map((store) => {
    const attestation = byStore.get(store.id);
    return {
      storeId: store.id,
      storeName: store.name,
      evidenceComplete: attestation?.evidence_complete === true,
      updatedAt: attestation?.updated_at ?? null,
    };
  });
}
