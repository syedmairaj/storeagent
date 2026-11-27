/**
 * AI-MKT-1a — geo / category policy.
 *
 * AE = design allowlist (production allowlists remain disabled).
 * US / GB = synthetic fixtures only.
 * No wildcard / global fallback. Exact merchant category selection is owner-gated.
 */

import type { ResearchFailureCode } from "@/lib/market-research/types";

export type GeoUsageClass = "design_allowlist" | "synthetic_fixture_only";

export type GeoCategoryPolicyConfig = {
  /**
   * Production geo allowlist. Default empty / disabled in 1a.
   * Enabling requires separate owner authorization (not granted here).
   */
  productionGeoAllowlistEnabled: boolean;
  productionGeoAllowlist: readonly string[];
  /** Design-time AE allowlist (still not a live launch commitment). */
  designGeoAllowlist: readonly string[];
  /** Countries permitted only via explicit synthetic fixtures. */
  syntheticFixtureOnlyCountries: readonly string[];
  /**
   * Exact merchant category selection. Empty by default — owner-gated.
   * No wildcard categories.
   */
  allowedCategories: readonly string[];
  categorySelectionOwnerAuthorized: boolean;
};

export type GeoCategoryEvaluation =
  | {
      ok: true;
      countryCode: string;
      usageClass: GeoUsageClass;
      categoryHint?: string;
    }
  | {
      ok: false;
      code: ResearchFailureCode;
      detail: string;
    };

const DEFAULT_CONFIG: GeoCategoryPolicyConfig = {
  productionGeoAllowlistEnabled: false,
  productionGeoAllowlist: [],
  designGeoAllowlist: ["AE"],
  syntheticFixtureOnlyCountries: ["US", "GB"],
  allowedCategories: [],
  categorySelectionOwnerAuthorized: false,
};

export function getDefaultGeoCategoryPolicyConfig(): GeoCategoryPolicyConfig {
  return {
    productionGeoAllowlistEnabled: DEFAULT_CONFIG.productionGeoAllowlistEnabled,
    productionGeoAllowlist: [...DEFAULT_CONFIG.productionGeoAllowlist],
    designGeoAllowlist: [...DEFAULT_CONFIG.designGeoAllowlist],
    syntheticFixtureOnlyCountries: [
      ...DEFAULT_CONFIG.syntheticFixtureOnlyCountries,
    ],
    allowedCategories: [...DEFAULT_CONFIG.allowedCategories],
    categorySelectionOwnerAuthorized:
      DEFAULT_CONFIG.categorySelectionOwnerAuthorized,
  };
}

function normalizeCountry(code: string | undefined | null): string {
  return (code ?? "").trim().toUpperCase();
}

function normalizeCategory(hint: string | undefined | null): string {
  return (hint ?? "").trim().toLowerCase();
}

/**
 * Evaluate country + optional category against the configurable policy.
 * Production allowlists stay disabled unless explicitly enabled by config
 * (still not a live research unlock in 1a).
 */
export function evaluateGeoCategoryPolicy(input: {
  countryCode: string;
  categoryHint?: string;
  /**
   * When true, US/GB may pass as synthetic fixtures.
   * Must be set only by explicit test/fixture harnesses — never by client flags.
   */
  syntheticFixtureMode?: boolean;
  config?: GeoCategoryPolicyConfig;
}): GeoCategoryEvaluation {
  const config = input.config ?? getDefaultGeoCategoryPolicyConfig();
  const country = normalizeCountry(input.countryCode);

  if (!country || country === "*" || country === "ALL" || country === "GLOBAL") {
    return {
      ok: false,
      code: "UNSUPPORTED_GEO",
      detail: "Wildcard / empty / global country codes are forbidden",
    };
  }

  const category = normalizeCategory(input.categoryHint);

  // Category constraints: if a hint is present, selection must be owner-authorized
  // and the exact category must appear on the allowlist (no wildcards).
  if (category) {
    if (category === "*" || category === "all") {
      return {
        ok: false,
        code: "UNSUPPORTED_CATEGORY",
        detail: "Wildcard categories are forbidden",
      };
    }
    if (!config.categorySelectionOwnerAuthorized) {
      return {
        ok: false,
        code: "UNSUPPORTED_CATEGORY",
        detail:
          "Exact merchant category selection remains owner-gated (not authorized in AI-MKT-1a defaults)",
      };
    }
    if (!config.allowedCategories.map(normalizeCategory).includes(category)) {
      return {
        ok: false,
        code: "UNSUPPORTED_CATEGORY",
        detail: `Category '${category}' is not on the authorized allowlist`,
      };
    }
  }

  if (config.designGeoAllowlist.includes(country)) {
    return {
      ok: true,
      countryCode: country,
      usageClass: "design_allowlist",
      categoryHint: category || undefined,
    };
  }

  if (config.syntheticFixtureOnlyCountries.includes(country)) {
    if (input.syntheticFixtureMode === true) {
      return {
        ok: true,
        countryCode: country,
        usageClass: "synthetic_fixture_only",
        categoryHint: category || undefined,
      };
    }
    return {
      ok: false,
      code: "UNSUPPORTED_GEO",
      detail: `Country '${country}' is synthetic-fixture-only and fixture mode was not enabled`,
    };
  }

  if (
    config.productionGeoAllowlistEnabled &&
    config.productionGeoAllowlist.includes(country)
  ) {
    // Production allowlist path exists for future config — still not a live unlock.
    return {
      ok: true,
      countryCode: country,
      usageClass: "design_allowlist",
      categoryHint: category || undefined,
    };
  }

  return {
    ok: false,
    code: "UNSUPPORTED_GEO",
    detail: `Country '${country}' is not on the design allowlist and is not an authorized fixture country`,
  };
}

export function isProductionGeoAllowlistDisabled(
  config: GeoCategoryPolicyConfig = getDefaultGeoCategoryPolicyConfig(),
): boolean {
  return config.productionGeoAllowlistEnabled !== true;
}
