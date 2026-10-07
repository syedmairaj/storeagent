import { describe, expect, it } from "vitest";

import {
  assertServiceOperationScope,
  isPublicEnvironmentVariable,
  isSafeServiceRoleEnvironmentVariable,
  serviceOperationHasTrustedScope,
} from "@/lib/tenancy/service-role-policy";

describe("StoreAgent service-role policy", () => {
  it("requires explicit trusted tenant scope", () => {
    expect(
      serviceOperationHasTrustedScope({
        operation: "calculate_forecast",
        scope: {
          organizationId: "org-a",
          storeId: "store-a",
          source: "scheduled_job",
        },
      }),
    ).toBe(true);
  });

  it("rejects missing service-role tenant scope", () => {
    expect(
      serviceOperationHasTrustedScope({
        operation: "calculate_forecast",
        scope: null,
      }),
    ).toBe(false);
  });

  it("fails closed when privileged operation lacks tenant scope", () => {
    expect(() =>
      assertServiceOperationScope({
        operation: "sync_store",
        scope: null,
      }),
    ).toThrow(
      'Service operation "sync_store" requires trusted tenant scope.',
    );
  });

  it("rejects browser-exposable environment variable names for service secrets", () => {
    expect(
      isPublicEnvironmentVariable(
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
      ),
    ).toBe(true);

    expect(
      isSafeServiceRoleEnvironmentVariable(
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
      ),
    ).toBe(false);
  });

  it("allows server-only environment variable naming", () => {
    expect(
      isSafeServiceRoleEnvironmentVariable(
        "SUPABASE_SERVICE_ROLE_KEY",
      ),
    ).toBe(true);
  });
});
