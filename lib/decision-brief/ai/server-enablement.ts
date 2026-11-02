/**
 * M7.4e E3.3 — trusted server-resolved AI explanation enablement.
 *
 * Defaults: flag OFF, empty allowlist.
 * Client HTTP/query/body flags and model outputs are never consulted.
 * Organization membership remains separately server-resolved.
 *
 * Tests inject config explicitly via resolveServerAiExplanationEnablement /
 * composeDemoDecisionBriefWithAi({ serverConfig }) — no process-global
 * mutable override exists.
 */

export type ServerAiExplanationConfig = {
  /**
   * Global soft-enable switch. Default false.
   */
  enabled: boolean;
  /**
   * Organization IDs permitted to attempt synthetic AI explanation.
   * Empty ⇒ no org matches even if enabled.
   */
  organizationAllowlist: readonly string[];
};

export type ResolvedServerAiExplanationEnablement = {
  aiExplanationEnabled: boolean;
  allowlistMatch: boolean;
  /**
   * disabled_default when both sides are inert; otherwise server_resolved_config
   * even if allowlist misses (so pretenders cannot confuse source).
   */
  enablementSource:
    | "disabled_default"
    | "server_resolved_config";
  config: ServerAiExplanationConfig;
};

const DEFAULT_SERVER_AI_EXPLANATION_CONFIG: ServerAiExplanationConfig = {
  enabled: false,
  organizationAllowlist: [],
};

export function getDefaultServerAiExplanationConfig(): ServerAiExplanationConfig {
  return {
    enabled: DEFAULT_SERVER_AI_EXPLANATION_CONFIG.enabled,
    organizationAllowlist: [
      ...DEFAULT_SERVER_AI_EXPLANATION_CONFIG.organizationAllowlist,
    ],
  };
}

/**
 * Read trusted server config. Optional non-secret env toggles supported;
 * defaults remain OFF / empty when unset.
 *
 * STOREAGENT_AI_EXPLANATION_ENABLED=true
 * STOREAGENT_AI_EXPLANATION_ORG_ALLOWLIST=org-a,org-b
 *
 * Never reads request query/body. Env is process-trusted only.
 */
export function readServerAiExplanationConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerAiExplanationConfig {
  const enabled =
    env.STOREAGENT_AI_EXPLANATION_ENABLED === "true";

  const allowlist =
    (
      env.STOREAGENT_AI_EXPLANATION_ORG_ALLOWLIST ??
      ""
    )
      .split(",")
      .map(
        (entry) =>
          entry.trim(),
      )
      .filter(
        (entry) =>
          entry.length > 0,
      );

  return {
    enabled,
    organizationAllowlist: allowlist,
  };
}

/**
 * Resolve enablement for a server-authenticated organization id.
 * Never trusts client-supplied enablement booleans.
 *
 * Pass an explicit `config` in tests; production callers omit it so
 * readServerAiExplanationConfig() supplies the trusted source.
 */
export function resolveServerAiExplanationEnablement(
  organizationId: string,
  config: ServerAiExplanationConfig =
    readServerAiExplanationConfig(),
): ResolvedServerAiExplanationEnablement {
  const normalizedOrg =
    organizationId.trim();

  if (
    !config.enabled &&
    config.organizationAllowlist.length === 0
  ) {
    return {
      aiExplanationEnabled: false,
      allowlistMatch: false,
      enablementSource: "disabled_default",
      config,
    };
  }

  const allowlistMatch =
    normalizedOrg.length > 0 &&
    config.organizationAllowlist.includes(
      normalizedOrg,
    );

  return {
    aiExplanationEnabled: config.enabled === true,
    allowlistMatch,
    enablementSource: "server_resolved_config",
    config,
  };
}
