import { describe, expect, it } from "vitest";

import {
  ProviderModeMismatchError,
  assertProviderModeMatchesJob,
} from "./provider-mode";

describe("assertProviderModeMatchesJob", () => {
  it.each(["live", "fixture"] as const)(
    "allows a %s job only in the matching runtime mode",
    (mode) => {
      expect(() => assertProviderModeMatchesJob(mode, mode)).not.toThrow();
    },
  );

  it.each([
    ["fixture", "live"],
    ["live", "fixture"],
  ] as const)(
    "rejects a persisted %s job in a %s runtime",
    (jobMode, runtimeMode) => {
      expect(() =>
        assertProviderModeMatchesJob(jobMode, runtimeMode),
      ).toThrow(ProviderModeMismatchError);
    },
  );

  it("rejects unknown persisted provenance", () => {
    expect(() =>
      assertProviderModeMatchesJob("sample", "fixture"),
    ).toThrow(ProviderModeMismatchError);
  });
});
