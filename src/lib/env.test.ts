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
});
