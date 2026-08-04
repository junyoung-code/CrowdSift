export const PRODUCT_THEMES = ["light", "dark"] as const;
export type ProductTheme = (typeof PRODUCT_THEMES)[number];

export const PRODUCT_THEME_STORAGE_KEY = "crowdsift-product-theme";

export function isProductTheme(value: unknown): value is ProductTheme {
  return value === "light" || value === "dark";
}

export function readProductTheme(
  root?: HTMLElement,
): ProductTheme {
  const resolvedRoot =
    root ??
    (typeof document === "undefined" ? undefined : document.documentElement);

  return isProductTheme(resolvedRoot?.dataset.theme)
    ? resolvedRoot.dataset.theme
    : "light";
}

export function applyProductTheme(
  theme: ProductTheme,
  root: HTMLElement = document.documentElement,
  storage: Storage = window.localStorage,
): void {
  root.dataset.theme = theme;

  try {
    storage.setItem(PRODUCT_THEME_STORAGE_KEY, theme);
  } catch {
    // DOM theme switching must keep working when storage is blocked.
  }
}
