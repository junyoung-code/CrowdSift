import { describe, expect, it } from "vitest";

import { withRetry } from "./retry";

describe("withRetry", () => {
  it("retries a transient failure and returns the successful value", async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("rate limited"), { status: 429 });
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry a non-transient client error", async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("invalid"), { status: 400 });
        },
        { maxAttempts: 3, baseDelayMs: 0 },
      ),
    ).rejects.toThrow("invalid");

    expect(attempts).toBe(1);
  });
});
