import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hasDeveloperToolsAccess } from "./developer-tools-access";

describe("developer tools access", () => {
  it("allows an allowlisted user only when the development feature is enabled", () => {
    expect(
      hasDeveloperToolsAccess({
        allowedUserIds: "user-1, user-2",
        enabled: true,
        nodeEnv: "development",
        userId: "user-1",
      }),
    ).toBe(true);
  });

  it.each([
    ["production", true, "user-1,user-2", "user-1"],
    ["development", false, "user-1,user-2", "user-1"],
    ["development", true, "user-2", "user-1"],
    ["development", true, "", "user-1"],
  ])(
    "denies nodeEnv=%s enabled=%s allowlist=%s user=%s",
    (nodeEnv, enabled, allowedUserIds, userId) => {
      expect(
        hasDeveloperToolsAccess({
          allowedUserIds,
          enabled,
          nodeEnv,
          userId,
        }),
      ).toBe(false);
    },
  );
});
