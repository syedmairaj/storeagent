/**
 * AI-MKT-1c — geographic / currency / unit matching.
 * Domain suffix or currency alone cannot prove geography.
 * No FX conversion without authorized rates.
 */

import type { MarketResearchGeoObservation } from "@/lib/market-research/adapters/types";
import type {
  GeoMatchReasonCode,
  GeoMatchResult,
} from "@/lib/market-research/normalize/types";

function normCountry(code: string | undefined | null): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function normCurrency(code: string | undefined | null): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

function normUnit(unit: string | undefined | null): string | null {
  if (typeof unit !== "string") return null;
  const trimmed = unit.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Default ISO currency expectations for design/fixture countries (no FX). */
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  AE: "AED",
  US: "USD",
  GB: "GBP",
};

export function expectedCurrencyForCountry(countryCode: string): string | null {
  return COUNTRY_CURRENCY[normCountry(countryCode) ?? ""] ?? null;
}

export function matchGeographicObservation(input: {
  requestedCountryCode: string;
  requestedCurrencyCode?: string | null;
  requestedUnit?: string | null;
  observed: MarketResearchGeoObservation | undefined | null;
  /** When true, differing currencies may be compared via authorized FX (never in 1c). */
  fxRatesAuthorized?: boolean;
}): GeoMatchResult {
  const reasons: GeoMatchReasonCode[] = [];
  const requestedCountry = normCountry(input.requestedCountryCode);
  const requestedCurrency = normCurrency(input.requestedCurrencyCode);
  const requestedUnit = normUnit(input.requestedUnit);
  const observed = input.observed ?? {};
  const observedCountry = normCountry(observed.countryCode);
  const observedCurrency = normCurrency(observed.currencyCode);
  const observedUnit = normUnit(observed.unit);
  const proof = observed.geoProofClass ?? "unknown";

  if (!requestedCountry) {
    reasons.push("GEO_UNKNOWN");
    return {
      quality: "unknown",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  // Domain suffix / currency alone cannot prove geography.
  if (proof === "domain_suffix_only") {
    reasons.push("GEO_UNPROVEN_DOMAIN_ONLY");
    return {
      quality: "unproven",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }
  if (proof === "currency_only") {
    reasons.push("GEO_UNPROVEN_CURRENCY_ONLY");
    return {
      quality: "unproven",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  if (!observedCountry && proof === "unknown") {
    reasons.push("GEO_UNKNOWN");
    return {
      quality: "unknown",
      reasons: Object.freeze(reasons),
      observedCountryCode: null,
      observedCurrencyCode: observedCurrency,
    };
  }

  if (observedCountry && observedCountry !== requestedCountry) {
    reasons.push("COUNTRY_MISMATCH");
    reasons.push("REQUESTED_VS_SOURCE_MARKET_MISMATCH");
    return {
      quality: "mismatch",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  // Currency checks — no silent FX.
  const effectiveRequestedCurrency =
    requestedCurrency ?? expectedCurrencyForCountry(requestedCountry);
  if (
    observedCurrency &&
    effectiveRequestedCurrency &&
    observedCurrency !== effectiveRequestedCurrency
  ) {
    if (input.fxRatesAuthorized === true) {
      // Still not implemented in 1c — refuse.
      reasons.push("FX_CONVERSION_UNAUTHORIZED");
      return {
        quality: "mismatch",
        reasons: Object.freeze(reasons),
        observedCountryCode: observedCountry,
        observedCurrencyCode: observedCurrency,
      };
    }
    reasons.push("CURRENCY_MISMATCH");
    reasons.push("FX_CONVERSION_UNAUTHORIZED");
    return {
      quality: "mismatch",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  if (
    requestedUnit &&
    observedUnit &&
    requestedUnit !== observedUnit
  ) {
    reasons.push("UNIT_MISMATCH");
    return {
      quality: "mismatch",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  if (observedCountry === requestedCountry && proof === "explicit_market") {
    reasons.push("COUNTRY_EXACT");
    if (
      observedCurrency &&
      effectiveRequestedCurrency &&
      observedCurrency === effectiveRequestedCurrency
    ) {
      reasons.push("CURRENCY_COMPATIBLE");
    }
    return {
      quality: "exact",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  if (observedCountry === requestedCountry) {
    reasons.push("COUNTRY_EXACT");
    return {
      quality: "compatible",
      reasons: Object.freeze(reasons),
      observedCountryCode: observedCountry,
      observedCurrencyCode: observedCurrency,
    };
  }

  reasons.push("GEO_UNKNOWN");
  return {
    quality: "unknown",
    reasons: Object.freeze(reasons),
    observedCountryCode: observedCountry,
    observedCurrencyCode: observedCurrency,
  };
}

export function isComparableGeoQuality(
  quality: GeoMatchResult["quality"],
): boolean {
  return quality === "exact" || quality === "compatible";
}
