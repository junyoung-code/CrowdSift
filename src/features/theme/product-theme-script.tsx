import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";

export const PRODUCT_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("${PRODUCT_THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`;

export function ProductThemeScript() {
  return (
    <script
      data-product-theme-bootstrap=""
      dangerouslySetInnerHTML={{ __html: PRODUCT_THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
