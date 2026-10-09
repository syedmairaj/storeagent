import {
  describe,
  expect,
  it,
} from "vitest";

import {
  identityFromVerifiedClaims,
} from "@/lib/auth/claims";

describe(
  "StoreAgent verified authentication claims",
  () => {
    it(
      "maps verified subject and email",
      () => {
        expect(
          identityFromVerifiedClaims({
            sub:
              "user-1",

            email:
              "merchant@example.com",
          }),
        ).toEqual({
          userId:
            "user-1",

          email:
            "merchant@example.com",
        });
      },
    );

    it(
      "allows authenticated identity without email",
      () => {
        expect(
          identityFromVerifiedClaims({
            sub:
              "user-1",
          }),
        ).toEqual({
          userId:
            "user-1",

          email:
            null,
        });
      },
    );

    it(
      "does not trust a non-string email",
      () => {
        expect(
          identityFromVerifiedClaims({
            sub:
              "user-1",

            email:
              123,
          }),
        ).toEqual({
          userId:
            "user-1",

          email:
            null,
        });
      },
    );

    it(
      "rejects missing subject",
      () => {
        expect(
          identityFromVerifiedClaims({
            email:
              "merchant@example.com",
          }),
        ).toBeNull();
      },
    );

    it(
      "rejects blank subject",
      () => {
        expect(
          identityFromVerifiedClaims({
            sub:
              "   ",
          }),
        ).toBeNull();
      },
    );

    it(
      "rejects non-string subject",
      () => {
        expect(
          identityFromVerifiedClaims({
            sub:
              123,
          }),
        ).toBeNull();
      },
    );

    it(
      "rejects non-object claims",
      () => {
        expect(
          identityFromVerifiedClaims(
            "user-1",
          ),
        ).toBeNull();
      },
    );

    it(
      "does not convert tenant-looking claims into authentication identity",
      () => {
        expect(
          identityFromVerifiedClaims({
            sub:
              "user-1",

            email:
              "merchant@example.com",

            organization_id:
              "org-attacker",

            store_id:
              "store-attacker",

            role:
              "owner",
          }),
        ).toEqual({
          userId:
            "user-1",

          email:
            "merchant@example.com",
        });
      },
    );
  },
);
