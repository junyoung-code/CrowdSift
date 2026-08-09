import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),
  ENABLE_PUBLIC_YOUTUBE_DEV_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  YOUTUBE_PUBLIC_API_KEY: z.string().min(1).optional(),
  YOUTUBE_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      message: "YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes",
    }),
  DELETION_AUDIT_PEPPER: z.string().min(32),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_ANALYSIS_MODEL: z.string().min(1),
  OPENAI_STAGE1_MODEL: z.string().min(1).optional(),
  OPENAI_STAGE2_MODEL: z.string().min(1).optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  // 댓글 분류 파이프라인 v1
  OPENAI_MODERATION_MODEL: z.string().default("omni-moderation-latest"),
  OPENAI_LUNA_MODEL: z.string().default("gpt-5.6-luna"),
  OPENAI_TERRA_MODEL: z.string().default("gpt-5.6-terra"),
  EXTERNAL_PROVIDER_MODE: z.enum(["live", "fixture"]).default("live"),
  ALLOW_FIXTURE_PROVIDERS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  INTERNAL_WORKER_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  APP_ORIGIN: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const parseServerEnv = (
  source: Record<string, string | undefined>,
) =>
  serverEnvSchema.parse(source);

export const getServerEnv = () => parseServerEnv(process.env);
