export type ExternalProviderMode = "live" | "fixture";

export class ProviderModeMismatchError extends Error {
  readonly code = "provider_mode_mismatch";

  constructor(
    public readonly jobMode: string,
    public readonly runtimeMode: ExternalProviderMode,
  ) {
    super(
      `Persisted provider mode ${jobMode} does not match runtime mode ${runtimeMode}`,
    );
  }
}

export const parseProviderMode = (
  value: string,
): ExternalProviderMode => {
  if (value === "live" || value === "fixture") {
    return value;
  }

  throw new ProviderModeMismatchError(value, "live");
};

export function assertProviderModeMatchesJob(
  jobMode: string,
  runtimeMode: ExternalProviderMode,
): asserts jobMode is ExternalProviderMode {
  if (
    (jobMode !== "live" && jobMode !== "fixture") ||
    jobMode !== runtimeMode
  ) {
    throw new ProviderModeMismatchError(jobMode, runtimeMode);
  }
}
