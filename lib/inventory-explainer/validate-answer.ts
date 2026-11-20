/**
 * AI-INV-1.1 — reject invented numbers, unsupported causal claims,
 * purchasing directives, and prompt injection.
 *
 * Numbers must appear in evidence allowlistedLiterals (built from the grain).
 * Structural constants are NOT freely permitted unless present in evidence.
 */

import { isAllowedNextStepCode } from "@/lib/inventory-explainer/next-steps";
import {
  INVENTORY_EXPLAINER_ANSWER_VERSION,
  type InventoryExplainerAiCandidate,
  type InventoryExplainerEvidence,
  type InventoryExplainerFactId,
  type InventoryExplainerRejectionCode,
} from "@/lib/inventory-explainer/types";

const FORBIDDEN_ACTION_PATTERNS: readonly RegExp[] = [
  /\breorder\b/i,
  /\breduce\b/i,
  /\bpromote\b/i,
  /\bwatch\b/i,
  /\bbuy\s+now\b/i,
  /\bpurchase\s+now\b/i,
  /\border\s+now\b/i,
  /\bauto[- ]?buy\b/i,
  /\bplace\s+(an\s+)?order\b/i,
  /\broq\b/i,
  /\brecommended\s+order\s+qty\b/i,
  /\bstockout\s+on\b/i,
  /\bwill\s+stock\s*out\b/i,
  /\bsavings\b/i,
  /\bROI\b/,
  /\$\s*\d/,
  /\bconfidence\s*:?\s*\d+\s*%/i,
  /\b\d+\s*%\s*confident\b/i,
  /\blead\s*time\s*=\s*\d+/i,
  /\bMOQ\s*=\s*\d+/i,
];

/**
 * Unsupported causal / popularity / financial assertions — even when numbers
 * happen to match structural constants in evidence.
 */
const FORBIDDEN_SEMANTIC_PATTERNS: readonly RegExp[] = [
  /\bunpopular\b/i,
  /\bpopular\b/i,
  /\bcustomers?\s+hate\b/i,
  /\bcustomers?\s+love\b/i,
  /\blost\s+sales?\b/i,
  /\brevenue\b/i,
  /\bprofit\b/i,
  /\bwill\s+sell\b/i,
  /\bforecast(ed|ing)?\s+\d+/i,
  /\bcaused\s+by\b/i,
  /\bbecause\s+(customers?|shoppers?|people)\b/i,
  /\bmarket\s+share\b/i,
  /\btrending\b/i,
  /\bguaranteed\b/i,
];

/**
 * Mentions of REORDER etc. as *unauthorized* / *not* actions are allowed in
 * deterministic copy. Candidate AI prose must not issue them as directives.
 */
const AUTHORIZED_ACTION_FENCE =
  /\b(not|never|no|without|stay|stays|remain|remains|unauthorized|forbidden)\b[\s\S]{0,40}\b(reorder|reduce|promote|watch)\b/i;

const INJECTION_MARKERS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*:/i,
  /<\s*\/?\s*script\b/i,
  /\bexfiltrat/i,
  /\bapi[_-]?key\b/i,
  /\bauthorization:\s*bearer\b/i,
];

export type ValidateCandidateResult =
  | { ok: true }
  | {
      ok: false;
      reasons: readonly InventoryExplainerRejectionCode[];
      detail: string;
    };

function extractNumbers(text: string): string[] {
  return text.match(/-?\d+(?:\.\d+)?/g) ?? [];
}

function normalizeLiteral(value: string): string {
  if (/^-?\d+\.0+$/.test(value)) {
    return String(Number(value));
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return value.replace(/\.?0+$/, "") || "0";
  }
  return value;
}

function numberAllowed(
  literal: string,
  allowlist: ReadonlySet<string>,
): boolean {
  const n = normalizeLiteral(literal);
  return allowlist.has(literal) || allowlist.has(n);
}

export function detectForbiddenActionClaims(text: string): boolean {
  for (const pattern of FORBIDDEN_ACTION_PATTERNS) {
    if (!pattern.test(text)) {
      continue;
    }
    if (
      (/\breorder\b/i.test(text) ||
        /\breduce\b/i.test(text) ||
        /\bpromote\b/i.test(text) ||
        /\bwatch\b/i.test(text)) &&
      AUTHORIZED_ACTION_FENCE.test(text)
    ) {
      if (
        /\bbuy\s+now\b/i.test(text) ||
        /\bpurchase\s+now\b/i.test(text) ||
        /\broq\b/i.test(text) ||
        /\$\s*\d/.test(text) ||
        /\bsavings\b/i.test(text) ||
        /\bconfidence\s*:?\s*\d+\s*%/i.test(text)
      ) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

export function detectUnsupportedSemanticClaims(text: string): boolean {
  return FORBIDDEN_SEMANTIC_PATTERNS.some((p) => p.test(text));
}

export function detectPromptInjection(text: string): boolean {
  return INJECTION_MARKERS.some((p) => p.test(text));
}

/**
 * Validate an AI candidate against evidence.
 */
export function validateInventoryExplainerAiCandidate(
  evidence: InventoryExplainerEvidence,
  candidate: InventoryExplainerAiCandidate,
): ValidateCandidateResult {
  if (candidate.schemaVersion !== INVENTORY_EXPLAINER_ANSWER_VERSION) {
    return {
      ok: false,
      reasons: ["MALFORMED_OUTPUT"],
      detail: "Unsupported answer schema version.",
    };
  }

  if (candidate.evidenceHash !== evidence.evidenceHash) {
    return {
      ok: false,
      reasons: ["STALE_EVIDENCE"],
      detail: "Candidate evidenceHash does not match server evidence.",
    };
  }

  const answer = candidate.merchantAnswer?.trim() ?? "";
  if (answer.length < 8 || answer.length > 1600) {
    return {
      ok: false,
      reasons: ["MALFORMED_OUTPUT"],
      detail: "merchantAnswer length out of bounds.",
    };
  }

  if (
    detectPromptInjection(answer) ||
    detectPromptInjection(evidence.productTitleSafe)
  ) {
    return {
      ok: false,
      reasons: ["PROMPT_INJECTION_SUSPECT"],
      detail: "Prompt-injection markers detected.",
    };
  }

  if (detectForbiddenActionClaims(answer)) {
    return {
      ok: false,
      reasons: ["FORBIDDEN_ACTION_CLAIM"],
      detail: "Unsupported commercial or predictive claim.",
    };
  }

  if (detectUnsupportedSemanticClaims(answer)) {
    return {
      ok: false,
      reasons: ["FORBIDDEN_ACTION_CLAIM"],
      detail: "Unsupported causal or market assertion.",
    };
  }

  const allowlist = new Set(evidence.allowlistedLiterals);
  for (const num of extractNumbers(answer)) {
    if (!numberAllowed(num, allowlist)) {
      return {
        ok: false,
        reasons: ["HALLUCINATED_NUMBER"],
        detail: `Number ${num} is not present in allowlisted evidence.`,
      };
    }
  }

  const factIds = new Set(evidence.facts.map((f) => f.id));
  for (const id of candidate.citedFactIds ?? []) {
    if (!factIds.has(id as InventoryExplainerFactId)) {
      return {
        ok: false,
        reasons: ["MALFORMED_OUTPUT"],
        detail: `Unknown citation factId: ${id}`,
      };
    }
  }

  for (const code of candidate.suggestedNextStepCodes ?? []) {
    if (!isAllowedNextStepCode(code)) {
      return {
        ok: false,
        reasons: ["FORBIDDEN_ACTION_CLAIM"],
        detail: `Unsupported next-step code: ${code}`,
      };
    }
  }

  return { ok: true };
}
