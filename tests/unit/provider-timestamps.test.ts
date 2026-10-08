import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeOptionalProviderTimestamp,
  normalizeProviderTimestamp,
} from "@/lib/providers/timestamps";

describe("provider timestamp normalization", () => {
  it("accepts UTC Z timestamps", () => {
    expect(
      normalizeProviderTimestamp(
        "2026-10-08T06:30:00Z",
      ),
    ).toEqual({
      value:
        "2026-10-08T06:30:00.000Z",
      sourceValue:
        "2026-10-08T06:30:00Z",
    });
  });

  it("accepts explicit timezone offsets and normalizes to UTC", () => {
    expect(
      normalizeProviderTimestamp(
        "2026-10-08T10:30:00+04:00",
      ).value,
    ).toBe(
      "2026-10-08T06:30:00.000Z",
    );
  });

  it("preserves the trimmed original source value", () => {
    expect(
      normalizeProviderTimestamp(
        "  2026-10-08T10:30:00+04:00  ",
      ).sourceValue,
    ).toBe(
      "2026-10-08T10:30:00+04:00",
    );
  });

  it("accepts fractional seconds", () => {
    expect(
      normalizeProviderTimestamp(
        "2026-10-08T06:30:00.123Z",
      ).value,
    ).toBe(
      "2026-10-08T06:30:00.123Z",
    );
  });

  it("rejects timezone-less timestamps", () => {
    expect(() =>
      normalizeProviderTimestamp(
        "2026-10-08T06:30:00",
      ),
    ).toThrow(
      "Provider timestamp must include an explicit timezone.",
    );
  });

  it("rejects date-only values", () => {
    expect(() =>
      normalizeProviderTimestamp(
        "2026-10-08",
      ),
    ).toThrow(
      "Provider timestamp must include an explicit timezone.",
    );
  });

  it("rejects impossible calendar dates", () => {
    expect(() =>
      normalizeProviderTimestamp(
        "2026-02-31T06:30:00Z",
      ),
    ).toThrow(
      "Provider timestamp is invalid.",
    );
  });

  it("rejects impossible clock times", () => {
    expect(() =>
      normalizeProviderTimestamp(
        "2026-10-08T25:30:00Z",
      ),
    ).toThrow(
      "Provider timestamp is invalid.",
    );
  });

  it("rejects invalid timezone offsets", () => {
    expect(() =>
      normalizeProviderTimestamp(
        "2026-10-08T06:30:00+25:00",
      ),
    ).toThrow(
      "Provider timestamp timezone offset is invalid.",
    );
  });

  it("keeps null optional timestamps null", () => {
    expect(
      normalizeOptionalProviderTimestamp(
        null,
      ),
    ).toBeNull();
  });

  it("treats blank optional timestamps as unavailable", () => {
    expect(
      normalizeOptionalProviderTimestamp(
        "   ",
      ),
    ).toBeNull();
  });

  it("does not depend on machine-local timezone", () => {
    const result =
      normalizeProviderTimestamp(
        "2026-10-08T00:00:00-04:00",
      );

    expect(result.value).toBe(
      "2026-10-08T04:00:00.000Z",
    );
  });
});
