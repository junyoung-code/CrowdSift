import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("exposes the current theme as an accessible pressed state", () => {
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "라이트 모드 사용" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("applies and stores the selected theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      window.localStorage.getItem(PRODUCT_THEME_STORAGE_KEY),
    ).toBe("dark");
    expect(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
