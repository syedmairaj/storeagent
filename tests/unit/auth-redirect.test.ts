import {
  describe,
  expect,
  it,
} from "vitest";

import {
  safeAuthNextPath,
} from "@/lib/auth/redirect";

describe(
  "StoreAgent authentication redirects",
  () => {
    it(
      "uses root when no target exists",
      () => {
        expect(
          safeAuthNextPath(
            null,
          ),
        ).toBe(
          "/",
        );
      },
    );

    it(
      "preserves a safe application path",
      () => {
        expect(
          safeAuthNextPath(
            "/app",
          ),
        ).toBe(
          "/app",
        );
      },
    );

    it(
      "preserves query and fragment for an internal path",
      () => {
        expect(
          safeAuthNextPath(
            "/app?tab=inventory#top",
          ),
        ).toBe(
          "/app?tab=inventory#top",
        );
      },
    );

    it(
      "rejects absolute external URLs",
      () => {
        expect(
          safeAuthNextPath(
            "https://evil.example",
          ),
        ).toBe(
          "/",
        );
      },
    );

    it(
      "rejects protocol-relative URLs",
      () => {
        expect(
          safeAuthNextPath(
            "//evil.example/path",
          ),
        ).toBe(
          "/",
        );
      },
    );

    it(
      "rejects backslash redirect forms",
      () => {
        expect(
          safeAuthNextPath(
            "/\\evil.example",
          ),
        ).toBe(
          "/",
        );
      },
    );

    it(
      "uses the explicit trusted fallback",
      () => {
        expect(
          safeAuthNextPath(
            "",
            "/login",
          ),
        ).toBe(
          "/login",
        );
      },
    );
  },
);
