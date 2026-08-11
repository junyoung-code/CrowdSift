import { createHash } from "node:crypto";

import {
  LUNA_FIRST_PASS_PROMPT_VERSION,
  TERRA_VERIFICATION_PROMPT_VERSION,
} from "./prompts";

export const CLASSIFICATION_SCHEMA_VERSION = "classification-v1";

export const createClassificationConfigurationKey = (input: {
  policyVersion: number;
  providerMode: "live" | "fixture";
  moderationModel: string;
  lunaModel: string;
  terraModel: string;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        pipeline: "classification-v1",
        policyVersion: input.policyVersion,
        providerMode: input.providerMode,
        moderationModel: input.moderationModel,
        lunaModel: input.lunaModel,
        lunaPromptVersion: LUNA_FIRST_PASS_PROMPT_VERSION,
        terraModel: input.terraModel,
        terraPromptVersion: TERRA_VERIFICATION_PROMPT_VERSION,
        schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
      }),
    )
    .digest("hex");
