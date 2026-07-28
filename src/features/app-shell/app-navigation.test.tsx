import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { pathname: "/app" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

import {
  AppNavigation,
  isNavigationItemActive,
} from "./app-navigation";

describe("AppNavigation", () => {
  it.each([
    ["/app", "/app", true],
    ["/app/inbox", "/app", false],
    ["/app/inbox", "/app/inbox", true],
    ["/app/inbox/thread", "/app/inbox", true],
    ["/app/connect/youtube", "/app/connect/youtube", true],
  ])(
    "matches pathname %s against navigation href %s",
    (pathname, href, expected) => {
      expect(isNavigationItemActive(pathname, href)).toBe(expected);
    },
  );

  it("marks exactly one current link", () => {
    navigationState.pathname = "/app/inbox";

    render(<AppNavigation />);

    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "댓글 Inbox" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "개요" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
