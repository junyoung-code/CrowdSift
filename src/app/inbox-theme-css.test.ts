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

  it("derives AI correction controls from theme tokens", () => {
    const controls = declarationsFor(
      ".inbox-page .feedback-correction select",
    );

    expect(controls).toContain("var(--inbox-panel-raised)");
    expect(controls).toContain("var(--inbox-text-soft)");
    expect(controls).not.toContain("#090e16");
  });

  it("uses the approved 30/42/28 desktop workspace hierarchy", () => {
    const workspace = declarationsFor(".inbox-workspace");

    expect(workspace).toContain("minmax(270px, 30fr)");
    expect(workspace).toContain("minmax(420px, 42fr)");
    expect(workspace).toContain("minmax(290px, 28fr)");
  });

  it("styles the richer queue context and connected video row", () => {
    expect(declarationsFor(".inbox-queue-context")).toContain("font-weight");
    expect(declarationsFor(".inbox-queue-video")).toContain("display: flex");
  });

  it("keeps queue and conversation copy readable at production density", () => {
    expect(declarationsFor(".inbox-queue-select strong")).toContain(
      "font-size: 14px",
    );
    expect(declarationsFor(".inbox-queue-select small")).toContain(
      "font-size: 12px",
    );
    expect(declarationsFor(".inbox-queue-context")).toContain(
      "font-size: 12px",
    );
    expect(
      declarationsFor(".inbox-queue-item .inbox-sanitized-feedback"),
    ).toContain("font-size: 14px");
    expect(declarationsFor(".inbox-queue-video > span")).toContain(
      "font-size: 12px",
    );
    expect(declarationsFor(".inbox-thread-author strong")).toContain(
      "font-size: 15px",
    );
    expect(declarationsFor(".inbox-thread-author span")).toContain(
      "font-size: 12px",
    );
    expect(declarationsFor(".inbox-protected-source > p")).toContain(
      "font-size: 17px",
    );
    expect(declarationsFor(".inbox-source-warning-row > span")).toContain(
      "font-size: 13px",
    );
    expect(declarationsFor(".inbox-page .comment-source-text")).toContain(
      "font-size: 16px",
    );
  });

  it("halves the queue's vertical rhythm while preserving the 48px text rail", () => {
    expect(declarationsFor(".inbox-queue-item")).toContain(
      "padding: 10px 20px",
    );
    expect(declarationsFor(".inbox-queue-select")).toContain("gap: 12px");
    expect(declarationsFor(".inbox-queue-select .inbox-avatar")).toContain(
      "width: 36px",
    );
    expect(declarationsFor(".inbox-queue-context")).toContain(
      "margin: 3px 0 0 48px",
    );
    expect(
      declarationsFor(".inbox-queue-item .inbox-sanitized-feedback"),
    ).toContain("margin: 6px 0 8px 48px");
    expect(declarationsFor(".inbox-queue-video")).toContain(
      "margin: 0 0 7px 48px",
    );
    expect(declarationsFor(".inbox-queue-item-meta")).toContain(
      "margin-left: 48px",
    );
  });

  it("centers the primary conversation content with half-width gutters", () => {
    const card = declarationsFor(".inbox-protected-source");
    const reactions = declarationsFor(".inbox-thread-reactions");

    expect(card).toContain("width: calc(100% - 32px)");
    expect(card).toContain("max-width: 680px");
    expect(card).toContain("margin: 12px auto 0");
    expect(reactions).toContain("width: calc(100% - 32px)");
    expect(reactions).toContain("max-width: 680px");
    expect(reactions).toContain("margin: 8px auto 0");
  });

  it("uses one readable type scale in the analysis column", () => {
    expect(declarationsFor(".inbox-insight-summary")).toContain("gap: 12px");
    expect(declarationsFor(".inbox-insight-summary")).toContain(
      "padding: 18px",
    );
    expect(declarationsFor(".inbox-insight-summary strong")).toContain(
      "font-size: 14px",
    );
    expect(declarationsFor(".inbox-insight-summary > p")).toContain(
      "font-size: 13px",
    );
    expect(
      declarationsFor(".inbox-insight-summary > span:last-child"),
    ).toContain("font-size: 12px");
    expect(declarationsFor(".inbox-page .inbox-analysis-facts dt")).toContain(
      "font-size: 12px",
    );
    expect(declarationsFor(".inbox-page .inbox-analysis-facts dd")).toContain(
      "font-size: 13px",
    );
  });

  it("keeps analysis correction and moderation controls legible", () => {
    expect(
      declarationsFor(".inbox-page .feedback-correction summary"),
    ).toContain("font-size: 13px");
    expect(
      declarationsFor(
        ".inbox-page .feedback-correction form > label:not(.feedback-consent)",
      ),
    ).toContain("font-size: 12px");
    expect(
      declarationsFor(".inbox-page .inbox-moderation-actions > p"),
    ).toContain("font-size: 12px");
    expect(
      declarationsFor(".inbox-page .inbox-moderation-actions .button"),
    ).toContain("font-size: 12px");
    expect(
      declarationsFor(".inbox-page .inbox-moderation-actions .button"),
    ).toContain("min-height: 40px");
    expect(
      declarationsFor(".inbox-page .feedback-correction .button"),
    ).toContain("font-size: 12px");
  });

  it("shares one header scale across all three workspace columns", () => {
    expect(
      declarationsFor(
        ".inbox-workspace :is(.inbox-queue, .inbox-conversation, .inbox-insights) > header h2",
      ),
    ).toContain("font-size: 18px");
    expect(
      declarationsFor(
        ".inbox-workspace :is(.inbox-queue, .inbox-conversation, .inbox-insights) > header p",
      ),
    ).toContain("font-size: 10px");
  });

  it("halves the whitespace inside the primary conversation area", () => {
    const card = declarationsFor(".inbox-protected-source");

    expect(declarationsFor(".inbox-thread")).toContain(
      "padding: 12px clamp(10px, 1.1vw, 14px)",
    );
    expect(declarationsFor(".inbox-thread-author")).toContain("gap: 6px");
    expect(card).toContain("gap: 8px");
    expect(card).toContain("padding: 12px");
    expect(declarationsFor(".inbox-source-warning-row")).toContain(
      "gap: 8px",
    );
    expect(declarationsFor(".inbox-source-warning-row")).toContain(
      "padding: 6px 6px 6px 7px",
    );
    expect(declarationsFor(".inbox-thread-reactions")).toContain("gap: 8px");
    expect(declarationsFor(".inbox-no-replies")).toContain(
      "margin: 10px auto 0",
    );
    expect(declarationsFor(".inbox-page .source-reveal-button")).toContain(
      "font-size: 13px",
    );
    expect(
      declarationsFor(".inbox-source-warning-row > .source-reveal-button"),
    ).toContain("min-height: 40px");
  });

  it("uses the blueprint conversation hierarchy instead of a nested outer card", () => {
    const threadComment = declarationsFor(".inbox-thread-comment");

    expect(threadComment).toContain("border: 0");
    expect(threadComment).toContain("padding: 0");
    expect(threadComment).toContain("background: transparent");
    expect(threadComment).toContain("box-shadow: none");
    expect(declarationsFor(".inbox-source-warning-row")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto",
    );
    expect(declarationsFor(".inbox-protected-source-caution")).toContain(
      "var(--app-caution-soft)",
    );
  });

  it("keeps revealed source content neutral instead of signaling safety", () => {
    const revealedSource = declarationsFor(".inbox-page .comment-source-block");

    expect(revealedSource).toContain("border-color: var(--inbox-line)");
    expect(revealedSource).toContain("background: var(--inbox-panel-raised)");
    expect(revealedSource).not.toContain("16 185 129");
  });

  it("styles the classification trace as a closed accordion", () => {
    const traceSummary = declarationsFor(".classification-trace > summary");

    expect(traceSummary).toContain("cursor: pointer");
    expect(traceSummary).toContain("list-style: none");
  });

  it("keeps the approved responsive workspace breakpoints", () => {
    expect(globalsCss).toContain("@media (max-width: 1260px)");
    expect(globalsCss).toContain("@media (max-width: 900px)");
  });
});
