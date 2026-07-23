import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("local Supabase auth origin", () => {
  it("allows the complete localhost callback documented in .env.example", () => {
    const root = process.cwd();
    const environmentExample = readFileSync(
      join(root, ".env.example"),
      "utf8",
    );
    const supabaseConfig = readFileSync(
      join(root, "supabase/config.toml"),
      "utf8",
    );

    expect(environmentExample).toContain(
      "APP_ORIGIN=http://localhost:3000",
    );
    expect(supabaseConfig).toContain(
      '"http://localhost:3000/auth/callback?next=/app"',
    );
  });
});
