import "server-only";

import OpenAI from "openai";

import { getServerEnv } from "@/lib/env";

import { createFirstPassRunner, type FirstPassRunner } from "./first-pass";
import {
  createFixtureFirstPass,
  createFixtureSecondPass,
} from "./fixture-classification-clients";
import { createLunaFirstPass, type ResponsesClient } from "./luna-first-pass";
import { createModerationScreen, type ModerationClient } from "./moderation";
import {
  createTerraVerification,
  type TerraVerification,
} from "./terra-verification";

/**
 * 부품에 실제 OpenAI 클라이언트를 꽂는다.
 *
 * 부품 쪽은 클라이언트를 주입받게 두어 테스트에서 가짜를 넣을 수 있게 했고,
 * 여기서만 진짜를 만든다.
 */
export const createFirstPass = (options?: {
  apiKey?: string;
  lunaModel?: string;
  moderationModel?: string;
  onModerationError?: (error: unknown, commentId: string) => void;
}): FirstPassRunner => {
  const environment =
    options?.apiKey && options.lunaModel && options.moderationModel
      ? null
      : getServerEnv();

  if (environment?.EXTERNAL_PROVIDER_MODE === "fixture") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Fixture providers are test-only");
    }
    if (!environment.ALLOW_FIXTURE_PROVIDERS) {
      throw new Error("Fixture providers are disabled");
    }
    return createFixtureFirstPass();
  }

  const apiKey = options?.apiKey ?? environment?.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the first pass");
  }

  const client = new OpenAI({ apiKey });

  return createFirstPassRunner({
    luna: createLunaFirstPass({
      client: client as unknown as ResponsesClient,
      model:
        options?.lunaModel ??
        environment?.OPENAI_LUNA_MODEL ??
        "gpt-5.6-luna",
    }),
    moderation: createModerationScreen({
      client: client as unknown as ModerationClient,
      model:
        options?.moderationModel ??
        environment?.OPENAI_MODERATION_MODEL ??
        "omni-moderation-latest",
    }),
    onModerationError: options?.onModerationError,
  });
};

/**
 * 3단계 Terra 검증에 실제 클라이언트를 꽂는다.
 */
export const createSecondPass = (options?: {
  apiKey?: string;
  terraModel?: string;
}): TerraVerification => {
  const environment =
    options?.apiKey && options.terraModel ? null : getServerEnv();

  if (environment?.EXTERNAL_PROVIDER_MODE === "fixture") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Fixture providers are test-only");
    }
    if (!environment.ALLOW_FIXTURE_PROVIDERS) {
      throw new Error("Fixture providers are disabled");
    }
    return createFixtureSecondPass();
  }

  const apiKey = options?.apiKey ?? environment?.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the second pass");
  }

  return createTerraVerification({
    client: new OpenAI({ apiKey }) as unknown as ResponsesClient,
    model:
      options?.terraModel ?? environment?.OPENAI_TERRA_MODEL ?? "gpt-5.6-terra",
  });
};
