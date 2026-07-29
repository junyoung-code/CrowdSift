import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the complete customer landing page", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "댓글의 소음은 줄이고,중요한 목소리는 더 선명하게.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "제품 예시 화면" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "CrowdSift 개발 지도" }),
    ).not.toBeInTheDocument();
  });
});
