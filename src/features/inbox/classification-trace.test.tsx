import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InboxClassificationTrace } from "./inbox-query";
import { ClassificationTrace } from "./classification-trace";

const trace: InboxClassificationTrace = {
  moderation: {
    status: "succeeded",
    modelIdentifier: "omni-moderation-latest",
    providerResponseId: null,
    promptVersion: null,
    latencyMs: 12,
    usage: {},
    output: {
      flagged: true,
      categories: ["harassment"],
      categoryScores: { harassment: 0.82 },
    },
    errorCode: null,
  },
  luna: {
    status: "succeeded",
    modelIdentifier: "gpt-5.6-luna",
    providerResponseId: "resp-luna",
    promptVersion: "luna-v1",
    latencyMs: 120,
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    output: {
      candidateLevel: "caution",
      certainty: "borderline",
      hardRiskFlags: [],
      softRiskFlags: ["mockery"],
      matchedRules: ["allowed-channel-slang"],
    },
    errorCode: null,
  },
  branch: {
    outcome: "verify",
    reasons: ["luna_caution", "moderation_flagged"],
    protection: { hideSourceBeforeVerdict: true },
  },
  terra: {
    status: "succeeded",
    modelIdentifier: "gpt-5.6-terra",
    providerResponseId: "resp-terra",
    promptVersion: "terra-v1",
    latencyMs: 210,
    usage: { inputTokens: 130, outputTokens: 35, totalTokens: 165 },
    output: {
      verdictLevel: "danger",
      certainty: "clear",
      reasonCodes: ["personal_attack"],
      feedbackType: "none",
      feedbackCore: null,
      recommendedActions: ["hide_source", "consider_delete"],
    },
    errorCode: null,
  },
  final: {
    status: "decided",
    level: "risk",
    basis: "danger_in_either",
    hideSource: true,
    raisedByModeration: false,
    reasonCodes: ["personal_attack"],
    recommendedActions: ["hide_source", "consider_delete"],
  },
};

describe("ClassificationTrace", () => {
  it("shows the values used at all five decision stages", () => {
    render(<ClassificationTrace trace={trace} />);

    const decisionDetails = screen.getByText("판단 과정").closest("details");
    expect(decisionDetails).toBeInTheDocument();
    expect(decisionDetails).not.toHaveAttribute("open");
    expect(screen.getByText("Moderation")).toBeInTheDocument();
    expect(screen.getByText("harassment · 0.82")).toBeInTheDocument();
    expect(screen.getByText("Luna 1차 분석")).toBeInTheDocument();
    expect(screen.getByText("주의 · borderline")).toBeInTheDocument();
    expect(screen.getByText("코드 분기")).toBeInTheDocument();
    expect(
      screen.getByText("luna_caution · moderation_flagged"),
    ).toBeInTheDocument();
    expect(screen.getByText("Terra 2차 검증")).toBeInTheDocument();
    expect(screen.getByText("위험 · clear")).toBeInTheDocument();
    expect(screen.getByText("최종 판정")).toBeInTheDocument();
    expect(
      screen.getByText("위험 · 두 판단이 갈려 높은 쪽을 택함"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("기술 정보 보기").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("explains why Terra has no values on an instant-safe path", () => {
    render(
      <ClassificationTrace
        trace={{
          ...trace,
          branch: { outcome: "instant_safe", reasons: [], protection: {} },
          terra: null,
          final: {
            ...trace.final!,
            level: "safe",
            basis: "instant_safe",
            hideSource: false,
          },
        }}
      />,
    );

    expect(screen.getByText("안전 즉시 통과로 생략")).toBeInTheDocument();
  });

  it("says how the level was reached when Terra gave no reason codes", () => {
    // 두 판단이 갈려 위험이 된 댓글은 Terra 가 위험이라 하지 않아 이유 코드가 빈다.
    // 그 자리를 이 문장이 메운다.
    render(
      <ClassificationTrace
        trace={{
          ...trace,
          final: { ...trace.final!, reasonCodes: [] },
        }}
      />,
    );

    expect(
      screen.getByText("위험 · 두 판단이 갈려 높은 쪽을 택함"),
    ).toBeInTheDocument();
  });
});
