import {
  tenantContextMatchesRequestedScope,
} from "@/lib/tenancy/guards";

import {
  roleHasPermission,
} from "@/lib/tenancy/permissions";

import {
  resolveTenantContext,
} from "@/lib/tenancy/resolve-context";

import {
  allowsClientMutation,
  requiresTrustedServerPath,
  rlsProfileFor,
} from "@/lib/tenancy/rls-policy";

import {
  serviceOperationHasTrustedScope,
} from "@/lib/tenancy/service-role-policy";

import {
  assessProviderBindingReplay,
  buildProviderBindingKey,
  hasAmbiguousBindings,
} from "@/lib/providers/bindings";

type TenantResolutionInput =
  Parameters<
    typeof resolveTenantContext
  >[0];

type RequestedScopeMatchInput = {
  context:
    Parameters<
      typeof tenantContextMatchesRequestedScope
    >[0];

  requested:
    Parameters<
      typeof tenantContextMatchesRequestedScope
    >[1];
};

type PermissionInput = {
  role:
    Parameters<
      typeof roleHasPermission
    >[0];

  permission:
    Parameters<
      typeof roleHasPermission
    >[1];
};

type ServiceScopeInput =
  Parameters<
    typeof serviceOperationHasTrustedScope
  >[0];

type ProviderBindingIdentity =
  Parameters<
    typeof buildProviderBindingKey
  >[0];

type ProviderReplayInput = {
  existing:
    Parameters<
      typeof assessProviderBindingReplay
    >[0];

  incoming:
    Parameters<
      typeof assessProviderBindingReplay
    >[1];
};

type AmbiguousBindingsInput =
  Parameters<
    typeof hasAmbiguousBindings
  >[0];

type RlsTableClass =
  Parameters<
    typeof rlsProfileFor
  >[0];

export type ProviderReplayEvaluationResult =
  | {
      kind: "result";
      disposition:
        | "create"
        | "idempotent"
        | "conflict";
    }
  | {
      kind: "error";
      message: string;
    };

export type TenancyAdversarialCase =
  | {
      operation:
        "resolve_tenant";

      input:
        TenantResolutionInput;

      expected:
        ReturnType<
          typeof resolveTenantContext
        >;
    }
  | {
      operation:
        "requested_scope_matches";

      input:
        RequestedScopeMatchInput;

      expected:
        boolean;
    }
  | {
      operation:
        "role_permission";

      input:
        PermissionInput;

      expected:
        boolean;
    }
  | {
      operation:
        "service_scope";

      input:
        ServiceScopeInput;

      expected:
        boolean;
    }
  | {
      operation:
        "provider_keys_distinct";

      input: {
        first:
          ProviderBindingIdentity;

        second:
          ProviderBindingIdentity;
      };

      expected:
        boolean;
    }
  | {
      operation:
        "provider_replay";

      input:
        ProviderReplayInput;

      expected:
        ProviderReplayEvaluationResult;
    }
  | {
      operation:
        "ambiguous_bindings";

      input:
        AmbiguousBindingsInput;

      expected:
        boolean;
    }
  | {
      operation:
        "rls_client_mutation";

      input:
        RlsTableClass;

      expected:
        boolean;
    }
  | {
      operation:
        "rls_trusted_server_required";

      input:
        RlsTableClass;

      expected:
        boolean;
    };

function evaluateProviderReplay(
  input: ProviderReplayInput,
): ProviderReplayEvaluationResult {
  try {
    const result =
      assessProviderBindingReplay(
        input.existing,
        input.incoming,
      );

    return {
      kind: "result",
      disposition:
        result.disposition,
    };
  } catch (error) {
    return {
      kind: "error",

      message:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

export function runTenancyAdversarialCase(
  evaluationCase:
    TenancyAdversarialCase,
):
  TenancyAdversarialCase["expected"] {
  switch (
    evaluationCase.operation
  ) {
    case "resolve_tenant":
      return resolveTenantContext(
        evaluationCase.input,
      );

    case "requested_scope_matches":
      return tenantContextMatchesRequestedScope(
        evaluationCase.input.context,
        evaluationCase.input.requested,
      );

    case "role_permission":
      return roleHasPermission(
        evaluationCase.input.role,
        evaluationCase.input.permission,
      );

    case "service_scope":
      return serviceOperationHasTrustedScope(
        evaluationCase.input,
      );

    case "provider_keys_distinct":
      return (
        buildProviderBindingKey(
          evaluationCase.input.first,
        ) !==
        buildProviderBindingKey(
          evaluationCase.input.second,
        )
      );

    case "provider_replay":
      return evaluateProviderReplay(
        evaluationCase.input,
      );

    case "ambiguous_bindings":
      return hasAmbiguousBindings(
        evaluationCase.input,
      );

    case "rls_client_mutation":
      return allowsClientMutation(
        rlsProfileFor(
          evaluationCase.input,
        ),
      );

    case "rls_trusted_server_required":
      return requiresTrustedServerPath(
        rlsProfileFor(
          evaluationCase.input,
        ),
      );
  }
}
