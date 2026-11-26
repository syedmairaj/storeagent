import { describe, expect, it } from "vitest";

import { extractVerifyHref } from "../e2e/helpers/mailpit";
import { redactAuthUrl } from "../e2e/helpers/local-stack";

describe("FE-ACCEPT-1C mailpit helpers", () => {
  it("extracts local GoTrue verify href and redacts tokens", () => {
    const html = `
      <a href="http://127.0.0.1:55321/auth/v1/verify?token=secret-token&amp;type=magiclink&amp;redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%3Fnext%3D%252Fapp">Sign in</a>
    `;
    const href = extractVerifyHref(html);
    expect(href).toContain(
      "http://127.0.0.1:55321/auth/v1/verify?token=secret-token",
    );
    expect(href).toContain("type=magiclink");
    expect(href).not.toContain("&amp;");
    expect(redactAuthUrl(href!)).toContain(
      "token=REDACTED",
    );
    expect(redactAuthUrl(href!)).not.toContain(
      "secret-token",
    );
  });

  it("returns null when no verify link is present", () => {
    expect(
      extractVerifyHref("<p>No link here</p>"),
    ).toBeNull();
  });
});
