import type {
  Integration,
} from "@/lib/commerce-domain/types";

import {
  assertServiceOperationScope,
} from "@/lib/tenancy/service-role-policy";

import type {
  TrustedServiceTenantScope,
} from "@/lib/tenancy/service-role-policy";

export interface CsvTrustedImportContext {
  organizationId: string;
  integrationId: string;

  /**
   * Store inherited from the canonical Integration.
   *
   * Null means this integration is organization-scoped.
   * CSV content must never fill this value.
   */
  storeId: string | null;

  provider: "csv";

  scope:
    TrustedServiceTenantScope;
}

function required(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} must not be empty.`,
    );
  }

  return normalized;
}

export function buildCsvTrustedImportContext(
  integration: Integration,
  expectedOrganizationId: string,
): CsvTrustedImportContext {
  const organizationId =
    required(
      expectedOrganizationId,
      "organizationId",
    );

  const integrationId =
    required(
      integration.id,
      "integrationId",
    );

  if (
    integration.organizationId !==
    organizationId
  ) {
    throw new Error(
      "CSV integration does not belong to the trusted organization.",
    );
  }

  if (
    integration.provider !==
    "csv"
  ) {
    throw new Error(
      'CSV import requires integration provider "csv".',
    );
  }

  if (
    integration.status !==
    "active"
  ) {
    throw new Error(
      `CSV integration must be active; received "${integration.status}".`,
    );
  }

  const scope:
    TrustedServiceTenantScope = {
      organizationId,

      storeId:
        integration.storeId,

      source:
        "integration_binding",
    };

  assertServiceOperationScope({
    operation:
      "csv_import",

    scope,
  });

  return {
    organizationId,
    integrationId,

    storeId:
      integration.storeId,

    provider:
      "csv",

    scope,
  };
}

/**
 * Store-scoped canonical resources must never silently inherit
 * a store from CSV content.
 *
 * A null integration store can support organization-scoped work
 * such as suppliers, but cannot directly authorize store-scoped
 * canonical writes.
 */
export function requireCsvStoreScopedContext(
  context:
    CsvTrustedImportContext,
): CsvTrustedImportContext & {
  storeId: string;
  scope:
    TrustedServiceTenantScope & {
      storeId: string;
    };
} {
  if (
    context.storeId === null
  ) {
    throw new Error(
      "CSV store-scoped import requires a store-scoped trusted integration.",
    );
  }

  return context as
    CsvTrustedImportContext & {
      storeId: string;
      scope:
        TrustedServiceTenantScope & {
          storeId: string;
        };
    };
}
