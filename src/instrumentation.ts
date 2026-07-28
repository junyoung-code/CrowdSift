export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.EXTERNAL_PROVIDER_MODE !== "fixture" ||
    process.env.ALLOW_FIXTURE_PROVIDERS !== "true"
  ) {
    return;
  }

  const { installFixtureExternalNetworkGuard } = await import(
    "./lib/fixture-external-network-guard"
  );
  const { installFixtureNodeExternalNetworkGuard } = await import(
    "./lib/fixture-node-network-guard"
  );

  installFixtureExternalNetworkGuard({
    allowFixtureProviders: true,
    externalProviderMode: "fixture",
  });
  installFixtureNodeExternalNetworkGuard({
    allowFixtureProviders: true,
    externalProviderMode: "fixture",
  });
}
