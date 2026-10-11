import type {
  ProviderReconciliationReasonCode,
} from "@/lib/providers/types";

export type CsvRowFailureClassification =
  | {
      disposition:
        "quarantined";

      reasonCode:
        ProviderReconciliationReasonCode;
    }
  | {
      disposition:
        "failed";

      errorCode: string;
    };

export interface CsvOperationalFailureInput {
  errorCode: string;
}

function required(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} must not be empty.`,
    );
  }

  return normalized;
}

/**
 * Source/reconciliation problems are expected data conditions.
 *
 * They are quarantined rather than promoted into infrastructure
 * failure.
 */
export function classifyCsvReconciliationFailure(
  reasonCode:
    ProviderReconciliationReasonCode,
): CsvRowFailureClassification {
  return {
    disposition:
      "quarantined",

    reasonCode,
  };
}

/**
 * Unexpected persistence/operational failures are true row failures.
 *
 * This function deliberately does not classify validation,
 * identity, relationship, or binding conflicts.
 */
export function classifyCsvOperationalFailure(
  input:
    CsvOperationalFailureInput,
): CsvRowFailureClassification {
  return {
    disposition:
      "failed",

    errorCode:
      required(
        input.errorCode,
        "errorCode",
      ),
  };
}
