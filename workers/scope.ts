import {
  assertServiceOperationScope,
  type TrustedServiceTenantScope,
} from "@/lib/tenancy/service-role-policy";

export interface WorkerExecutionScope {
  organizationId: string;
  storeId: string | null;

  /**
   * Explicit technical purpose of this job.
   *
   * The frozen job-purpose vocabulary is defined later in M0.8.
   * M0.8.1 only requires a non-empty purpose.
   */
  purpose: string;
}

/**
 * Ownership evidence must come from trusted canonical records
 * loaded by application code.
 *
 * Never construct this from arbitrary external/provider identifiers.
 */
export interface WorkerOwnedReference {
  resourceType: string;
  resourceId: string;
  organizationId: string;

  /**
   * null means the referenced canonical record is organization-scoped
   * rather than store-scoped.
   */
  storeId: string | null;
}

export interface WorkerScopeValidationInput {
  scope: WorkerExecutionScope;

  /**
   * Canonical records the worker intends to operate on.
   *
   * The persistence layer is responsible for loading these records
   * using explicit tenant-scoped queries before execution.
   */
  ownedReferences: readonly WorkerOwnedReference[];
}

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      `Worker ${field} must not be empty.`,
    );
  }

  return normalized;
}

export function workerScopeAsTrustedServiceScope(
  scope: WorkerExecutionScope,
): TrustedServiceTenantScope {
  const organizationId =
    requireNonEmpty(
      scope.organizationId,
      "organizationId",
    );

  const storeId =
    scope.storeId === null
      ? null
      : requireNonEmpty(
          scope.storeId,
          "storeId",
        );

  return {
    organizationId,
    storeId,
    source: "scheduled_job",
  };
}

export function assertWorkerExecutionScope(
  input: WorkerScopeValidationInput,
): void {
  const purpose =
    requireNonEmpty(
      input.scope.purpose,
      "purpose",
    );

  const trustedScope =
    workerScopeAsTrustedServiceScope(
      input.scope,
    );

  assertServiceOperationScope({
    operation: purpose,
    scope: trustedScope,
  });

  for (
    const reference of
    input.ownedReferences
  ) {
    const resourceType =
      requireNonEmpty(
        reference.resourceType,
        "reference resourceType",
      );

    const resourceId =
      requireNonEmpty(
        reference.resourceId,
        "reference resourceId",
      );

    const referenceOrganizationId =
      requireNonEmpty(
        reference.organizationId,
        "reference organizationId",
      );

    if (
      referenceOrganizationId !==
      trustedScope.organizationId
    ) {
      throw new Error(
        `Worker scope denied: ${resourceType} "${resourceId}" does not belong to organization "${trustedScope.organizationId}".`,
      );
    }

    if (
      trustedScope.storeId !== null &&
      reference.storeId !== null &&
      reference.storeId !==
        trustedScope.storeId
    ) {
      throw new Error(
        `Worker scope denied: ${resourceType} "${resourceId}" does not belong to store "${trustedScope.storeId}".`,
      );
    }
  }
}
