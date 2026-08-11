import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "./env";

vi.mock("server-only", () => ({}));

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REDIRECT_URI:
    "http://localhost:3000/api/youtube/oauth/callback",
  YOUTUBE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DELETION_AUDIT_PEPPER: "p".repeat(32),
  OPENAI_API_KEY: "openai",
  OPENAI_ANALYSIS_MODEL: "configured-model",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  EXTERNAL_PROVIDER_MODE: "live",
  ALLOW_FIXTURE_PROVIDERS: "false",
  APP_ORIGIN: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("rejects a missing token encryption key", () => {
    const withoutEncryptionKey: Record<string, string> = {
      ...validEnvironment,
    };
    delete withoutEncryptionKey.YOUTUBE_TOKEN_ENCRYPTION_KEY;

    expect(() => parseServerEnv(withoutEncryptionKey)).toThrow(
      /YOUTUBE_TOKEN_ENCRYPTION_KEY/,
    );
  });

  it("parses fixture-provider permission into a boolean", () => {
    expect(
      parseServerEnv({
        ...validEnvironment,
        ALLOW_FIXTURE_PROVIDERS: "true",
      }).ALLOW_FIXTURE_PROVIDERS,
    ).toBe(true);
  });

  it("parses developer-tools permission and keeps the server-only allowlist", () => {
    const parsed = parseServerEnv({
      ...validEnvironment,
      ENABLE_DEVELOPER_TOOLS: "true",
      DEVELOPER_USER_IDS: "user-1,user-2",
    });

    expect(parsed.ENABLE_DEVELOPER_TOOLS).toBe(true);
    expect(parsed.DEVELOPER_USER_IDS).toBe("user-1,user-2");
  });

  it("accepts a strong optional internal worker secret", () => {
    expect(
      parseServerEnv({
        ...validEnvironment,
        INTERNAL_WORKER_SECRET: "w".repeat(32),
      }).INTERNAL_WORKER_SECRET,
    ).toBe("w".repeat(32));
  });

  it("accepts a strong optional cron secret", () => {
    expect(
      parseServerEnv({
        ...validEnvironment,
        CRON_SECRET: "c".repeat(32),
      }).CRON_SECRET,
    ).toBe("c".repeat(32));
  });

  it("rejects a short cron secret", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        CRON_SECRET: "too-short",
      }),
    ).toThrow(/CRON_SECRET/);
  });
});
