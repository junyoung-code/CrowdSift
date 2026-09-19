import { semanticConfigurationKey, semanticSettingsFromEnv, type SemanticSettings } from "./semantic-settings";

export const CLASSIFICATION_SCHEMA_VERSION = "semantic-v1";

export const createClassificationConfigurationKey = (input: {
  policyVersion: number;
  providerMode: "live" | "fixture";
  moderationModel?: string;
  lunaModel?: string;
  terraModel?: string;
  semantic?: SemanticSettings;
}) => semanticConfigurationKey(input.semantic ?? semanticSettingsFromEnv({ ...process.env, EXTERNAL_PROVIDER_MODE: input.providerMode }), input.policyVersion);
