import {
  assertLocalAcceptanceStack,
  redactAuthUrl,
} from "./local-stack";

export type MailpitAddress = {
  Name?: string;
  Address: string;
};

export type MailpitMessageSummary = {
  ID: string;
  Created: string;
  Subject: string;
  To: MailpitAddress[];
};

type MailpitListResponse = {
  messages: MailpitMessageSummary[];
  total: number;
};

type MailpitMessageDetail = {
  ID: string;
  Subject: string;
  HTML?: string;
  Text?: string;
  To: MailpitAddress[];
  Created?: string;
};

export type CapturedMagicLink = {
  messageId: string;
  createdAt: string;
  verifyUrl: string;
};

function mailpitBase(): string {
  return assertLocalAcceptanceStack().mailpitUrl;
}

function recipientMatches(
  to: MailpitAddress[] | undefined,
  email: string,
): boolean {
  const target = email.trim().toLowerCase();
  return (to ?? []).some(
    (entry) =>
      entry.Address?.trim().toLowerCase() ===
      target,
  );
}

async function listRecentMessages(
  limit = 50,
): Promise<MailpitMessageSummary[]> {
  const url = `${mailpitBase()}/api/v1/messages?limit=${limit}`;
  const res = await fetch(url);
  if (
    !res.ok
  ) {
    throw new Error(
      `Mailpit list failed (${res.status}). Ensure local Mailpit is on :55324.`,
    );
  }
  const body =
    (await res.json()) as MailpitListResponse;
  return body.messages ?? [];
}

async function readMessage(
  id: string,
): Promise<MailpitMessageDetail> {
  const res = await fetch(
    `${mailpitBase()}/api/v1/message/${id}`,
  );
  if (
    !res.ok
  ) {
    throw new Error(
      `Mailpit message read failed (${res.status}).`,
    );
  }
  return (await res.json()) as MailpitMessageDetail;
}

/**
 * Extract GoTrue verify href from Mailpit HTML/text.
 * Returns the URL in memory only — callers must not GET/HEAD it outside Playwright.
 */
export function extractVerifyHref(
  htmlOrText: string,
): string | null {
  const decoded = htmlOrText
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&");

  const hrefMatch = decoded.match(
    /href=["'](https?:\/\/[^"']*\/auth\/v1\/verify[^"']*)["']/i,
  );
  if (
    hrefMatch?.[1]
  ) {
    return hrefMatch[1];
  }

  const bare = decoded.match(
    /https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/i,
  );
  return bare?.[0] ?? null;
}

/**
 * Wait for a newly generated magic-link email for the recipient.
 * Correlates by recipient + Created >= afterMs (with small skew).
 * Never fetches the verify URL.
 */
export async function waitForMagicLinkEmail(input: {
  recipientEmail: string;
  afterMs: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<CapturedMagicLink> {
  const timeoutMs = input.timeoutMs ?? 45_000;
  const pollMs = input.pollMs ?? 750;
  const skewMs = 5_000;
  const deadline = Date.now() + timeoutMs;
  const email = input.recipientEmail.trim().toLowerCase();
  const seenIds = new Set<string>();

  while (
    Date.now() < deadline
  ) {
    const messages = await listRecentMessages(80);
    const candidates = messages
      .filter((message) => {
        if (
          !recipientMatches(message.To, email)
        ) {
          return false;
        }
        if (
          seenIds.has(message.ID)
        ) {
          return false;
        }
        const created = Date.parse(message.Created);
        if (
          Number.isNaN(created)
        ) {
          return false;
        }
        if (
          created + skewMs < input.afterMs
        ) {
          return false;
        }
        const subject = (
          message.Subject || ""
        ).toLowerCase();
        return (
          subject.includes("sign-in") ||
          subject.includes("magic") ||
          subject.includes("login") ||
          subject.includes("confirm")
        );
      })
      .sort(
        (a, b) =>
          Date.parse(b.Created) -
          Date.parse(a.Created),
      );

    for (const summary of candidates) {
      seenIds.add(summary.ID);
      const detail = await readMessage(
        summary.ID,
      );
      if (
        !recipientMatches(detail.To, email)
      ) {
        continue;
      }
      const body =
        `${detail.HTML ?? ""}\n${detail.Text ?? ""}`;
      const verifyUrl = extractVerifyHref(body);
      if (
        !verifyUrl
      ) {
        continue;
      }
      if (
        !/\/auth\/v1\/verify\?/i.test(verifyUrl)
      ) {
        throw new Error(
          `Mailpit message lacked a GoTrue verify href (redacted=${redactAuthUrl(verifyUrl)}).`,
        );
      }
      // Refuse non-local verify hosts.
      const host = new URL(verifyUrl).hostname;
      if (
        host !== "127.0.0.1" &&
        host !== "localhost"
      ) {
        throw new Error(
          "E2E safety BLOCKED: magic-link verify host is not local.",
        );
      }
      return {
        messageId: summary.ID,
        createdAt: summary.Created,
        verifyUrl,
      };
    }

    await new Promise((resolve) =>
      setTimeout(resolve, pollMs),
    );
  }

  throw new Error(
    [
      "E2E auth BLOCKED: no matching local Mailpit magic-link email.",
      "Correlated by recipient + Created after request time.",
      "Confirm local Auth :55321 delivered to Mailpit :55324 for the configured E2E identity.",
    ].join(" "),
  );
}
