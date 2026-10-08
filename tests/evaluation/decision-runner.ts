import {
  decideInventoryAction,
} from "@/lib/decision-engine/decide";

import {
  buildInventoryActionEvidence,
} from "@/lib/decision-engine/evidence-snapshot";

import type {
  InventoryActionEvidenceInput,
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

export type DecisionEvaluationCase =
  | {
      operation: "decide";

      input:
        InventoryDecisionInput;

      expected:
        ReturnType<
          typeof decideInventoryAction
        >;
    }
  | {
      operation: "evidence";

      input:
        InventoryActionEvidenceInput;

      expected:
        ReturnType<
          typeof buildInventoryActionEvidence
        >;
    };

export function runDecisionEvaluationCase(
  evaluationCase:
    DecisionEvaluationCase,
): DecisionEvaluationCase["expected"] {
  switch (
    evaluationCase.operation
  ) {
    case "decide":
      return decideInventoryAction(
        evaluationCase.input,
      );

    case "evidence":
      return buildInventoryActionEvidence(
        evaluationCase.input,
      );
  }
}
