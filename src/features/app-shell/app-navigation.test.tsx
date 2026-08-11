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

  it("removes the video menu and adds developer tools only for approved developers", () => {
    navigationState.pathname = "/app";

    const normal = render(<AppNavigation />);

    expect(screen.queryByRole("link", { name: "영상" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "개발자 도구" }),
    ).not.toBeInTheDocument();
    normal.unmount();

    render(<AppNavigation developerToolsEnabled />);

    const links = screen.getAllByRole("link");
    expect(links.at(-1)).toHaveAccessibleName("개발자 도구");
    expect(links.at(-1)).toHaveAttribute("href", "/app/developer-tools");
  });
});
