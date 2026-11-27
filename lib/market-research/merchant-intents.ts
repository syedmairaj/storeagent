/**
 * AI-MKT-1e — merchant-facing research intents, depths, and countries.
 * Browser may select only from these allowlists. COMP-1 / deep / AI-MKT-2 stay unavailable.
 */

import type {
  ResearchDepth,
  ResearchIntentClass,
} from "@/lib/market-research/types";

/** UX-supported research intents (subset of ResearchIntentClass). */
export type MerchantResearchStructuredIntent = "market_opportunity";

/** UX-supported depths — deep research remains forbidden. */
export type MerchantResearchStructuredDepth = "quick_lookup" | "standard";

/** AE = design; US/GB = synthetic preview fixtures only. */
export type MerchantResearchCountryCode = "AE" | "US" | "GB";

export type MerchantResearchIntentOption = {
  id: MerchantResearchStructuredIntent;
  label: string;
  hint: string;
};

export type MerchantResearchDepthOption = {
  id: MerchantResearchStructuredDepth;
  label: string;
  hint: string;
};

export type MerchantResearchCountryOption = {
  id: MerchantResearchCountryCode;
  label: string;
  currencyCode: string;
  /** design_allowlist = AE; synthetic_fixture_only = US/GB. */
  usageClass: "design_allowlist" | "synthetic_fixture_only";
};

export const MERCHANT_RESEARCH_STRUCTURED_INTENTS: readonly MerchantResearchIntentOption[] =
  [
    {
      id: "market_opportunity",
      label: "SKU / country signals",
      hint: "Sourced external signals for this product — not verified sales.",
    },
  ] as const;

export const MERCHANT_RESEARCH_STRUCTURED_DEPTHS: readonly MerchantResearchDepthOption[] =
  [
    {
      id: "quick_lookup",
      label: "Quick look",
      hint: "Bounded one-pass lookup.",
    },
    {
      id: "standard",
      label: "Standard",
      hint: "Same bounds as quick look in offline preview.",
    },
  ] as const;

export const MERCHANT_RESEARCH_COUNTRIES: readonly MerchantResearchCountryOption[] =
  [
    {
      id: "AE",
      label: "United Arab Emirates",
      currencyCode: "AED",
      usageClass: "design_allowlist",
    },
    {
      id: "US",
      label: "United States (preview)",
      currencyCode: "USD",
      usageClass: "synthetic_fixture_only",
    },
    {
      id: "GB",
      label: "United Kingdom (preview)",
      currencyCode: "GBP",
      usageClass: "synthetic_fixture_only",
    },
  ] as const;

const INTENT_SET = new Set<string>(
  MERCHANT_RESEARCH_STRUCTURED_INTENTS.map((item) => item.id),
);
const DEPTH_SET = new Set<string>(
  MERCHANT_RESEARCH_STRUCTURED_DEPTHS.map((item) => item.id),
);
const COUNTRY_SET = new Set<string>(
  MERCHANT_RESEARCH_COUNTRIES.map((item) => item.id),
);

export function isMerchantResearchStructuredIntent(
  value: unknown,
): value is MerchantResearchStructuredIntent {
  return typeof value === "string" && INTENT_SET.has(value);
}

export function isMerchantResearchStructuredDepth(
  value: unknown,
): value is MerchantResearchStructuredDepth {
  return typeof value === "string" && DEPTH_SET.has(value);
}

export function isMerchantResearchCountryCode(
  value: unknown,
): value is MerchantResearchCountryCode {
  return typeof value === "string" && COUNTRY_SET.has(value);
}

/** Intents intentionally unavailable in 1e merchant UX. */
export function isUnsupportedMerchantResearchIntent(
  value: unknown,
): value is Exclude<ResearchIntentClass, MerchantResearchStructuredIntent> {
  return (
    value === "zero_sales_diagnosis" || value === "competitor_research"
  );
}

export function isForbiddenResearchDepth(
  value: unknown,
): value is Extract<ResearchDepth, "deep"> {
  return value === "deep";
}

export function getMerchantResearchCountryOption(
  id: MerchantResearchCountryCode,
): MerchantResearchCountryOption {
  const match = MERCHANT_RESEARCH_COUNTRIES.find((item) => item.id === id);
  if (!match) {
    throw new Error("UNKNOWN_RESEARCH_COUNTRY");
  }
  return match;
}

/**
 * Countries shown in the merchant selector.
 * US/GB appear only when isolated synthetic preview is authorized server-side.
 */
export function listMerchantResearchCountriesForUx(input: {
  allowSyntheticPreviewCountries: boolean;
}): readonly MerchantResearchCountryOption[] {
  if (input.allowSyntheticPreviewCountries) {
    return MERCHANT_RESEARCH_COUNTRIES;
  }
  return MERCHANT_RESEARCH_COUNTRIES.filter(
    (item) => item.usageClass === "design_allowlist",
  );
}
