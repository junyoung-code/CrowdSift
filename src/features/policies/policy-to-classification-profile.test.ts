import { describe, expect, it } from "vitest";

import { toClassificationProfileUpdate } from "./policy-to-classification-profile";

const convert = (overrides?: Partial<Parameters<typeof toClassificationProfileUpdate>[0]>) =>
  toClassificationProfileUpdate({
    allowed: "",
    blocked: "",
    sensitivity: "standard",
    ...overrides,
  });

describe("policy form to classification profile", () => {
  it("carries the allowed phrases to the list the classifier reads", async () => {
    // 이것이 이어지지 않아 크리에이터가 등록한 표현이 판단에 닿지 않았다.
    const { profile } = convert({ allowed: "개웃김\n미쳤다\nㅈㄴ" });

    expect(profile.allowedSlang).toEqual(["개웃김", "미쳤다", "ㅈㄴ"]);
  });

  it("carries the watch list as topics to look at twice, not to punish", () => {
    const { profile } = convert({ blocked: "반복 광고\n사기 링크" });

    expect(profile.sensitiveTopics).toEqual(["반복 광고", "사기 링크"]);
  });

  it.each(["low", "standard", "high"] as const)(
    "keeps sensitivity %s as the protection level",
    (sensitivity) => {
      expect(convert({ sensitivity }).profile.protectionLevel).toBe(sensitivity);
    },
  );

  it("takes the phrase from a `표현 | 설명` line and leaves the note behind", () => {
    const { profile } = convert({ allowed: "개웃김 | 팬들 사이에서는 칭찬" });

    expect(profile.allowedSlang).toEqual(["개웃김"]);
  });

  it("drops the overflow instead of letting the whole profile reset", () => {
    // 스키마를 넘기면 toClassificationProfile 이 파싱에 실패하고 프로필 전체가
    // 기본값으로 돌아간다. 하나를 더 넣었다가 등록해 둔 것이 통째로 사라진다.
    const many = Array.from({ length: 55 }, (_, index) => `표현${index}`);
    const { profile, dropped } = convert({ allowed: many.join("\n") });

    expect(profile.allowedSlang).toHaveLength(50);
    expect(dropped).toHaveLength(5);
  });

  it("drops a phrase too long to store rather than cutting it short", () => {
    // 40자에서 끊으면 뜻이 달라진 말이 등록된다.
    const long = "가".repeat(41);
    const { profile, dropped } = convert({ allowed: `개웃김\n${long}` });

    expect(profile.allowedSlang).toEqual(["개웃김"]);
    expect(dropped).toEqual([long]);
  });

  it("says nothing was dropped when everything fits", () => {
    expect(convert({ allowed: "개웃김", blocked: "사기 링크" }).dropped).toEqual([]);
  });

  it("produces an empty profile from empty boxes", () => {
    const { profile, dropped } = convert();

    expect(profile.allowedSlang).toEqual([]);
    expect(profile.sensitiveTopics).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
