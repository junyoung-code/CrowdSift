import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { landingAnalysisExamples } from "./landing-copy";
import {
  demoReducer,
  InteractiveAnalysisDemo,
  type InteractiveDemoState,
} from "./interactive-analysis-demo";

describe("demoReducer", () => {
  it("resets protected source state when the selected example changes", () => {
    const revealed: InteractiveDemoState = {
      selectedId: "harmful",
      revealedSource: true,
      stage: 3,
    };

    expect(demoReducer(revealed, { type: "select", id: "question" })).toEqual({
      selectedId: "question",
      revealedSource: false,
      stage: 0,
    });
  });

  it("clamps the staged walkthrough at its final state", () => {
    const finalState: InteractiveDemoState = {
      selectedId: "question",
      revealedSource: false,
      stage: 4,
    };

    expect(demoReducer(finalState, { type: "advance" }).stage).toBe(4);
  });
});

describe("InteractiveAnalysisDemo", () => {
  it("keeps harmful source hidden until requested and resets it on selection", async () => {
    const user = userEvent.setup();
    const harmful = landingAnalysisExamples.find(({ id }) => id === "harmful")!;
    render(<InteractiveAnalysisDemo />);

    expect(screen.queryByText(harmful.rawSource)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "유해 댓글 예시 선택" }),
    );
    expect(screen.queryByText(harmful.rawSource)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "가려진 원문 보기" }));
    expect(screen.getByText(harmful.rawSource)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "질문 댓글 예시 선택" }),
    );
    expect(screen.queryByText(harmful.rawSource)).not.toBeInTheDocument();
  });

  it("progresses deterministically to an advisory sign-in state", async () => {
    const user = userEvent.setup();
    render(<InteractiveAnalysisDemo />);

    expect(screen.getByText("0 / 4 단계")).toBeInTheDocument();

    for (let stage = 1; stage <= 4; stage += 1) {
      await user.click(screen.getByRole("button", { name: "다음 분석 단계" }));
      expect(screen.getByText(`${stage} / 4 단계`)).toBeInTheDocument();
    }

    expect(screen.getByText("사용자가 확인해야 조치됩니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하고 직접 검토하기" }))
      .toHaveAttribute("href", "/auth/sign-in");
    expect(screen.queryByRole("button", { name: /숨김|삭제/ })).not.toBeInTheDocument();
  });
});
