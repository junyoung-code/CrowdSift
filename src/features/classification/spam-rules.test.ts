import { describe, expect, it } from "vitest";

import { detectSpam } from "./spam-rules";

describe("detectSpam", () => {
  it.each([
    "자취템 싸게 파는 곳 알려드려요 링크 프로필에",
    "무료 나눔 이벤트 진행중 프로필 링크 확인",
    "부업으로 월 300 벌고 있어요 디엠 주세요",
    "할인 쿠폰 프로필에 있어요",
  ])("파는 말과 보내려는 말이 함께 있으면 주의: %s", (text) => {
    expect(detectSpam(text)).toMatchObject({ level: "caution" });
  });

  it.each([
    "무료 나눔 이벤트 진행중 클릭 → bit.ly/xxxx",
    "여기 눌러서 받아가세요 tinyurl.com/abcd",
  ])("어디로 가는지 감춘 주소는 위험: %s", (text) => {
    expect(detectSpam(text)).toMatchObject({ level: "danger" });
  });

  it("파는 말과 주소가 함께 있으면 위험", () => {
    expect(detectSpam("특가 판매중 https://shop.example.com 확인하세요")).toMatchObject(
      { level: "danger" },
    );
  });

  it.each([
    // 이것을 스팸으로 묻으면 크리에이터가 돈을 잃는다.
    "협찬 문의 드립니다 메일 확인 부탁드려요",
    "이 영상 링크 공유해도 될까요?",
    "광고 좀 줄여주세요",
    "무료로 볼 수 있어서 감사합니다",
    "요즘 살찌셨네요",
    "3:15 이 부분 자막 오타 났어요",
    "자막 너무 작아서 폰으로 안 보임 좀 키워주세요",
    "",
  ])("파는 말이나 보내려는 말이 없으면 걸지 않는다: %s", (text) => {
    expect(detectSpam(text)).toBeNull();
  });

  it("무엇을 보고 걸었는지 남긴다", () => {
    expect(detectSpam("무료 나눔 이벤트 진행중 프로필 링크 확인")?.signals).toEqual([
      "promotion",
      "off_platform_call",
    ]);
  });

  it("대문자로 적어도 알아본다", () => {
    expect(detectSpam("무료 이벤트 DM 주세요")).toMatchObject({
      level: "caution",
    });
  });
});
