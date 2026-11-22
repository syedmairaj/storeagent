import {
  describe,
  expect,
  it,
} from "vitest";

import {
  redactObservabilityValue,
} from "@/lib/observability/redact";

describe(
  "application observability redaction",
  () => {
    it(
      "redacts sensitive object fields recursively",
      () => {
        expect(
          redactObservabilityValue({
            authorization:
              "Bearer super-secret",

            password:
              "password-123",

            nested: {
              accessToken:
                "token-value",

              organizationId:
                "org-a",
            },
          }),
        ).toEqual({
          authorization:
            "[REDACTED]",

          password:
            "[REDACTED]",

          nested: {
            accessToken:
              "[REDACTED]",

            organizationId:
              "org-a",
          },
        });
      },
    );

    it(
      "redacts bearer credentials inside ordinary strings",
      () => {
        const value =
          redactObservabilityValue(
            "request failed with Bearer abc123SECRET",
          );

        expect(
          value,
        ).toBe(
          "request failed with Bearer [REDACTED]",
        );
      },
    );

    it(
      "redacts jwt-looking values",
      () => {
        const value =
          redactObservabilityValue(
            "token eyJabc.def.ghi",
          );

        expect(
          value,
        ).toBe(
          "token [REDACTED]",
        );
      },
    );

    it(
      "handles circular metadata without crashing",
      () => {
        const value:
          Record<
            string,
            unknown
          > =
            {};

        value.self =
          value;

        expect(
          redactObservabilityValue(
            value,
          ),
        ).toEqual({
          self:
            "[CIRCULAR]",
        });
      },
    );

    it(
      "redacts Shopify opaque tokens in free text and nested arrays",
      () => {
        expect(
          redactObservabilityValue(
            "refresh failed for shpat_test_access_token_fixture_aaaa",
          ),
        ).toBe(
          "refresh failed for [REDACTED]",
        );

        expect(
          redactObservabilityValue({
            errors: [
              "got shprt_test_refresh_token_fixture_bbbb from provider",
              {
                detail:
                  "shpss_storefront_fixture_cccc",
              },
            ],
          }),
        ).toEqual({
          errors: [
            "got [REDACTED] from provider",
            {
              detail:
                "[REDACTED]",
            },
          ],
        });
      },
    );

    it(
      "redacts vault envelope field names without requiring token substring",
      () => {
        expect(
          redactObservabilityValue({
            access_ciphertext:
              "\\xaa\\xbb",

            dek_wrapped:
              "\\xcc\\xdd",

            refresh_lock_token:
              "claim-token",

            nested: {
              access_auth_tag:
                "\\xee",

              organizationId:
                "org-safe",
            },
          }),
        ).toEqual({
          access_ciphertext:
            "[REDACTED]",

          dek_wrapped:
            "[REDACTED]",

          refresh_lock_token:
            "[REDACTED]",

          nested: {
            access_auth_tag:
              "[REDACTED]",

            organizationId:
              "org-safe",
          },
        });
      },
    );

    it(
      "preserves safe diagnostics and non-secret business identifiers",
      () => {
        expect(
          redactObservabilityValue({
            organizationId:
              "11111111-1111-4111-8111-111111111111",

            integrationId:
              "22222222-2222-4222-8222-222222222222",

            provider:
              "shopify",

            token_kind:
              "offline_expiring",

            key_version:
              1,

            shop_domain:
              "example.myshopify.com",

            adapterVersion:
              "csv-v1",

            fingerprint:
              "59d7d64dbcc254544f04cdb81ccff699",
          }),
        ).toEqual({
          organizationId:
            "11111111-1111-4111-8111-111111111111",

          integrationId:
            "22222222-2222-4222-8222-222222222222",

          provider:
            "shopify",

          token_kind:
            "offline_expiring",

          key_version:
            1,

          shop_domain:
            "example.myshopify.com",

          adapterVersion:
            "csv-v1",

          fingerprint:
            "59d7d64dbcc254544f04cdb81ccff699",
        });
      },
    );
  },
);
