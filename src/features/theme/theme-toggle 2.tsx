"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

import {
  applyProductTheme,
  type ProductTheme,
  readProductTheme,
} from "./product-theme";

const options = [
  { theme: "light", label: "라이트 모드 사용", icon: Sun },
  { theme: "dark", label: "다크 모드 사용", icon: Moon },
] as const;

const PRODUCT_THEME_CHANGE_EVENT = "crowdsift:product-theme-change";

function subscribeToProductTheme(onStoreChange: () => void) {
  window.addEventListener(PRODUCT_THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(PRODUCT_THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readServerProductTheme(): ProductTheme {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToProductTheme,
    readProductTheme,
    readServerProductTheme,
  );

  const selectTheme = (nextTheme: ProductTheme) => {
    applyProductTheme(nextTheme);
    window.dispatchEvent(new Event(PRODUCT_THEME_CHANGE_EVENT));
  };

  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {options.map(({ theme: optionTheme, label, icon: Icon }) => {
        const selected = theme === optionTheme;

        return (
          <button
            aria-label={label}
            aria-pressed={selected}
            className={`theme-toggle-button${selected ? " is-selected" : ""}`}
            key={optionTheme}
            onClick={() => selectTheme(optionTheme)}
            title={label}
            type="button"
          >
            <Icon aria-hidden="true" weight={selected ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}
