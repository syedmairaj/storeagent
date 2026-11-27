/**
 * AI-MKT-1c — deterministic product / variant matching.
 * No LLM similarity. Missing attributes never imply exact.
 */

import type { MarketResearchProductAttributes } from "@/lib/market-research/adapters/types";
import type {
  ProductMatchQuality,
  ProductMatchReasonCode,
  ProductMatchResult,
  ProductMatchTarget,
} from "@/lib/market-research/normalize/types";

function norm(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function present(value: string | undefined | null): boolean {
  return norm(value) !== null;
}

function equalAttr(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean | null {
  const left = norm(a);
  const right = norm(b);
  if (left === null || right === null) {
    return null;
  }
  return left === right;
}

function packEqual(
  a: number | undefined,
  b: number | undefined,
): boolean | null {
  if (typeof a !== "number" || typeof b !== "number") {
    return null;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return a === b;
}

function countDefined(attrs: ProductMatchTarget | MarketResearchProductAttributes): number {
  let n = 0;
  for (const key of [
    "brand",
    "model",
    "gtin",
    "mpn",
    "variant",
    "size",
    "color",
    "capacity",
    "category",
    "title",
  ] as const) {
    if (present(attrs[key])) n += 1;
  }
  if (typeof attrs.packQuantity === "number") n += 1;
  if (attrs.condition && attrs.condition !== "unknown") n += 1;
  if (attrs.role && attrs.role !== "unknown") n += 1;
  return n;
}

/**
 * Structured product match. Priority: GTIN > brand+MPN > brand+model+variant+attrs.
 */
export function matchProductAttributes(input: {
  target: ProductMatchTarget;
  observed: MarketResearchProductAttributes | undefined | null;
}): ProductMatchResult {
  const target = input.target;
  const observed = input.observed ?? {};
  const reasons: ProductMatchReasonCode[] = [];
  const mismatches: ProductMatchReasonCode[] = [];

  const gtinCmp = equalAttr(target.gtin, observed.gtin);
  if (gtinCmp === false) {
    mismatches.push("GTIN_MISMATCH");
  }

  const brandCmp = equalAttr(target.brand, observed.brand);
  if (brandCmp === false) {
    mismatches.push("BRAND_MISMATCH");
  }

  const mpnCmp = equalAttr(target.mpn, observed.mpn);
  if (mpnCmp === false) {
    mismatches.push("MPN_MISMATCH");
  }

  const modelCmp = equalAttr(target.model, observed.model);
  if (modelCmp === false) {
    mismatches.push("MODEL_MISMATCH");
  }

  const variantCmp = equalAttr(target.variant, observed.variant);
  if (variantCmp === false) {
    mismatches.push("VARIANT_MISMATCH");
  }

  const sizeCmp = equalAttr(target.size, observed.size);
  if (sizeCmp === false) {
    mismatches.push("SIZE_MISMATCH");
  }

  const colorCmp = equalAttr(target.color, observed.color);
  if (colorCmp === false) {
    mismatches.push("COLOR_MISMATCH");
  }

  const capacityCmp = equalAttr(target.capacity, observed.capacity);
  if (capacityCmp === false) {
    mismatches.push("CAPACITY_MISMATCH");
  }

  const packCmp = packEqual(target.packQuantity, observed.packQuantity);
  if (packCmp === false) {
    mismatches.push("PACK_QUANTITY_MISMATCH");
  }

  const targetCond =
    target.condition && target.condition !== "unknown" ? target.condition : null;
  const obsCond =
    observed.condition && observed.condition !== "unknown"
      ? observed.condition
      : null;
  if (targetCond && obsCond && targetCond !== obsCond) {
    mismatches.push("CONDITION_MISMATCH");
  }

  const categoryCmp = equalAttr(target.category, observed.category);
  if (categoryCmp === false) {
    mismatches.push("CATEGORY_MISMATCH");
  }

  const targetRole =
    target.role && target.role !== "unknown" ? target.role : "product";
  const obsRole =
    observed.role && observed.role !== "unknown" ? observed.role : null;
  if (obsRole === "accessory" && targetRole === "product") {
    mismatches.push("ACCESSORY_VS_PRODUCT");
  }
  if (obsRole === "bundle" && targetRole === "product") {
    mismatches.push("BUNDLE_VS_PRODUCT");
  }
  if (
    obsRole &&
    target.role &&
    target.role !== "unknown" &&
    obsRole !== target.role &&
    !mismatches.includes("ACCESSORY_VS_PRODUCT") &&
    !mismatches.includes("BUNDLE_VS_PRODUCT")
  ) {
    // Treat other role disagreements as mismatch via accessory/bundle codes when applicable;
    // otherwise category-like mismatch.
    if (obsRole === "accessory") {
      mismatches.push("ACCESSORY_VS_PRODUCT");
    } else if (obsRole === "bundle") {
      mismatches.push("BUNDLE_VS_PRODUCT");
    }
  }

  if (mismatches.length > 0) {
    return { quality: "mismatch", reasons: Object.freeze([...mismatches]) };
  }

  const targetDefined = countDefined(target);
  const observedDefined = countDefined(observed);
  if (targetDefined === 0 || observedDefined === 0) {
    reasons.push("MISSING_IDENTIFIERS");
    reasons.push("INSUFFICIENT_ATTRIBUTES");
    return { quality: "unknown", reasons: Object.freeze(reasons) };
  }

  // Exact paths — never from missing attrs.
  if (gtinCmp === true) {
    reasons.push("GTIN_EXACT");
    if (brandCmp === true || !present(target.brand) || !present(observed.brand)) {
      // GTIN exact is sufficient when no mismatches.
      return { quality: "exact", reasons: Object.freeze(reasons) };
    }
  }

  if (brandCmp === true && mpnCmp === true) {
    reasons.push("MPN_BRAND_EXACT");
    return { quality: "exact", reasons: Object.freeze(reasons) };
  }

  if (
    brandCmp === true &&
    modelCmp === true &&
    (variantCmp === true ||
      (!present(target.variant) && !present(observed.variant))) &&
    (packCmp === true ||
      typeof target.packQuantity !== "number" ||
      typeof observed.packQuantity !== "number") &&
    (categoryCmp === true ||
      !present(target.category) ||
      !present(observed.category))
  ) {
    // Require at least one more confirming attribute beyond brand+model when variant absent,
    // or explicit variant match — still not exact if only brand+model with sparse attrs.
    const confirming =
      (variantCmp === true ? 1 : 0) +
      (sizeCmp === true ? 1 : 0) +
      (colorCmp === true ? 1 : 0) +
      (capacityCmp === true ? 1 : 0) +
      (packCmp === true ? 1 : 0) +
      (categoryCmp === true ? 1 : 0) +
      (gtinCmp === true ? 1 : 0) +
      (mpnCmp === true ? 1 : 0);

    if (confirming >= 2 || (variantCmp === true && confirming >= 1)) {
      reasons.push("BRAND_MODEL_VARIANT_EXACT");
      return { quality: "exact", reasons: Object.freeze(reasons) };
    }
  }

  // Ambiguous: sides carry different strong identifiers without a shared confirmatory id.
  const crossStrongId =
    (present(target.gtin) &&
      !present(observed.gtin) &&
      present(observed.mpn) &&
      !present(target.mpn)) ||
    (present(target.mpn) &&
      !present(observed.mpn) &&
      present(observed.gtin) &&
      !present(target.gtin));
  if (crossStrongId && brandCmp === true) {
    reasons.push("AMBIGUOUS_ATTRIBUTES");
    return { quality: "unknown", reasons: Object.freeze(reasons) };
  }

  // Partial paths.
  const partialHits =
    (brandCmp === true ? 1 : 0) +
    (modelCmp === true ? 1 : 0) +
    (variantCmp === true ? 1 : 0) +
    (sizeCmp === true ? 1 : 0) +
    (colorCmp === true ? 1 : 0) +
    (capacityCmp === true ? 1 : 0) +
    (categoryCmp === true ? 1 : 0) +
    (packCmp === true ? 1 : 0);

  const titleCmp = equalAttr(target.title, observed.title);
  if (partialHits >= 2) {
    reasons.push("ATTRIBUTES_PARTIAL");
    return { quality: "partial", reasons: Object.freeze(reasons) };
  }
  if (brandCmp === true && partialHits === 1) {
    reasons.push("BRAND_ONLY_PARTIAL");
    return { quality: "partial", reasons: Object.freeze(reasons) };
  }
  if (titleCmp === true) {
    reasons.push("TITLE_PARTIAL");
    return { quality: "partial", reasons: Object.freeze(reasons) };
  }
  if (partialHits === 1) {
    reasons.push("ATTRIBUTES_PARTIAL");
    return { quality: "partial", reasons: Object.freeze(reasons) };
  }

  if (
    !present(target.gtin) &&
    !present(observed.gtin) &&
    !present(target.mpn) &&
    !present(observed.mpn)
  ) {
    reasons.push("MISSING_IDENTIFIERS");
  } else {
    reasons.push("INSUFFICIENT_ATTRIBUTES");
  }
  return { quality: "unknown", reasons: Object.freeze(reasons) };
}

export function isComparableMatchQuality(quality: ProductMatchQuality): boolean {
  return quality === "exact" || quality === "partial";
}
