import http from "node:http";
import https from "node:https";

type RequestFunction = (...args: unknown[]) => unknown;
type MutableRequestModule = {
  request: RequestFunction;
  get: RequestFunction;
  [key: symbol]: unknown;
};

type GuardState = {
  originalGet: RequestFunction;
  originalRequest: RequestFunction;
};

const guardStateKey = Symbol.for(
  "commenthawk.fixtureNodeExternalNetworkGuard",
);
const blockedProviderHosts = ["googleapis.com", "openai.com"] as const;

const hostnameFromRequestInput = (input: unknown) => {
  if (typeof input === "string" || input instanceof URL) {
    try {
      return new URL(input).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  if (!input || typeof input !== "object") {
    return null;
  }

  const options = input as {
    host?: unknown;
    hostname?: unknown;
  };
  const hostname =
    typeof options.hostname === "string"
      ? options.hostname
      : typeof options.host === "string"
        ? options.host
        : null;

  if (!hostname) {
    return null;
  }

  try {
    return new URL(`https://${hostname}`).hostname.toLowerCase();
  } catch {
    return hostname.toLowerCase();
  }
};

const isBlockedProviderHost = (hostname: string) =>
  blockedProviderHosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );

const installOnModule = (target: MutableRequestModule) => {
  const existing = target[guardStateKey] as GuardState | undefined;
  if (existing) {
    return () => {};
  }

  const originalRequest = target.request;
  const originalGet = target.get;
  const guard =
    (original: RequestFunction): RequestFunction =>
    (...args) => {
      const hostname = hostnameFromRequestInput(args[0]);
      if (hostname && isBlockedProviderHost(hostname)) {
        throw new Error(
          `Fixture external network guard blocked ${hostname}`,
        );
      }
      return Reflect.apply(original, target, args);
    };
  const state = { originalGet, originalRequest };

  target[guardStateKey] = state;
  target.request = guard(originalRequest);
  target.get = guard(originalGet);

  return () => {
    if (target[guardStateKey] === state) {
      target.request = originalRequest;
      target.get = originalGet;
      delete target[guardStateKey];
    }
  };
};

export function installFixtureNodeExternalNetworkGuard({
  allowFixtureProviders,
  externalProviderMode,
}: {
  allowFixtureProviders: boolean;
  externalProviderMode: "live" | "fixture";
}) {
  if (
    externalProviderMode !== "fixture" ||
    !allowFixtureProviders
  ) {
    return () => {};
  }

  const restoreHttp = installOnModule(
    http as unknown as MutableRequestModule,
  );
  const restoreHttps = installOnModule(
    https as unknown as MutableRequestModule,
  );

  return () => {
    restoreHttps();
    restoreHttp();
  };
}
