import { describe, expect, it } from "vitest";

import {
  createOAuthStatePayload,
  verifyOAuthStatePayload,
} from "./oauth-state";

const deterministicBytes = () => Buffer.alloc(32, 7);

describe("YouTube OAuth state", () => {
  it("round-trips the purpose without exposing a reusable state", () => {
    const issued = createOAuthStatePayload(
      { purpose: "read" },
      deterministicBytes,
    );

    expect(issued.state).toHaveLength(43);
    expect(
      verifyOAuthStatePayload({
        cookieValue: issued.cookieValue,
        receivedState: issued.state,
      }),
    ).toEqual({
      purpose: "read",
      actionRequestId: null,
    });
  });

  it("rejects a state value that does not match the cookie", () => {
    const issued = createOAuthStatePayload(
      { purpose: "moderation", actionRequestId: "request-1" },
      deterministicBytes,
    );

    expect(() =>
      verifyOAuthStatePayload({
        cookieValue: issued.cookieValue,
        receivedState: `${issued.state.slice(0, -1)}x`,
      }),
    ).toThrow("Invalid OAuth state");
  });
});
