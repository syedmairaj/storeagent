/**
 * Action-type key evidence selection for deterministic fallback briefs.
 * Mirrors Actions demo inspector ordering without inventing values.
 * Emits 3–6 key facts per decision-brief-v1.
 */

import {
  fieldDisplay,
} from "@/lib/decision-brief/fields";

import type {
  DecisionBriefActionType,
  DecisionBriefEvidenceFieldKey,
  DecisionBriefEvidenceFields,
  Field,
} from "@/lib/decision-brief/types";

import {
  formatDemoDataQualityScore,
  formatDemoUnknownNumber,
} from "@/lib/demo/m7-decision-demo-format";

type KeyFact = {
  field: DecisionBriefEvidenceFieldKey;
  label: string;
  display: string;
  fieldState: "known" | "unknown" | "not_applicable";
};

function displayForNumberField(
  field: Field<number>,
  options?: {
    digits?: number;
    suffix?: string;
    dataQuality?: boolean;
  },
): string {
  if (
    field.state !== "known"
  ) {
    return "Unknown";
  }

  if (
    options?.dataQuality
  ) {
    return formatDemoDataQualityScore(
      field.value,
    );
  }

  return formatDemoUnknownNumber(
    field.value,
    {
      digits: options?.digits,
      suffix: options?.suffix,
    },
  );
}

function fact(
  fieldKey: DecisionBriefEvidenceFieldKey,
  label: string,
  field: Field<number>,
  options?: {
    digits?: number;
    suffix?: string;
    dataQuality?: boolean;
  },
): KeyFact {
  return {
    field: fieldKey,
    label,
    display: displayForNumberField(
      field,
      options,
    ),
    fieldState: field.state,
  };
}

export function selectKeyEvidenceFacts(
  actionType: DecisionBriefActionType,
  evidence: DecisionBriefEvidenceFields,
): readonly KeyFact[] {
  const facts: KeyFact[] = [
    fact(
      "availableQuantity",
      "Available",
      evidence.availableQuantity,
    ),
    fact(
      "incomingQuantity",
      "Incoming",
      evidence.incomingQuantity,
    ),
  ];

  if (
    actionType === "REORDER"
  ) {
    facts.push(
      fact(
        "reorderPointUnits",
        "Reorder point",
        evidence.reorderPointUnits,
      ),
      fact(
        "targetStockUnits",
        "Target stock",
        evidence.targetStockUnits,
      ),
      fact(
        "leadTimeDays",
        "Lead time",
        evidence.leadTimeDays,
        {
          suffix: " days",
        },
      ),
    );
  } else if (
    actionType === "REDUCE" ||
    actionType === "PROMOTE"
  ) {
    facts.push(
      fact(
        "daysOfStock",
        "Days of stock",
        evidence.daysOfStock,
        {
          digits: 1,
        },
      ),
      fact(
        "inventoryAgeDays",
        "Inventory age",
        evidence.inventoryAgeDays,
        {
          suffix: " days",
        },
      ),
      fact(
        "demandVelocity",
        "Demand velocity",
        evidence.demandVelocity,
        {
          digits: 1,
          suffix: "/day",
        },
      ),
    );
  } else {
    // WATCH — emphasize unknowns / incomplete evidence.
    facts.push(
      fact(
        "demandVelocity",
        "Demand velocity",
        evidence.demandVelocity,
        {
          digits: 1,
          suffix: "/day",
        },
      ),
      fact(
        "daysOfStock",
        "Days of stock",
        evidence.daysOfStock,
        {
          digits: 1,
        },
      ),
      fact(
        "leadTimeDays",
        "Lead time",
        evidence.leadTimeDays,
        {
          suffix: " days",
        },
      ),
    );
  }

  facts.push(
    fact(
      "dataQualityScore",
      "Data quality",
      evidence.dataQualityScore,
      {
        dataQuality: true,
      },
    ),
  );

  return facts.slice(0, 6);
}

export function formatQuantityFieldDisplay(
  field: Field<number>,
): string {
  return fieldDisplay(
    field,
    (value) =>
      formatDemoUnknownNumber(
        typeof value === "number"
          ? value
          : Number.NaN,
      ),
  );
}
