const INTERNAL_ORIGIN =
  "https://storeagent.invalid";

export function safeAuthNextPath(
  candidate:
    string |
    null |
    undefined,

  fallback = "/",
): string {
  if (
    candidate === null ||
    candidate === undefined
  ) {
    return fallback;
  }

  const trimmed =
    candidate.trim();

  if (
    trimmed.length === 0 ||
    !trimmed.startsWith(
      "/",
    ) ||
    trimmed.startsWith(
      "//",
    ) ||
    trimmed.includes(
      "\\",
    )
  ) {
    return fallback;
  }

  try {
    const parsed =
      new URL(
        trimmed,
        INTERNAL_ORIGIN,
      );

    if (
      parsed.origin !==
      INTERNAL_ORIGIN
    ) {
      return fallback;
    }

    return (
      parsed.pathname +
      parsed.search +
      parsed.hash
    );
  } catch {
    return fallback;
  }
}
