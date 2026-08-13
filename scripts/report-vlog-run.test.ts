import { describe, expect, it } from "vitest";

import { hasMention, matches, normalize } from "./report-vlog-run";
import { GROUP_OF, VLOG_TEST_SET } from "./vlog-test-set";

describe("맞추기", () => {
  it("그대로 단 댓글을 찾는다", () => {
    expect(matches("요즘 살찌셨네요", "요즘 살찌셨네요")).toBe(true);
  });

  it("유튜브가 붙인 멘션을 넘어서 찾는다", () => {
    // 실제 수집 데이터에 띄어쓰기가 있는 것과 없는 것이 함께 있었다.
    expect(matches("@이근성-f3p 맞말", "맞말")).toBe(true);
    expect(matches("@ee-tc7lk직접 라이브 들어보면", "직접 라이브 들어보면")).toBe(true);
  });

  it("폭 없는 공백이 앞에 붙어도 찾는다", () => {
    expect(matches("​@th1s_and_that 맞말", "맞말")).toBe(true);
  });

  it("멘션이 아닌데 끝만 같은 남의 댓글에는 붙지 않는다", () => {
    // 「별로」로 끝난다고 C07 이 되어서는 안 된다.
    expect(matches("자막이 작아서 잘 안 보이는 건 좀 별로", "별로")).toBe(false);
  });

  it("한 글자라도 다르면 찾지 않는다", () => {
    expect(matches("요즘 살찌셨네요!", "요즘 살찌셨네요")).toBe(false);
  });
});

describe("멘션 판별", () => {
  it("앞에 붙은 멘션을 알아본다", () => {
    expect(hasMention("@이근성-f3p 맞말")).toBe(true);
    expect(hasMention("​@이근성-f3p 맞말")).toBe(true);
  });

  it("본문 가운데의 @ 는 멘션으로 보지 않는다", () => {
    expect(hasMention("메일 보냈어요 abc@example.com 확인 부탁")).toBe(false);
  });

  it("멘션이 없으면 없다고 한다", () => {
    expect(hasMention("그런 말을 굳이 왜 함?")).toBe(false);
  });
});

describe("세트 자체", () => {
  it("문서와 같은 개수다", () => {
    expect(VLOG_TEST_SET).toHaveLength(69);
    expect(VLOG_TEST_SET.filter((entry) => entry.video === 1)).toHaveLength(41);
    expect(VLOG_TEST_SET.filter((entry) => entry.video === 2)).toHaveLength(28);
  });

  it("id 가 겹치지 않는다", () => {
    const ids = VLOG_TEST_SET.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("원문이 겹치지 않는다", () => {
    // 겹치면 어느 항목의 결과인지 가릴 수 없다.
    const texts = VLOG_TEST_SET.map((entry) => normalize(entry.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("한 항목이 다른 항목의 꼬리를 물지 않는다", () => {
    // 멘션을 넘어 뒤에서 맞추므로, 어떤 문구가 다른 문구로 끝나면 잘못 붙는다.
    const collisions = VLOG_TEST_SET.flatMap((a) =>
      VLOG_TEST_SET.filter(
        (b) =>
          a.id !== b.id &&
          normalize(a.text).length > normalize(b.text).length &&
          normalize(a.text).endsWith(normalize(b.text)),
      ).map((b) => `${a.id} ⊃ ${b.id}`),
    );
    expect(collisions).toEqual([]);
  });

  it("답글에는 부모가 있고 K 무리에만 멘션이 남는다", () => {
    for (const entry of VLOG_TEST_SET) {
      if (GROUP_OF(entry.id) === "K") {
        expect(entry.mention, entry.id).toBe(true);
        expect(entry.parentId, entry.id).toBeDefined();
      }
      if (entry.mention) expect(GROUP_OF(entry.id)).toBe("K");
    }
  });

  it("등록 후 기대가 달라지는 것은 B 무리뿐이다", () => {
    for (const entry of VLOG_TEST_SET) {
      if (entry.expectedAfterSlang) expect(GROUP_OF(entry.id)).toBe("B");
    }
  });
});
