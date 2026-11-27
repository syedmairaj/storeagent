/**
 * AI-MKT-1a — research enablement boundary (separate from L1 commerce-agent).
 *
 * Default OFF. Live execution always forbidden in 1a regardless of flags.
 * Synthetic tests may use explicit injected fixtures only.
 * Do not expand L1 tool allowlist — web_search / market.* remain forbidden.
 */

import {
  isExplicitlyForbiddenToolId,
  L1_FORBIDDEN_TOOL_PREFIXES,
  L1_TOOL_ID_SET,
} from "@/lib/commerce-agent/tools/ids";

export type MarketResearchServerConfig = {
  enabled: boolean;
  organizationAllowlist: readonly string[];
  /** Always false in AI-MKT-1a — live path is impossible. */
  supportsLiveNetwork: false;
};

export type ResolvedMarketResearchEnablement = {
  researchEnabled: boolean;
  allowlistMatch: boolean;
  enablementSource:
    | "disabled_default"
    | "test_injected_fixture"
    | "server_resolved_config";
  supportsLiveNetwork: false;
  liveExecutionAllowed: false;
  config: MarketResearchServerConfig;
};

const DEFAULT_CONFIG: MarketResearchServerConfig = {
  enabled: false,
  organizationAllowlist: [],
  supportsLiveNetwork: false,
};

export function getDefaultMarketResearchConfig(): MarketResearchServerConfig {
  return {
    enabled: DEFAULT_CONFIG.enabled,
    organizationAllowlist: [...DEFAULT_CONFIG.organizationAllowlist],
    supportsLiveNetwork: false,
  };
}

/**
 * Optional future env surface — still cannot unlock live execution in 1a.
 * STOREAGENT_MARKET_RESEARCH_ENABLED=true
 * STOREAGENT_MARKET_RESEARCH_ORG_ALLOWLIST=org-a,org-b
 */
export function readMarketResearchServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): MarketResearchServerConfig {
  const enabled = env.STOREAGENT_MARKET_RESEARCH_ENABLED === "true";
  const allowlist = (env.STOREAGENT_MARKET_RESEARCH_ORG_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return {
    enabled,
    organizationAllowlist: allowlist,
    supportsLiveNetwork: false,
  };
}

export function resolveMarketResearchEnablement(
  organizationId: string,
  config: MarketResearchServerConfig = readMarketResearchServerConfig(),
): ResolvedMarketResearchEnablement {
  const normalizedOrg = organizationId.trim();

  if (!config.enabled && config.organizationAllowlist.length === 0) {
    return {
      researchEnabled: false,
      allowlistMatch: false,
      enablementSource: "disabled_default",
      supportsLiveNetwork: false,
      liveExecutionAllowed: false,
      config: {
        ...config,
        supportsLiveNetwork: false,
      },
    };
  }

  const allowlistMatch =
    normalizedOrg.length > 0 &&
    config.organizationAllowlist.includes(normalizedOrg);

  return {
    researchEnabled: config.enabled === true,
    allowlistMatch,
    enablementSource: "server_resolved_config",
    supportsLiveNetwork: false,
    liveExecutionAllowed: false,
    config: {
      ...config,
      supportsLiveNetwork: false,
    },
  };
}

export type MayRunMarketResearchInput = {
  organizationId: string;
  /**
   * Test-only: inject synthetic fixture path. Does NOT unlock live network.
   * Distinct from commerce-agent forceEnabled.
   */
  allowSyntheticFixtures?: boolean;
  config?: MarketResearchServerConfig;
  /** Reject any attempt to force live network. */
  requestLiveNetwork?: unknown;
};

export type MayRunMarketResearchResult = ResolvedMarketResearchEnablement & {
  mayRunSyntheticFixtures: boolean;
  mayRunLive: false;
  liveBlockedReason: "LIVE_EXECUTION_FORBIDDEN_IN_AI_MKT_1A";
};

/**
 * AI-MKT-1a gate: synthetic fixtures may run only when explicitly injected.
 * Live execution is always false.
 */
export function mayRunMarketResearch(
  input: MayRunMarketResearchInput,
): MayRunMarketResearchResult {
  if (input.requestLiveNetwork === true) {
    const base = resolveMarketResearchEnablement(
      input.organizationId,
      input.config ?? getDefaultMarketResearchConfig(),
    );
    return {
      ...base,
      researchEnabled: false,
      mayRunSyntheticFixtures: false,
      mayRunLive: false,
      liveBlockedReason: "LIVE_EXECUTION_FORBIDDEN_IN_AI_MKT_1A",
      supportsLiveNetwork: false,
      liveExecutionAllowed: false,
    };
  }

  if (input.allowSyntheticFixtures === true) {
    return {
      researchEnabled: true,
      allowlistMatch: true,
      enablementSource: "test_injected_fixture",
      supportsLiveNetwork: false,
      liveExecutionAllowed: false,
      config: input.config ?? getDefaultMarketResearchConfig(),
      mayRunSyntheticFixtures: true,
      mayRunLive: false,
      liveBlockedReason: "LIVE_EXECUTION_FORBIDDEN_IN_AI_MKT_1A",
    };
  }

  const resolved = resolveMarketResearchEnablement(
    input.organizationId,
    input.config ?? readMarketResearchServerConfig(),
  );

  return {
    ...resolved,
    // Even if enabled+allowlisted, 1a has no live path and no execution runtime.
    mayRunSyntheticFixtures: false,
    mayRunLive: false,
    liveBlockedReason: "LIVE_EXECUTION_FORBIDDEN_IN_AI_MKT_1A",
  };
}

/** Live path is structurally impossible in AI-MKT-1a. */
export function assertLiveMarketResearchForbidden(): {
  allowed: false;
  code: "LIVE_EXECUTION_FORBIDDEN";
} {
  return { allowed: false, code: "LIVE_EXECUTION_FORBIDDEN" };
}

/**
 * Confirm L1 tool allowlist was not expanded for market research.
 * web_search / market.* remain explicitly forbidden.
 */
export function assertL1MarketToolsRemainForbidden(): {
  ok: true;
  forbiddenPrefixes: readonly string[];
  webSearchForbidden: true;
  marketPrefixForbidden: true;
  l1DoesNotIncludeMarketTools: true;
} {
  const forbidden = [...L1_FORBIDDEN_TOOL_PREFIXES];
  const webSearchForbidden = forbidden.some(
    (p) => p === "web_search" || p.includes("web_search"),
  );
  const marketPrefixForbidden = forbidden.some(
    (p) => p === "market." || p.startsWith("market"),
  );

  if (!webSearchForbidden || !marketPrefixForbidden) {
    throw new Error("L1_FORBIDDEN_TOOL_PREFIXES_MISSING_MARKET_GUARDS");
  }

  for (const toolId of L1_TOOL_ID_SET) {
    if (
      toolId.startsWith("market.") ||
      toolId.includes("web_search") ||
      isExplicitlyForbiddenToolId(toolId)
    ) {
      // L1 set must not contain forbidden market tools.
      if (toolId.startsWith("market.") || toolId.includes("web_search")) {
        throw new Error(`L1_ALLOWLIST_CONTAINS_MARKET_TOOL:${toolId}`);
      }
    }
  }

  expectForbidden("web_search");
  expectForbidden("web_search.openai");
  expectForbidden("market.research");
  expectForbidden("market.sku_country");

  return {
    ok: true,
    forbiddenPrefixes: forbidden,
    webSearchForbidden: true,
    marketPrefixForbidden: true,
    l1DoesNotIncludeMarketTools: true,
  };
}

function expectForbidden(toolId: string): void {
  if (!isExplicitlyForbiddenToolId(toolId)) {
    throw new Error(`EXPECTED_FORBIDDEN_TOOL_NOT_BLOCKED:${toolId}`);
  }
}
