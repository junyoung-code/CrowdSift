import { describe, expect, it, vi } from "vitest";

import { createSupabaseDashboardSummaryRepository } from "./supabase-dashboard-summary-repository";

describe("Supabase dashboard summary repository", () => {
  it("maps stored aggregate inputs and persists model provenance", async () => {
    const loadInputs = vi.fn().mockResolvedValue({
      workspace_id: "workspace-1",
      job_status: "succeeded",
      analysis_count: 10,
      safe_count: 6,
      caution_count: 3,
      risk_count: 1,
      sanitized_signals: [
        "배송 안내 질문이 반복됨",
        "자막 크기 개선 요청",
      ],
    });
    const insert = vi.fn().mockResolvedValue({
      id: "summary-1",
      summary_text: "실제 데이터 요약",
    });
    const claimAttempt = vi.fn().mockResolvedValue({ attempt_count: 2 });
    const updateAttempt = vi.fn().mockResolvedValue(undefined);
    const repository = createSupabaseDashboardSummaryRepository({
      loadInputs,
      findByJobId: vi.fn().mockResolvedValue(null),
      insert,
      claimAttempt,
      updateAttempt,
    });

    await expect(repository.getJob("job-1")).resolves.toEqual({
      workspaceId: "workspace-1",
      status: "succeeded",
    });
    await expect(repository.countFinalAnalyses("job-1")).resolves.toBe(10);
    await expect(repository.getSummaryInputs("job-1")).resolves.toEqual({
      distribution: { safe: 6, caution: 3, risk: 1 },
      sanitizedSignals: [
        "배송 안내 질문이 반복됨",
        "자막 크기 개선 요청",
      ],
    });

    await repository.insertSummary({
      workspaceId: "workspace-1",
      analysisJobId: "job-1",
      sourceAnalysisCount: 10,
      summaryText: "실제 데이터 요약",
      provider: "openai",
      modelIdentifier: "configured-model",
      providerResponseId: "response-1",
      promptVersion: "crowdsift-dashboard-summary-v2",
      schemaVersion: "dashboard-summary-v1",
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });

    expect(loadInputs).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      analysis_job_id: "job-1",
      source_analysis_count: 10,
      summary_text: "실제 데이터 요약",
      provider: "openai",
      model_identifier: "configured-model",
      provider_response_id: "response-1",
      prompt_version: "crowdsift-dashboard-summary-v2",
      schema_version: "dashboard-summary-v1",
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });

    await expect(
      repository.claimAttempt({
        workspaceId: "workspace-1",
        analysisJobId: "job-1",
        maxAttempts: 3,
      }),
    ).resolves.toEqual({ attemptCount: 2 });
    await repository.markAttemptFailed({
      analysisJobId: "job-1",
      attemptCount: 2,
      errorCode: "dashboard_summary_failed",
    });
    await repository.markSucceeded({
      analysisJobId: "job-1",
      attemptCount: 2,
    });

    expect(claimAttempt).toHaveBeenCalledWith({
      target_workspace_id: "workspace-1",
      target_analysis_job_id: "job-1",
      target_max_attempts: 3,
    });
    expect(updateAttempt).toHaveBeenNthCalledWith(1, {
      analysis_job_id: "job-1",
      attempt_count: 2,
      state: "failed",
      error_code: "dashboard_summary_failed",
    });
    expect(updateAttempt).toHaveBeenNthCalledWith(2, {
      analysis_job_id: "job-1",
      attempt_count: 2,
      state: "succeeded",
      error_code: null,
    });
  });
});
