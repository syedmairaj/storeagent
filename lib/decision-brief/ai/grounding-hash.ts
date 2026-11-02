/**
 * M7.4e E3.1 — decision-brief-grounding-hash-v1 canonical serialization.
 *
 * Hash is reproducibility / golden binding ONLY.
 * Not authentication, attestation, enablement, or tenant authorization.
 */

import {
  createHash,
} from "node:crypto";

import type {
  DecisionBriefGroundingInput,
  Field,
} from "@/lib/decision-brief/types";

import {
  DECISION_BRIEF_GROUNDING_HASH_VERSION,
  GROUNDING_HASH_PREFIX,
} from "@/lib/decision-brief/ai/types";

function canonicalizeNumber(
  value: number,
): number {
  if (
    !Number.isFinite(value)
  ) {
    throw new Error(
      "Non-finite numbers cannot enter decision-brief-grounding-hash-v1.",
    );
  }

  // Collapse -0 to 0 per contract §3.2.1.
  return Object.is(value, -0) ? 0 : value;
}

function serializeField(
  field: Field<unknown>,
): Record<string, unknown> {
  if (
    field.state === "known"
  ) {
    const value =
      typeof field.value === "number"
        ? canonicalizeNumber(field.value)
        : field.value;

    return {
      state: "known",
      value,
    };
  }

  const out: Record<string, unknown> = {
    state: field.state,
  };

  if (
    field.reasonCode !== undefined
  ) {
    out.reasonCode = field.reasonCode;
  }

  return out;
}

/**
 * Deterministic UTF-16 code-unit key ordering (never locale-sensitive).
 * Stable across runtimes/locales for golden hash pinning.
 */
export function compareCanonicalKeys(
  left: string,
  right: string,
): number {
  if (
    left < right
  ) {
    return -1;
  }

  if (
    left > right
  ) {
    return 1;
  }

  return 0;
}

/**
 * Compact JSON with code-unit-sorted object keys.
 * Arrays preserve existing order (reasonCodes / confidenceReasonCodes).
 */
export function canonicalSerialize(
  value: unknown,
): string {
  if (
    value === null
  ) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (
    typeof value === "number"
  ) {
    return JSON.stringify(
      canonicalizeNumber(value),
    );
  }

  if (
    Array.isArray(value)
  ) {
    return `[${value
      .map((item) => canonicalSerialize(item))
      .join(",")}]`;
  }

  if (
    typeof value === "object"
  ) {
    const entries = Object.entries(
      value as Record<string, unknown>,
    ).sort(
      ([a], [b]) =>
        compareCanonicalKeys(a, b),
    );

    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalSerialize(item)}`,
      )
      .join(",")}}`;
  }

  throw new Error(
    "Unsupported value for decision-brief-grounding-hash-v1.",
  );
}

/**
 * Build the hash-input object: serialization version + grounding only.
 * Excludes constraints, request, enablement, generatedAt, latency.
 */
export function buildGroundingHashPayload(
  grounding: DecisionBriefGroundingInput,
): Record<string, unknown> {
  const evidence: Record<string, unknown> = {};

  for (
    const [key, field] of Object.entries(
      grounding.evidence,
    )
  ) {
    evidence[key] = serializeField(field);
  }

  const evidenceSourceTimestamps: Record<string, unknown> = {};

  for (
    const [key, field] of Object.entries(
      grounding.evidenceSourceTimestamps,
    )
  ) {
    evidenceSourceTimestamps[key] =
      serializeField(field);
  }

  const payloadGrounding: Record<string, unknown> = {
    schemaVersion: grounding.schemaVersion,
    briefMode: grounding.briefMode,
    organizationId: grounding.organizationId,
    storeId: grounding.storeId,
    locationId: grounding.locationId,
    variantId: grounding.variantId,
    productTitle: grounding.productTitle,
    variantTitle: grounding.variantTitle,
    actionType: grounding.actionType,
    priority: grounding.priority,
    confidence: grounding.confidence,
    recommendedQuantity: serializeField(
      grounding.recommendedQuantity,
    ),
    recommendedActionDate: serializeField(
      grounding.recommendedActionDate,
    ),
    reasonCodes: [
      ...grounding.reasonCodes,
    ],
    confidenceReasonCodes: [
      ...grounding.confidenceReasonCodes,
    ],
    evidence,
    decisionAsOf: serializeField(
      grounding.decisionAsOf,
    ),
    pinnedTimeZone: serializeField(
      grounding.pinnedTimeZone,
    ),
    evidenceSourceTimestamps,
    freshness: {
      status: grounding.freshness.status,
      staleReasonCodes: [
        ...grounding.freshness.staleReasonCodes,
      ],
    },
    trustClaims: {
      ...grounding.trustClaims,
    },
  };

  if (
    grounding.demoAttestation !== undefined
  ) {
    payloadGrounding.demoAttestation =
      grounding.demoAttestation;
  }

  if (
    grounding.deterministicFallbackCopy !== undefined
  ) {
    payloadGrounding.deterministicFallbackCopy = {
      whyNow:
        grounding.deterministicFallbackCopy.whyNow,
      suggestedNextStep:
        grounding.deterministicFallbackCopy
          .suggestedNextStep,
    };
  }

  return {
    groundingSerializationVersion:
      DECISION_BRIEF_GROUNDING_HASH_VERSION,
    grounding: payloadGrounding,
  };
}

export function computeGroundingHash(
  grounding: DecisionBriefGroundingInput,
): string {
  const payload =
    buildGroundingHashPayload(
      grounding,
    );
  const canonical =
    canonicalSerialize(
      payload,
    );
  const digest =
    createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");

  return `${GROUNDING_HASH_PREFIX}${digest}`;
}

export function groundingHashesEqual(
  left: string,
  right: string,
): boolean {
  return left === right;
}
