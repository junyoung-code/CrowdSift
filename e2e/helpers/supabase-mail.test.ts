import { describe, expect, it, vi } from "vitest";

import { getLatestMagicLink } from "./supabase-mail";

describe("getLatestMagicLink", () => {
  it("reads only the newest local Mailpit message for the requested recipient", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              ID: "newest",
              Created: "2026-07-24T02:00:00.000Z",
              To: [{ Address: "creator@example.com" }],
            },
            {
              ID: "other",
              Created: "2026-07-24T03:00:00.000Z",
              To: [{ Address: "someone@example.com" }],
            },
            {
              ID: "older",
              Created: "2026-07-24T01:00:00.000Z",
              To: [{ Address: "creator@example.com" }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          HTML: '<a href="http://127.0.0.1:54321/auth/v1/verify?token=abc&amp;type=magiclink">Sign in</a>',
          Text: "",
        }),
      });

    await expect(
      getLatestMagicLink("creator@example.com", {
        fetch,
        mailpitUrl: "http://127.0.0.1:54324",
      }),
    ).resolves.toBe(
      "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink",
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:54324/api/v1/message/newest",
    );
  });

  it("refuses to query a non-local mail server", async () => {
    await expect(
      getLatestMagicLink("creator@example.com", {
        fetch: vi.fn(),
        mailpitUrl: "https://mail.example.com",
      }),
    ).rejects.toThrow("Mailpit helper is local-only");
  });
});
