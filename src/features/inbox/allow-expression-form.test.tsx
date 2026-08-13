import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AllowExpressionForm } from "./allow-expression-form";

describe("AllowExpressionForm", () => {
  it("offers the flagged expression so the creator does not type it", () => {
    render(
      <AllowExpressionForm
        action={vi.fn()}
        sourceText="님 진짜 ㅈㄴ웃기네요 ㅋㅋㅋㅋ 구독합니다"
      />,
    );

    expect(screen.getByRole("textbox", { name: "허용할 표현" })).toHaveValue(
      "ㅈㄴ웃기네요",
    );
    expect(
      screen.getByRole("button", { name: "칭찬으로 등록" }),
    ).toBeInTheDocument();
  });

  it("suggests the whole chunk, not the bare intensifier", () => {
    // "개" 하나만 풀어 주면 이 채널에서 "개" 로 시작하는 모든 말이 함께 풀린다.
    render(
      <AllowExpressionForm
        action={vi.fn()}
        sourceText="ㅋㅋㅋㅋㅋ아 개귀여움 뱃살보고 들어옴"
      />,
    );

    expect(screen.getByRole("textbox", { name: "허용할 표현" })).toHaveValue(
      "개귀여움",
    );
  });

  it("asks nothing when the comment carries no expression to allow", () => {
    // 아무 낱말이나 칭찬이라고 밀어 넣느니 묻지 않는 편이 낫다.
    const { container } = render(
      <AllowExpressionForm action={vi.fn()} sourceText="아 귀엽다 귀여워 쌍지진짜" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
