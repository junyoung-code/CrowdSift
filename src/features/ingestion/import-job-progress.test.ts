import { describe, expect, it } from "vitest";

import { toImportJobProgress } from "./import-job-progress";

describe("toImportJobProgress", () => {
  it("labels public work as read-only and reports import and analysis separately", () => {
    expect(
      toImportJobProgress({
        job: {
          id: "job-1",
          sourceKind: "public_url",
          requestedTopLevelCount: null,
          requestedTotalCount: 20,
          status: "succeeded",
          fetchedCount: 20,
          storedCount: 18,
          duplicateCount: 2,
          failedCount: 0,
          topLevelCount: 12,
          replyCount: 8,
          youtubeQuotaUnitsUsed: 3,
          lastErrorCode: null,
        },
        analysisJob: {
          id: "analysis-1",
          status: "running",
          totalCount: 20,
          completedCount: 7,
          failedCount: 1,
        },
      }),
    ).toEqual({
      jobId: "job-1",
      sourceKind: "public_url",
      sourceLabel: "공개 URL",
      readOnly: true,
      requestedCount: 20,
      import: {
        status: "succeeded",
        observedCount: 20,
        storedCount: 18,
        duplicateCount: 2,
        failedCount: 0,
        topLevelCount: 12,
        replyCount: 8,
        youtubeQuotaUnitsUsed: 3,
        errorCode: null,
      },
      analysis: {
        jobId: "analysis-1",
        status: "running",
        totalCount: 20,
        completedCount: 7,
        failedCount: 1,
      },
    });
  });

  it("keeps the existing owned source label and top-level request count", () => {
    expect(
      toImportJobProgress({
        job: {
          id: "job-2",
          sourceKind: "owned_oauth",
          requestedTopLevelCount: 30,
          requestedTotalCount: null,
          status: "pending",
          fetchedCount: 0,
          storedCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          topLevelCount: 0,
          replyCount: 0,
          youtubeQuotaUnitsUsed: 0,
          lastErrorCode: null,
        },
        analysisJob: null,
      }),
    ).toMatchObject({
      sourceKind: "owned_oauth",
      sourceLabel: "내 채널",
      readOnly: false,
      requestedCount: 30,
      analysis: null,
    });
  });
});
