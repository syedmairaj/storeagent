import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

export type Permission =
  | "organization.read"
  | "organization.manage"
  | "organization.delete"
  | "ownership.transfer"
  | "members.read"
  | "members.manage"
  | "stores.read"
  | "stores.manage"
  | "inventory.read"
  | "suppliers.read"
  | "suppliers.manage"
  | "forecasts.read"
  | "actions.read"
  | "actions.decide"
  | "integrations.read"
  | "integrations.manage"
  | "data_quality.read"
  | "reports.read"
  | "billing.read"
  | "billing.manage"
  | "export.read"
  | "export.manage";

const ROLE_PERMISSIONS: Record<
  OrganizationMemberRole,
  ReadonlySet<Permission>
> = {
  owner: new Set<Permission>([
    "organization.read",
    "organization.manage",
    "organization.delete",
    "ownership.transfer",
    "members.read",
    "members.manage",
    "stores.read",
    "stores.manage",
    "inventory.read",
    "suppliers.read",
    "suppliers.manage",
    "forecasts.read",
    "actions.read",
    "actions.decide",
    "integrations.read",
    "integrations.manage",
    "data_quality.read",
    "reports.read",
    "billing.read",
    "billing.manage",
    "export.read",
    "export.manage",
  ]),

  admin: new Set<Permission>([
    "organization.read",
    "organization.manage",
    "members.read",
    "members.manage",
    "stores.read",
    "stores.manage",
    "inventory.read",
    "suppliers.read",
    "suppliers.manage",
    "forecasts.read",
    "actions.read",
    "actions.decide",
    "integrations.read",
    "integrations.manage",
    "data_quality.read",
    "reports.read",
    "billing.read",
    "export.read",
    "export.manage",
  ]),

  analyst: new Set<Permission>([
    "organization.read",
    "stores.read",
    "inventory.read",
    "suppliers.read",
    "forecasts.read",
    "actions.read",
    "integrations.read",
    "data_quality.read",
    "reports.read",
    "export.read",
  ]),

  operator: new Set<Permission>([
    "organization.read",
    "stores.read",
    "inventory.read",
    "suppliers.read",
    "forecasts.read",
    "actions.read",
    "actions.decide",
    "integrations.read",
    "data_quality.read",
    "reports.read",
  ]),
};

export function permissionsForRole(
  role: OrganizationMemberRole,
): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(
  role: OrganizationMemberRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
