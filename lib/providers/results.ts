import type {
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

import type {
  ProviderNormalizationAccepted,
  ProviderNormalizationIssue,
  ProviderNormalizationQuarantined,
  ProviderNormalizationSkipped,
} from "./types";

interface ResultIdentity {
  provider: ProviderType;
  resourceType: ProviderResourceType;
  externalId: string | null;
  externalParentId: string | null;
  adapterVersion: string;
}

export function acceptedProviderRecord<TCanonical>(
  identity: ResultIdentity & {
    externalId: string;
  },
  canonical: TCanonical,
): ProviderNormalizationAccepted<TCanonical> {
  return {
    disposition: "accepted",
    ...identity,
    canonical,
    issues: [],
  };
}

export function quarantinedProviderRecord(
  identity: ResultIdentity,
  issues: readonly ProviderNormalizationIssue[],
): ProviderNormalizationQuarantined {
  if (issues.length === 0) {
    throw new Error(
      "Quarantined provider records require at least one issue.",
    );
  }

  return {
    disposition: "quarantined",
    ...identity,
    canonical: null,
    issues: [...issues],
  };
}

export function skippedProviderRecord(
  identity: ResultIdentity,
  issues: readonly ProviderNormalizationIssue[],
): ProviderNormalizationSkipped {
  if (issues.length === 0) {
    throw new Error(
      "Skipped provider records require at least one issue.",
    );
  }

  return {
    disposition: "skipped",
    ...identity,
    canonical: null,
    issues: [...issues],
  };
}
