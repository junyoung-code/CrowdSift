type FetchTarget = {
  fetch: typeof globalThis.fetch;
  [key: symbol]: unknown;
};

const guardStateKey = Symbol.for("crowdsift.fixtureExternalNetworkGuard");
const blockedProviderHosts = ["googleapis.com", "openai.com"] as const;

type GuardState = {
  originalFetch: typeof globalThis.fetch;
  guardedFetch: typeof globalThis.fetch;
};

const getHostname = (input: Parameters<typeof globalThis.fetch>[0]) => {
  const value =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : String(input);

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isBlockedProviderHost = (hostname: string) =>
  blockedProviderHosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );

export function installFixtureExternalNetworkGuard({
  allowFixtureProviders,
  externalProviderMode,
  target = globalThis as FetchTarget,
}: {
  allowFixtureProviders: boolean;
  externalProviderMode: "live" | "fixture";
  target?: FetchTarget;
}) {
  if (
    externalProviderMode !== "fixture" ||
    !allowFixtureProviders
  ) {
    return () => {};
  }

  const existing = target[guardStateKey] as GuardState | undefined;
  if (existing) {
    return () => {};
  }

  const originalFetch = target.fetch;
  const guardedFetch: typeof globalThis.fetch = async (input, init) => {
    const hostname = getHostname(input);

    if (hostname && isBlockedProviderHost(hostname)) {
      throw new Error(
        `Fixture external network guard blocked ${hostname}`,
      );
    }

    return originalFetch.call(target, input, init);
  };
  const state: GuardState = { guardedFetch, originalFetch };
  target[guardStateKey] = state;
  target.fetch = guardedFetch;

  return () => {
    if (target[guardStateKey] === state) {
      target.fetch = originalFetch;
      delete target[guardStateKey];
    }
  };
}
