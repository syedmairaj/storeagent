/**
 * AI-ARCH-1d — security / claim detectors (AI-INV parity + commerce extras).
 */

/** Purchase / create / advertising directives — never allowed in drafts. */
const FORBIDDEN_ACTION_PATTERNS: readonly RegExp[] = [
  /\bbuy\s+now\b/i,
  /\bpurchase\s+now\b/i,
  /\border\s+now\b/i,
  /\bauto[- ]?buy\b/i,
  /\bplace\s+(an\s+)?order\b/i,
  /\bcreate\s+(a\s+)?(po|purchase\s+order|reorder)\b/i,
  /\brecommended\s+order\s+qty\b/i,
  /\broq\b/i,
  /\bwill\s+stock\s*out\b/i,
  /\bstockout\s+on\b/i,
  /\bsavings\b/i,
  /\bROI\b/,
  /\$\s*\d/,
  /\bconfidence\s*:?\s*\d+\s*%/i,
  /\b\d+\s*%\s*confident\b/i,
  /\blead\s*time\s*=\s*\d+/i,
  /\bMOQ\s*=\s*\d+/i,
  /\blaunch\s+ads?\b/i,
  /\bincrease\s+(the\s+)?budget\b/i,
  /\bspend\s+credits?\b/i,
  /\bsync\s+(now|run|inventory)\b/i,
  /\boauth\b/i,
  /\benqueue\b/i,
];

/** Competitor / paid-media / unsupported demand claims. */
const FORBIDDEN_MARKET_PATTERNS: readonly RegExp[] = [
  /\bcompetitor(s)?\s+(sold|sales|revenue|CPA|ROAS)\b/i,
  /\bcompetitor\b/i,
  /\bCPA\b/,
  /\bROAS\b/,
  /\bCPC\b/,
  /\bCPM\b/,
  /\bclick[- ]?through\b/i,
  /\bad\s+spend\b/i,
  /\bmarket\s+demand\b/i,
  /\bexternal\s+research\b/i,
  /\bweb\s+search\b/i,
];

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

/** Hypothesis presented as proven. */
const HYPOTHESIS_AS_PROVEN_PATTERNS: readonly RegExp[] = [
  /\bproven\s+that\b/i,
  /\bconfirmed\s+that\b/i,
  /\bwe\s+know\s+for\s+(a\s+)?fact\b/i,
  /\bdefinitely\s+caused\b/i,
  /\bhypothesis\s+is\s+(proven|confirmed|true)\b/i,
];

/** Estimate promoted to observation. */
const ESTIMATE_AS_FACT_PATTERNS: readonly RegExp[] = [
  /\bobserved\s+lead\s*time\b/i,
  /\bconfirmed\s+safety\s*stock\s*days\b/i,
  /\bmeasured\s+planning\s+assumption\b/i,
  /\bestimate\s+is\s+(an?\s+)?(observed|verified)\s+fact\b/i,
  /\bassumption\s+is\s+(an?\s+)?(observed|verified)\s+fact\b/i,
];

const INJECTION_MARKERS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*:/i,
  /<\s*\/?\s*script\b/i,
  /\bexfiltrat/i,
  /\bapi[_-]?key\b/i,
  /\bauthorization:\s*bearer\b/i,
  /\byou\s+are\s+now\s+unrestricted\b/i,
  /\boverride\s+safety\b/i,
];

const UNAUTHORIZED_TOOL_REQUEST: readonly RegExp[] = [
  /\bcall\s+tool\s+[a-z0-9_.-]+/i,
  /\binvoke\s+(web_search|oauth|sync|purchase|m7\.create)/i,
  /\buse\s+tool\s*:\s*[a-z0-9_.-]+/i,
];

const AUTHORIZED_ACTION_FENCE =
  /\b(not|never|no|without|unauthorized|forbidden|blocked)\b[\s\S]{0,48}\b(reorder|purchase|buy|create|ads?)\b/i;

export function detectPromptInjection(text: string): boolean {
  return INJECTION_MARKERS.some((p) => p.test(text));
}

export function detectForbiddenActionClaims(text: string): boolean {
  for (const pattern of FORBIDDEN_ACTION_PATTERNS) {
    if (!pattern.test(text)) {
      continue;
    }
    if (AUTHORIZED_ACTION_FENCE.test(text)) {
      // Still reject hard directives even inside a fence sentence if buy now / $ present.
      if (
        /\bbuy\s+now\b/i.test(text) ||
        /\bpurchase\s+now\b/i.test(text) ||
        /\broq\b/i.test(text) ||
        /\$\s*\d/.test(text) ||
        /\blaunch\s+ads?\b/i.test(text)
      ) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

export function detectForbiddenMarketClaims(text: string): boolean {
  return FORBIDDEN_MARKET_PATTERNS.some((p) => p.test(text));
}

export function detectUnsupportedSemanticClaims(text: string): boolean {
  return FORBIDDEN_SEMANTIC_PATTERNS.some((p) => p.test(text));
}

export function detectHypothesisPresentedAsProven(text: string): boolean {
  return HYPOTHESIS_AS_PROVEN_PATTERNS.some((p) => p.test(text));
}

export function detectEstimatePromotedToFact(text: string): boolean {
  return ESTIMATE_AS_FACT_PATTERNS.some((p) => p.test(text));
}

export function detectUnauthorizedToolRequest(text: string): boolean {
  return UNAUTHORIZED_TOOL_REQUEST.some((p) => p.test(text));
}

export function extractNumbers(text: string): string[] {
  return text.match(/-?\d+(?:\.\d+)?/g) ?? [];
}

export function normalizeLiteral(value: string): string {
  if (/^-?\d+\.0+$/.test(value)) {
    return String(Number(value));
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return value.replace(/\.?0+$/, "") || "0";
  }
  return value;
}

export function numberAllowed(
  literal: string,
  allowlist: ReadonlySet<string>,
): boolean {
  const n = normalizeLiteral(literal);
  return allowlist.has(literal) || allowlist.has(n);
}
