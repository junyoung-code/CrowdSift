import {
  DEVELOPMENT_PARTS,
  type DevelopmentPart,
  type PlansByPart,
} from "./development-data";

const CONTROL_CHARACTER_REPLACEMENTS: Record<string, string> = {
  '"': "'",
  "`": "'",
  "[": "(",
  "]": ")",
  "{": "(",
  "}": ")",
  "<": "",
  ">": "",
  "|": "/",
};

export function escapeMermaidLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/["`[\]{}<>|]/g, (character) =>
      CONTROL_CHARACTER_REPLACEMENTS[character] ?? "",
    );
}

function mermaidKey(part: DevelopmentPart): string {
  return part.id.toUpperCase();
}

export function buildMermaidSource(plans: PlansByPart): string {
  const lines = [
    "flowchart TD",
    '  ROOT["CommentHawk 구현 로드맵"]',
    '  MVP["통합 MVP: 실제 댓글 수집 → AI 분석 → 사용자 검토·조치"]',
    "",
  ];

  for (const part of DEVELOPMENT_PARTS) {
    const key = mermaidKey(part);
    const items = plans[part.id];

    lines.push(`  subgraph ${key}_GROUP["${part.number}. ${part.label}"]`);
    lines.push("    direction TB");
    lines.push(`    ${key}_ROOT["${escapeMermaidLabel(part.koreanLabel)}"]`);
    lines.push(`    ${key}_DONE["${part.label} 준비 완료"]`);

    if (items.length === 0) {
      lines.push(`    ${key}_ROOT --> ${key}_DONE`);
    } else {
      items.forEach((item, index) => {
        const itemId = `${key}_ITEM_${index}`;
        lines.push(`    ${itemId}["${escapeMermaidLabel(item.title)}"]`);
        lines.push(`    ${key}_ROOT --> ${itemId}`);
        lines.push(`    ${itemId} --> ${key}_DONE`);
      });
    }

    lines.push("  end");
    lines.push(`  ROOT --> ${key}_ROOT`);
    lines.push("");
  }

  lines.push(
    "  FRONTEND_DONE & BACKEND_DONE & AI_DONE & SECURITY_DONE --> MVP",
    "",
    "  classDef root fill:#0f172a,color:#ffffff,stroke:#0f172a,stroke-width:2px;",
    "  classDef detail fill:#ffffff,color:#334155,stroke:#cbd5e1,stroke-width:1px;",
    "  classDef frontend fill:#dbeafe,color:#1e3a8a,stroke:#60a5fa,stroke-width:1.5px;",
    "  classDef backend fill:#e0e7ff,color:#312e81,stroke:#818cf8,stroke-width:1.5px;",
    "  classDef ai fill:#ede9fe,color:#581c87,stroke:#a78bfa,stroke-width:1.5px;",
    "  classDef security fill:#ffedd5,color:#7c2d12,stroke:#fb923c,stroke-width:1.5px;",
    "  classDef goal fill:#dcfce7,color:#14532d,stroke:#4ade80,stroke-width:2px;",
    "  class ROOT root;",
    "  class MVP goal;",
  );

  for (const part of DEVELOPMENT_PARTS) {
    const key = mermaidKey(part);
    const itemIds = plans[part.id].map((_, index) => `${key}_ITEM_${index}`);
    lines.push(`  class ${key}_ROOT,${key}_DONE ${part.className};`);
    if (itemIds.length > 0) {
      lines.push(`  class ${itemIds.join(",")} detail;`);
    }
  }

  return lines.join("\n");
}
