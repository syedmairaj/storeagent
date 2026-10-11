import {
  randomUUID,
} from "node:crypto";

const REQUEST_ID_PATTERN =
  /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidRequestId(
  value:
    string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    REQUEST_ID_PATTERN.test(
      value,
    )
  );
}

export function resolveRequestId(
  candidate:
    string | null | undefined,

  generate:
    () => string =
      randomUUID,
): string {
  if (
    isValidRequestId(
      candidate,
    )
  ) {
    return candidate;
  }

  return generate();
}
