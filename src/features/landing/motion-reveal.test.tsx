import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MotionReveal } from "./motion-reveal";

describe("MotionReveal", () => {
  it("keeps semantic content available before viewport activation", () => {
    render(
      <MotionReveal as="article">
        <h3>검토할 댓글부터</h3>
      </MotionReveal>,
    );

    expect(screen.getByRole("article")).toHaveTextContent("검토할 댓글부터");
  });

  it("exposes viewport visibility for secondary reveal effects", () => {
    render(<MotionReveal as="article">카드</MotionReveal>);

    expect(screen.getByRole("article")).toHaveAttribute(
      "data-motion-visible",
      "true",
    );
  });

  it("server-renders visible content for the no-JavaScript fallback", () => {
    const markup = renderToString(
      <MotionReveal>
        <p>모든 댓글은 그대로 읽을 수 있습니다.</p>
      </MotionReveal>,
    );

    expect(markup).toContain("모든 댓글은 그대로 읽을 수 있습니다.");
    expect(markup).not.toContain("opacity:0");
  });
});
