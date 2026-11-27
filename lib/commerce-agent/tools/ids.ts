/**
 * AI-ARCH-1b — literal L1 read-only tool allowlist.
 * No dynamic / arbitrary tool execution.
 */

export const L1_TOOL_IDS = [
  "inventory.get_sku_intelligence",
  "inventory.build_explainer_evidence",
  "inventory.classify_guidance_situation",
  "planning.get_inputs",
] as const;

export type L1ToolId = (typeof L1_TOOL_IDS)[number];

export const L1_TOOL_ID_SET: ReadonlySet<string> = new Set(L1_TOOL_IDS);

/** Explicitly forbidden families — never register or invoke. */
export const L1_FORBIDDEN_TOOL_PREFIXES = [
  "oauth.",
  "sync.",
  "vault.",
  "worker.",
  "cron.",
  "web_search",
  "market.",
  "ads.",
  "creative.",
  "credits.",
  "billing.",
  "purchase.",
  "m7.create",
  "decision.create",
  "metrics.enqueue",
  "metrics.recompute",
] as const;

const WRITE_HINT =
  /(^|[._-])(create|save|update|delete|write|enqueue|mutate|purchase|buy|sync|oauth|vault)([._-]|$)/i;

export function isL1ToolId(value: string): value is L1ToolId {
  return L1_TOOL_ID_SET.has(value);
}

export function isExplicitlyForbiddenToolId(toolId: string): boolean {
  const normalized = toolId.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  for (const prefix of L1_FORBIDDEN_TOOL_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.includes(prefix)) {
      return true;
    }
  }
  return WRITE_HINT.test(normalized);
}
