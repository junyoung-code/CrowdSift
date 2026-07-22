import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders only the customer landing content", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "중요한 댓글은 놓치지 않고,악성 댓글에는 끌려가지 않도록.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "YouTube 연결하기" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("region", { name: "CommentHawk 개발 지도" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "우리가 해야 할 일을, 하나의 지도로 봅니다.",
      }),
    ).not.toBeInTheDocument();
  });
});
