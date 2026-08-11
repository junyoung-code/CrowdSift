import { describe, expect, it } from "vitest";

import { createClassificationConfigurationKey } from "./configuration";

const configuration = {
  policyVersion: 1,
  providerMode: "live" as const,
  moderationModel: "omni-moderation-latest",
  lunaModel: "gpt-5.6-luna",
  terraModel: "gpt-5.6-terra",
};

describe("classification configuration key", () => {
  it("is stable for the same pipeline configuration", () => {
    expect(createClassificationConfigurationKey(configuration)).toBe(
      createClassificationConfigurationKey({ ...configuration }),
    );
  });

  it.each(["moderationModel", "lunaModel", "terraModel"] as const)(
    "changes when %s changes",
    (field) => {
      expect(
        createClassificationConfigurationKey({
          ...configuration,
          [field]: `${configuration[field]}-new`,
        }),
      ).not.toBe(createClassificationConfigurationKey(configuration));
    },
  );
});
