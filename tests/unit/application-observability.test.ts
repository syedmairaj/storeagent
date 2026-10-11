import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildApplicationLogEvent,
  emitApplicationLogEvent,
} from "@/lib/observability/logger";

describe(
  "application observability",
  () => {
    const context = {
      requestId:
        "request-123",

      route:
        "/app/org-a",

      action:
        "load_workspace",

      userId:
        "user-a",

      organizationId:
        "org-a",

      storeId:
        null,
    };

    it(
      "builds structured tenant-aware telemetry",
      () => {
        expect(
          buildApplicationLogEvent({
            level:
              "error",

            eventType:
              "workspace_load_failed",

            code:
              "DATA_LOAD_FAILED",

            kind:
              "operational",

            message:
              "Unable to load workspace persistence.",

            context,

            metadata: {
              source:
                "organizations",
            },

            occurredAt:
              "2026-10-11T03:00:00Z",
          }),
        ).toEqual({
          level:
            "error",

          eventType:
            "workspace_load_failed",

          code:
            "DATA_LOAD_FAILED",

          kind:
            "operational",

          message:
            "Unable to load workspace persistence.",

          context,

          metadata: {
            source:
              "organizations",
          },

          occurredAt:
            "2026-10-11T03:00:00Z",
        });
      },
    );

    it(
      "redacts metadata before event creation",
      () => {
        const event =
          buildApplicationLogEvent({
            level:
              "error",

            eventType:
              "example_failed",

            code:
              "INTERNAL_ERROR",

            kind:
              "programming",

            message:
              "Unexpected application error.",

            context,

            metadata: {
              accessToken:
                "should-never-appear",

              safe:
                "visible",
            },

            occurredAt:
              "2026-10-11T03:00:00Z",
          });

        expect(
          event.metadata,
        ).toEqual({
          accessToken:
            "[REDACTED]",

          safe:
            "visible",
        });
      },
    );

    it(
      "requires an explicit UTC timestamp",
      () => {
        expect(() =>
          buildApplicationLogEvent({
            level:
              "info",

            eventType:
              "test",

            code:
              null,

            kind:
              null,

            message:
              "test",

            context,

            occurredAt:
              "2026-10-11 03:00:00",
          }),
        ).toThrow(
          "explicit UTC timestamp",
        );
      },
    );

    it(
      "emits serialized structured events through an injected transport",
      () => {
        const messages:
          string[] =
            [];

        const event =
          buildApplicationLogEvent({
            level:
              "info",

            eventType:
              "test_event",

            code:
              null,

            kind:
              null,

            message:
              "Test event.",

            context,

            occurredAt:
              "2026-10-11T03:00:00Z",
          });

        emitApplicationLogEvent(
          event,
          (message) =>
            messages.push(
              message,
            ),
        );

        expect(
          messages,
        ).toHaveLength(
          1,
        );

        expect(
          JSON.parse(
            messages[0],
          ),
        ).toEqual(
          event,
        );
      },
    );
  },
);
