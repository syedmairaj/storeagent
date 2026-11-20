/**
 * AI-INV-1 — trusted server-resolved inventory explainer enablement.
 * Distinct from Actions STOREAGENT_AI_EXPLANATION_*.
 * Defaults: flag OFF, empty allowlist. Client flags never trusted.
 */

export type ServerInventoryExplainerConfig = {
  enabled: boolean;
  organizationAllowlist: readonly string[];
  /** Soft daily token budget per org (process-local). */
  dailyTokenBudget: number;
};

export type ResolvedServerInventoryExplainerEnablement = {
  explainerEnabled: boolean;
  allowlistMatch: boolean;
  enablementSource: "disabled_default" | "server_resolved_config";
  config: ServerInventoryExplainerConfig;
};

const DEFAULT_CONFIG: ServerInventoryExplainerConfig = {
  enabled: false,
  organizationAllowlist: [],
  dailyTokenBudget: 50_000,
};

export function getDefaultServerInventoryExplainerConfig(): ServerInventoryExplainerConfig {
  return {
    enabled: DEFAULT_CONFIG.enabled,
    organizationAllowlist: [...DEFAULT_CONFIG.organizationAllowlist],
    dailyTokenBudget: DEFAULT_CONFIG.dailyTokenBudget,
  };
}

/**
 * STOREAGENT_INVENTORY_EXPLAINER_ENABLED=true
 * STOREAGENT_INVENTORY_EXPLAINER_ORG_ALLOWLIST=org-a,org-b
 * STOREAGENT_INVENTORY_EXPLAINER_DAILY_TOKEN_BUDGET=50000
 */
export function readServerInventoryExplainerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerInventoryExplainerConfig {
  const enabled = env.STOREAGENT_INVENTORY_EXPLAINER_ENABLED === "true";

  const allowlist = (env.STOREAGENT_INVENTORY_EXPLAINER_ORG_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const budgetRaw = env.STOREAGENT_INVENTORY_EXPLAINER_DAILY_TOKEN_BUDGET;
  let dailyTokenBudget = DEFAULT_CONFIG.dailyTokenBudget;
  if (budgetRaw && /^\d+$/.test(budgetRaw)) {
    const parsed = Number(budgetRaw);
    if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= 5_000_000) {
      dailyTokenBudget = parsed;
    }
  }

  return {
    enabled,
    organizationAllowlist: allowlist,
    dailyTokenBudget,
  };
}

export function resolveServerInventoryExplainerEnablement(
  organizationId: string,
  config: ServerInventoryExplainerConfig = readServerInventoryExplainerConfig(),
): ResolvedServerInventoryExplainerEnablement {
  const normalizedOrg = organizationId.trim();

  if (!config.enabled && config.organizationAllowlist.length === 0) {
    return {
      explainerEnabled: false,
      allowlistMatch: false,
      enablementSource: "disabled_default",
      config,
    };
  }

  const allowlistMatch =
    normalizedOrg.length > 0 &&
    config.organizationAllowlist.includes(normalizedOrg);

  return {
    explainerEnabled: config.enabled === true,
    allowlistMatch,
    enablementSource: "server_resolved_config",
    config,
  };
}
