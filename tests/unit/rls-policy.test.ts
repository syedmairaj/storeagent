import { describe, expect, it } from "vitest";

import {
  allowsClientMutation,
  requiresTrustedServerPath,
  rlsProfileFor,
} from "@/lib/tenancy/rls-policy";

describe("StoreAgent RLS policy architecture", () => {
  it("allows tenant current-state records to be read by authorized clients", () => {
    const profile = rlsProfileFor("tenant_current_state");

    expect(profile.capabilities.has("client_read")).toBe(true);
  });

  it("does not permit generic client mutation of current-state domain records", () => {
    const profile = rlsProfileFor("tenant_current_state");

    expect(allowsClientMutation(profile)).toBe(false);
  });

  it("keeps immutable history read-only to ordinary clients", () => {
    const profile = rlsProfileFor("tenant_immutable_history");

    expect(profile.capabilities.has("client_read")).toBe(true);
    expect(allowsClientMutation(profile)).toBe(false);
  });

  it("requires trusted server paths for membership control", () => {
    const profile = rlsProfileFor("membership_control");

    expect(requiresTrustedServerPath(profile)).toBe(true);
    expect(allowsClientMutation(profile)).toBe(false);
  });

  it("requires trusted server paths for sensitive configuration", () => {
    const profile = rlsProfileFor("sensitive_configuration");

    expect(requiresTrustedServerPath(profile)).toBe(true);
    expect(allowsClientMutation(profile)).toBe(false);
  });
});
