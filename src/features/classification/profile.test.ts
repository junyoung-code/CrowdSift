import { describe, expect, it } from "vitest";

import { toClassificationProfile } from "./profile";
import { DEFAULT_CLASSIFICATION_PROFILE } from "./schemas";

const row = {
  protection_level: "standard",
  allowed_slang: ["개웃김", "ㅈㄴ"],
  sensitive_topics: ["외모"],
  hide_personal_attacks: true,
  rewrite_tone: "friendly",
  emoji_frequency: "low",
};

describe("classification profile", () => {
  it("falls back to the shared default when the channel registered nothing", () => {
    expect(toClassificationProfile(null)).toEqual(DEFAULT_CLASSIFICATION_PROFILE);
  });

  it("carries the channel's own words into the judgement", () => {
    expect(toClassificationProfile(row)).toEqual({
      protectionLevel: "standard",
      allowedSlang: ["개웃김", "ㅈㄴ"],
      sensitiveTopics: ["외모"],
      hidePersonalAttacks: true,
      rewriteTone: "friendly",
      emojiFrequency: "low",
    });
  });

  it("drops blank entries instead of sending them to the model", () => {
    expect(
      toClassificationProfile({
        ...row,
        allowed_slang: ["  ", "개웃김", ""],
        sensitive_topics: [],
      }),
    ).toMatchObject({ allowedSlang: ["개웃김"], sensitiveTopics: [] });
  });

  it("treats null arrays as empty", () => {
    expect(
      toClassificationProfile({
        ...row,
        allowed_slang: null,
        sensitive_topics: null,
      }),
    ).toMatchObject({ allowedSlang: [], sensitiveTopics: [] });
  });

  it("keeps classifying when the stored profile does not fit the schema", () => {
    // 프로필이 깨졌다고 댓글 분류를 멈추지는 않는다.
    expect(
      toClassificationProfile({ ...row, protection_level: "paranoid" }),
    ).toEqual(DEFAULT_CLASSIFICATION_PROFILE);
  });
});
