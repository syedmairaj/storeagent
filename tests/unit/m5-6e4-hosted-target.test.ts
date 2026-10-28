import { describe, expect, it } from "vitest";

import {
  assertM56E4HostedServiceRoleKey,
  assertM56E4HostedSupabaseUrl,
  M56E4_HOSTED_PROJECT_REF,
  redactSecretMeta,
} from "@/lib/canary/m5-6e4-hosted-target";

describe("M5.6E.4 hosted target pin", () => {
  it("accepts only the pinned hosted project URL", () => {
    expect(
      assertM56E4HostedSupabaseUrl(
        `https://${M56E4_HOSTED_PROJECT_REF}.supabase.co`,
      ),
    ).toBe(`https://${M56E4_HOSTED_PROJECT_REF}.supabase.co`);

    expect(
      assertM56E4HostedSupabaseUrl(
        `https://${M56E4_HOSTED_PROJECT_REF}.supabase.co/rest/v1`,
      ),
    ).toBe(`https://${M56E4_HOSTED_PROJECT_REF}.supabase.co`);
  });

  it("fails closed on localhost, other projects, and http", () => {
    expect(() =>
      assertM56E4HostedSupabaseUrl("http://127.0.0.1:54321"),
    ).toThrow(/https/);

    expect(() =>
      assertM56E4HostedSupabaseUrl(
        "https://localhost:54321",
      ),
    ).toThrow(/local/);

    expect(() =>
      assertM56E4HostedSupabaseUrl(
        "https://otherproject.supabase.co",
      ),
    ).toThrow(/qlsqminsfdntpqdkhxjx/);

    expect(() =>
      assertM56E4HostedSupabaseUrl(undefined),
    ).toThrow(/required/);
  });

  it("requires a service-role key without logging it", () => {
    const key = "service-role-key-value-xxxxxxxx";

    expect(assertM56E4HostedServiceRoleKey(key)).toBe(key);
    expect(redactSecretMeta(key)).toEqual({
      present: true,
      length: key.length,
    });
    expect(JSON.stringify(redactSecretMeta(key))).not.toContain(key);

    expect(() =>
      assertM56E4HostedServiceRoleKey("short"),
    ).toThrow(/too short/);
  });
});
