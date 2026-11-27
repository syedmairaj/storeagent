/**
 * AI-MKT-1e — preview isolation helpers.
 * Production merchant paths cannot unlock synthetic or live research via
 * request flags, env overrides, or deployable fixture switches.
 */

/**
 * Env keys that must never unlock synthetic execution in production paths.
 * Documented for tests; production action ignores all of them.
 */
export const FORBIDDEN_SYNTHETIC_ENV_OVERRIDE_KEYS = [
  "STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC",
  "STOREAGENT_MARKET_RESEARCH_FIXTURE_ID",
  "STOREAGENT_MARKET_RESEARCH_FORCE_PREVIEW",
  "STOREAGENT_MARKET_RESEARCH_SYNTHETIC_MODE",
  "NEXT_PUBLIC_MARKET_RESEARCH_SYNTHETIC",
  "NEXT_PUBLIC_MARKET_RESEARCH_ENABLED",
] as const;

/**
 * Assert production/deployable paths never treat env as synthetic authority.
 * Returns false when any forbidden override is set — callers must refuse execution.
 */
export function detectForbiddenSyntheticEnvOverrides(
  env: NodeJS.ProcessEnv = process.env,
): {
  blocked: boolean;
  keysPresent: readonly string[];
} {
  const keysPresent = FORBIDDEN_SYNTHETIC_ENV_OVERRIDE_KEYS.filter((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
  return {
    blocked: keysPresent.length > 0,
    keysPresent,
  };
}

/**
 * Production merchant execution is always forbidden for synthetic + live.
 * Isolated harnesses inject trusted fixtures via ports — never via env/public flags.
 */
export function assertProductionMarketResearchExecutionForbidden(): {
  syntheticAllowed: false;
  liveAllowed: false;
  deployableFixtureOverrideAllowed: false;
  publicDemoEndpointAllowed: false;
} {
  return {
    syntheticAllowed: false,
    liveAllowed: false,
    deployableFixtureOverrideAllowed: false,
    publicDemoEndpointAllowed: false,
  };
}

/**
 * Soft UI visibility only — never unlocks orchestration by itself.
 * Default OFF (enabled ∧ allowlist). Distinct from synthetic injection.
 */
export function mayShowMarketResearchPanel(input: {
  organizationId: string;
  researchEnabled: boolean;
  allowlistMatch: boolean;
}): boolean {
  return (
    input.researchEnabled === true &&
    input.allowlistMatch === true &&
    input.organizationId.trim().length > 0
  );
}
