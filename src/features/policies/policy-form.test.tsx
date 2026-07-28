import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PolicyForm } from "./policy-form";

describe("PolicyForm", () => {
  it("separates blocked, allowed, and context-exception phrases", () => {
    render(
      <PolicyForm
        action={vi.fn()}
        initial={{
          allowed: "친근한 표현",
          blocked: "광고",
          cautionAction: "review",
          contextExceptions: "우리 팬덤 표현 | 칭찬 맥락",
          harmfulTextHidden: true,
          riskAction: "hold_for_review",
          sensitivity: "standard",
          version: 3,
        }}
      />,
    );

    expect(screen.getByLabelText("주의해서 볼 표현")).toHaveValue("광고");
    expect(screen.getByLabelText("허용할 표현")).toHaveValue("친근한 표현");
    expect(screen.getByLabelText("맥락 예외")).toHaveValue(
      "우리 팬덤 표현 | 칭찬 맥락",
    );
    expect(
      screen.getByText(/금지 표현과 일치해도 자동으로 삭제하지 않습니다/),
    ).toBeInTheDocument();
    expect(screen.getByText("현재 버전 3")).toBeInTheDocument();
  });
});
