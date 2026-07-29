import { beforeEach, describe, expect, it } from "vitest";

import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";
import { PRODUCT_THEME_BOOTSTRAP_SCRIPT } from "./product-theme-script";

describe("product theme bootstrap script", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("applies a stored dark theme before React hydrates", () => {
    window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, "dark");

    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses light for missing or invalid stored values", () => {
    window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, "system");

    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
