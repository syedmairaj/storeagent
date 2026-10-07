export type TrustedTenantScopeSource =
  | "resolved_tenant_context"
  | "integration_binding"
  | "billing_binding"
  | "scheduled_job"
  | "canonical_entity";

export interface TrustedServiceTenantScope {
  organizationId: string;
  storeId: string | null;
  source: TrustedTenantScopeSource;
}

export interface ServiceOperationRequest {
  operation: string;
  scope: TrustedServiceTenantScope | null;
}

export function serviceOperationHasTrustedScope(
  request: ServiceOperationRequest,
): boolean {
  return (
    request.scope !== null &&
    request.scope.organizationId.trim().length > 0
  );
}

export function assertServiceOperationScope(
  request: ServiceOperationRequest,
): asserts request is ServiceOperationRequest & {
  scope: TrustedServiceTenantScope;
} {
  if (!serviceOperationHasTrustedScope(request)) {
    throw new Error(
      `Service operation "${request.operation}" requires trusted tenant scope.`,
    );
  }
}

export function isPublicEnvironmentVariable(
  variableName: string,
): boolean {
  return variableName.startsWith("NEXT_PUBLIC_");
}

export function isSafeServiceRoleEnvironmentVariable(
  variableName: string,
): boolean {
  return (
    !isPublicEnvironmentVariable(variableName) &&
    variableName.length > 0
  );
}
