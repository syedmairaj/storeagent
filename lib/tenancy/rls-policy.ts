export type RlsClientCapability =
  | "client_read"
  | "client_insert"
  | "client_update"
  | "client_delete"
  | "server_only";

export type RlsTableClass =
  | "tenant_current_state"
  | "tenant_immutable_history"
  | "membership_control"
  | "sensitive_configuration";

export interface RlsPolicyProfile {
  tableClass: RlsTableClass;
  capabilities: ReadonlySet<RlsClientCapability>;
}

const PROFILES: Record<RlsTableClass, RlsPolicyProfile> = {
  tenant_current_state: {
    tableClass: "tenant_current_state",
    capabilities: new Set<RlsClientCapability>([
      "client_read",
    ]),
  },

  tenant_immutable_history: {
    tableClass: "tenant_immutable_history",
    capabilities: new Set<RlsClientCapability>([
      "client_read",
    ]),
  },

  membership_control: {
    tableClass: "membership_control",
    capabilities: new Set<RlsClientCapability>([
      "client_read",
      "server_only",
    ]),
  },

  sensitive_configuration: {
    tableClass: "sensitive_configuration",
    capabilities: new Set<RlsClientCapability>([
      "client_read",
      "server_only",
    ]),
  },
};

export function rlsProfileFor(
  tableClass: RlsTableClass,
): RlsPolicyProfile {
  return PROFILES[tableClass];
}

export function allowsClientMutation(
  profile: RlsPolicyProfile,
): boolean {
  return (
    profile.capabilities.has("client_insert") ||
    profile.capabilities.has("client_update") ||
    profile.capabilities.has("client_delete")
  );
}

export function requiresTrustedServerPath(
  profile: RlsPolicyProfile,
): boolean {
  return profile.capabilities.has("server_only");
}
