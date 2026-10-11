import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assessSyncRunReplay,
  buildSyncRunReplayKey,
  normalizeSyncRunReplayIdentity,
} from "@/lib/providers/sync-run-idempotency";

describe(
  "provider sync-run idempotency",
  () => {
    it(
      "normalizes trusted replay identity",
      () => {
        expect(
          normalizeSyncRunReplayIdentity({
            organizationId:
              " org-1 ",

            integrationId:
              " integration-1 ",

            idempotencyKey:
              " upload-abc ",
          }),
        ).toEqual({
          organizationId:
            "org-1",

          integrationId:
            "integration-1",

          idempotencyKey:
            "upload-abc",
        });
      },
    );

    it(
      "builds deterministic key from organization integration and idempotency key",
      () => {
        expect(
          buildSyncRunReplayKey({
            organizationId:
              "org-1",

            integrationId:
              "integration-1",

            idempotencyKey:
              "upload-abc",
          }),
        ).toBe(
          JSON.stringify([
            "org-1",
            "integration-1",
            "upload-abc",
          ]),
        );
      },
    );

    it(
      "does not collide across organizations",
      () => {
        const a =
          buildSyncRunReplayKey({
            organizationId:
              "org-1",

            integrationId:
              "integration-1",

            idempotencyKey:
              "same",
          });

        const b =
          buildSyncRunReplayKey({
            organizationId:
              "org-2",

            integrationId:
              "integration-1",

            idempotencyKey:
              "same",
          });

        expect(a).not.toBe(b);
      },
    );

    it(
      "does not collide across integrations",
      () => {
        const a =
          buildSyncRunReplayKey({
            organizationId:
              "org-1",

            integrationId:
              "integration-1",

            idempotencyKey:
              "same",
          });

        const b =
          buildSyncRunReplayKey({
            organizationId:
              "org-1",

            integrationId:
              "integration-2",

            idempotencyKey:
              "same",
          });

        expect(a).not.toBe(b);
      },
    );

    it(
      "classifies absent sync run as create",
      () => {
        expect(
          assessSyncRunReplay(
            null,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              idempotencyKey:
                "upload-abc",
            },
          ).disposition,
        ).toBe(
          "create",
        );
      },
    );

    it(
      "classifies same logical sync run as idempotent",
      () => {
        expect(
          assessSyncRunReplay(
            {
              id:
                "sync-1",

              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              idempotencyKey:
                "upload-abc",
            },
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              idempotencyKey:
                "upload-abc",
            },
          ),
        ).toEqual({
          disposition:
            "idempotent",

          replayKey:
            JSON.stringify([
              "org-1",
              "integration-1",
              "upload-abc",
            ]),

          syncRunId:
            "sync-1",
        });
      },
    );

    it(
      "rejects comparing an unrelated existing sync run",
      () => {
        expect(() =>
          assessSyncRunReplay(
            {
              id:
                "sync-1",

              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              idempotencyKey:
                "upload-a",
            },
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              idempotencyKey:
                "upload-b",
            },
          ),
        ).toThrow(
          "Existing sync run does not match the incoming replay identity.",
        );
      },
    );

    it(
      "rejects blank idempotency key",
      () => {
        expect(() =>
          buildSyncRunReplayKey({
            organizationId:
              "org-1",

            integrationId:
              "integration-1",

            idempotencyKey:
              " ",
          }),
        ).toThrow(
          "idempotencyKey must not be empty.",
        );
      },
    );

    it(
      "allows delimiter characters without replay-key collision",
      () => {
        const a =
          buildSyncRunReplayKey({
            organizationId:
              "org|1",

            integrationId:
              "int",

            idempotencyKey:
              "x",
          });

        const b =
          buildSyncRunReplayKey({
            organizationId:
              "org",

            integrationId:
              "1|int",

            idempotencyKey:
              "x",
          });

        expect(a).not.toBe(b);
      },
    );
  },
);
