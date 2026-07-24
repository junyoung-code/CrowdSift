import { describe, expect, it } from "vitest";

import { getSafeNextPath } from "./safe-next-path";

describe("getSafeNextPath", () => {
  it.each([
    ["/app/inbox?levels=risk", "/app/inbox?levels=risk"],
    ["//evil.example", "/app"],
    ["/%5Cevil.example", "/app"],
    ["https://evil.example", "/app"],
    [undefined, "/app"],
  ])("normalizes %s", (value, expected) => {
    expect(getSafeNextPath(value)).toBe(expected);
  });
});
