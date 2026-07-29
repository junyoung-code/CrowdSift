import { beforeEach, describe, expect, it } from "vitest";

import {
  applyProductTheme,
  isProductTheme,
  PRODUCT_THEME_STORAGE_KEY,
  readProductTheme,
} from "./product-theme";

describe("product theme", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("accepts only the supported themes", () => {
    expect(isProductTheme("light")).toBe(true);
    expect(isProductTheme("dark")).toBe(true);
    expect(isProductTheme("system")).toBe(false);
    expect(isProductTheme(null)).toBe(false);
  });

  it("reads the current valid document theme and otherwise falls back to light", () => {
    document.documentElement.dataset.theme = "dark";
    expect(readProductTheme()).toBe("dark");

    document.documentElement.dataset.theme = "unexpected";
    expect(readProductTheme()).toBe("light");
  });

  it("applies and persists the selected theme", () => {
    applyProductTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      window.localStorage.getItem(PRODUCT_THEME_STORAGE_KEY),
    ).toBe("dark");
  });

  it("still applies the theme when browser storage is unavailable", () => {
    const unavailableStorage = {
      setItem() {
        throw new Error("storage unavailable");
      },
    } as Storage;

    expect(() =>
      applyProductTheme("dark", document.documentElement, unavailableStorage),
    ).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
