import "server-only";

import { AppError } from "@/lib/observability/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Load SKUs that already exist for the authorized store.
 * Sales import never fabricates product/variant mappings.
 */
export async function loadKnownStoreSkus(input: {
  organizationId: string;
  storeId: string;
}): Promise<ReadonlySet<string>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select("sku")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .limit(10_000);

  if (error) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load store SKUs for sales import.",
      publicMessage: "Unable to validate sales SKUs right now.",
      httpStatus: 500,
      cause: error,
    });
  }

  const skus = new Set<string>();
  for (const row of data ?? []) {
    const sku = String((row as { sku: string | null }).sku ?? "").trim();
    if (sku) {
      skus.add(sku);
    }
  }
  return skus;
}
