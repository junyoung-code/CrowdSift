import { describe, expect, it } from "vitest";

import { cloneDefaultPlans } from "./development-data";
import {
  buildMermaidSource,
  escapeMermaidLabel,
} from "./build-mermaid-source";

describe("buildMermaidSource", () => {
  it("builds one TD graph with four part subgraphs and an integrated MVP", () => {
    const source = buildMermaidSource(cloneDefaultPlans());

    expect(source).toContain("flowchart TD");
    expect(source).toContain('subgraph FRONTEND_GROUP["1. Frontend"]');
    expect(source).toContain('subgraph BACKEND_GROUP["2. Backend"]');
    expect(source).toContain('subgraph AI_GROUP["3. AI"]');
    expect(source).toContain('subgraph SECURITY_GROUP["4. Security"]');
    expect(source).toContain(
      "FRONTEND_DONE & BACKEND_DONE & AI_DONE & SECURITY_DONE --> MVP",
    );
  });

  it("creates node IDs from part keys and indexes rather than labels", () => {
    const plans = cloneDefaultPlans();
    plans.frontend = [{ id: "raw-user-id", title: "사용자 입력 제목" }];

    const source = buildMermaidSource(plans);

    expect(source).toContain('FRONTEND_ITEM_0["사용자 입력 제목"]');
    expect(source).not.toContain("raw-user-id[");
  });

  it("normalizes line breaks and removes Mermaid control characters from labels", () => {
    const escaped = escapeMermaidLabel('  위험한\n\"라벨\" [노드] <script> |  ');

    expect(escaped).toBe("위험한 '라벨' (노드) script /");
  });

  it("keeps a valid completion path for a part with no task items", () => {
    const plans = cloneDefaultPlans();
    plans.ai = [];

    const source = buildMermaidSource(plans);

    expect(source).toContain("AI_ROOT --> AI_DONE");
  });
});
