import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("root layout scroll behavior", () => {
  it("declares the smooth scroll behavior used by the global stylesheet", () => {
    const rootLayout = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(rootLayout).toContain('data-scroll-behavior="smooth"');
  });
});
