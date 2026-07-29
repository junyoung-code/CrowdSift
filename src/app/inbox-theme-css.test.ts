import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function declarationsFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...globalsCss.matchAll(
      new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"),
    ),
  ];

  expect(matches.length, `Missing CSS rule for ${selector}`).toBeGreaterThan(0);
  return matches.map((match) => match[1]).join("\n");
}

describe("Comment Inbox theme surfaces", () => {
  it("derives the conversation background from theme tokens", () => {
    expect(declarationsFor(".inbox-conversation")).toContain(
      "var(--inbox-panel)",
    );
  });

  it("derives the selected queue background from theme tokens", () => {
    expect(declarationsFor(".inbox-queue-item.is-selected")).toContain(
      "var(--app-surface-hover)",
    );
  });

  it("derives the insight summary background from theme tokens", () => {
    expect(declarationsFor(".inbox-insight-summary")).toContain(
      "var(--inbox-panel-raised)",
    );
  });
});
