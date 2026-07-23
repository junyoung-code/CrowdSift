import { describe, expect, it, vi } from "vitest";

import {
  createDashboardSummaryService,
  type DashboardSummaryRepository,
} from "./dashboard-summary-service";

const summaryModelResult = {
  output: {
    summary: "주의 댓글에는 자막 개선 요청이 반복됩니다.",
  },
  provider: "openai" as const,
  modelIdentifier: "configured-model",
  providerResponseId: "response-1",
  latencyMs: 20,
  usage: {
    inputTokens: 30,
    outputTokens: 12,
    totalTokens: 42,
  },
};

const createRepository = (): DashboardSummaryRepository => ({
  getJob: vi.fn().mockResolvedValue({
    workspaceId: "workspace-1",
    status: "succeeded",
  }),
  findByJobId: vi.fn().mockResolvedValue(null),
  countFinalAnalyses: vi.fn().mockResolvedValue(10),
  getSummaryInputs: vi.fn().mockResolvedValue({
    distribution: { safe: 6, caution: 3, risk: 1 },
    sanitizedSignals: [
      "배송 안내 질문이 반복됨",
      "자막 크기 개선 요청",
    ],
  }),
  insertSummary: vi.fn().mockResolvedValue({
    id: "summary-1",
    summaryText: summaryModelResult.output.summary,
  }),
});

describe("dashboard summary service", () => {
  it("does not create an AI summary before ten final analyses", async () => {
    const repository = createRepository();
    vi.mocked(repository.countFinalAnalyses).mockResolvedValue(9);
    const provider = {
      summarizeDashboard: vi.fn(),
    };
    const service = createDashboardSummaryService({ repository, provider });

    const result = await service.createForCompletedJob("job-1");

    expect(result).toBeNull();
    expect(provider.summarizeDashboard).not.toHaveBeenCalled();
    expect(repository.insertSummary).not.toHaveBeenCalled();
  });

  it("stores a model-backed summary from real derived signals", async () => {
    const repository = createRepository();
    const provider = {
      summarizeDashboard: vi.fn().mockResolvedValue(summaryModelResult),
    };
    const service = createDashboardSummaryService({ repository, provider });

    await service.createForCompletedJob("job-1");

    expect(provider.summarizeDashboard).toHaveBeenCalledWith({
      analysisCount: 10,
      distribution: { safe: 6, caution: 3, risk: 1 },
      sanitizedSignals: [
        "배송 안내 질문이 반복됨",
        "자막 크기 개선 요청",
      ],
    });
    expect(repository.insertSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        analysisJobId: "job-1",
        sourceAnalysisCount: 10,
        summaryText: summaryModelResult.output.summary,
        provider: "openai",
        modelIdentifier: "configured-model",
      }),
    );
  });

  it("returns an existing summary without another model call", async () => {
    const repository = createRepository();
    vi.mocked(repository.findByJobId).mockResolvedValue({
      id: "summary-existing",
      summaryText: "저장된 실제 요약",
    });
    const provider = { summarizeDashboard: vi.fn() };
    const service = createDashboardSummaryService({ repository, provider });

    await expect(service.createForCompletedJob("job-1")).resolves.toEqual({
      id: "summary-existing",
      summaryText: "저장된 실제 요약",
    });
    expect(provider.summarizeDashboard).not.toHaveBeenCalled();
  });
});
