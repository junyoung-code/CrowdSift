import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/development-map/development-map", () => ({
  DevelopmentMap: () => <section aria-label="CommentHawk 개발 지도" />,
}));

import Home from "./page";

describe("Home", () => {
  it("keeps the product introduction and renders the development map", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /중요한 댓글은 놓치지 않고/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "CommentHawk 개발 지도" }),
    ).toBeInTheDocument();
  });
});
