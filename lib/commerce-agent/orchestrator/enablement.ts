/**
 * AI-ARCH-1c — server-side commerce-agent soft-enable.
 * Distinct from STOREAGENT_INVENTORY_EXPLAINER_* and Actions AI flags.
 * Default OFF. Client flags never trusted. No live route wiring in 1c.
 */

export type CommerceAgentServerConfig = {
  enabled: boolean;
  organizationAllowlist: readonly string[];
};

export type ResolvedCommerceAgentEnablement = {
  agentEnabled: boolean;
  allowlistMatch: boolean;
  enablementSource: "disabled_default" | "test_injected" | "server_resolved_config";
  config: CommerceAgentServerConfig;
};

const DEFAULT_CONFIG: CommerceAgentServerConfig = {
  enabled: false,
  organizationAllowlist: [],
};

export function getDefaultCommerceAgentConfig(): CommerceAgentServerConfig {
  return {
    enabled: DEFAULT_CONFIG.enabled,
    organizationAllowlist: [...DEFAULT_CONFIG.organizationAllowlist],
  };
}

/**
 * STOREAGENT_COMMERCE_AGENT_ENABLED=true
 * STOREAGENT_COMMERCE_AGENT_ORG_ALLOWLIST=org-a,org-b
 */
export function readCommerceAgentServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): CommerceAgentServerConfig {
  const enabled = env.STOREAGENT_COMMERCE_AGENT_ENABLED === "true";
  const allowlist = (env.STOREAGENT_COMMERCE_AGENT_ORG_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return {
    enabled,
    organizationAllowlist: allowlist,
  };
}

export function resolveCommerceAgentEnablement(
  organizationId: string,
  config: CommerceAgentServerConfig = readCommerceAgentServerConfig(),
): ResolvedCommerceAgentEnablement {
  const normalizedOrg = organizationId.trim();

  if (!config.enabled && config.organizationAllowlist.length === 0) {
    return {
      agentEnabled: false,
      allowlistMatch: false,
      enablementSource: "disabled_default",
      config,
    };
  }

  const allowlistMatch =
    normalizedOrg.length > 0 &&
    config.organizationAllowlist.includes(normalizedOrg);

  return {
    agentEnabled: config.enabled === true,
    allowlistMatch,
    enablementSource: "server_resolved_config",
    config,
  };
}

export function mayRunCommerceAgent(input: {
  organizationId: string;
  forceEnabled?: boolean;
  config?: CommerceAgentServerConfig;
}): ResolvedCommerceAgentEnablement & { mayRun: boolean } {
  if (input.forceEnabled === true) {
    return {
      agentEnabled: true,
      allowlistMatch: true,
      enablementSource: "test_injected",
      config: input.config ?? getDefaultCommerceAgentConfig(),
      mayRun: true,
    };
  }

  const resolved = resolveCommerceAgentEnablement(
    input.organizationId,
    input.config ?? readCommerceAgentServerConfig(),
  );

  return {
    ...resolved,
    mayRun: resolved.agentEnabled === true && resolved.allowlistMatch === true,
  };
}
