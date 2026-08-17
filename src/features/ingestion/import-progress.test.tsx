import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportProgress } from "./import-progress";

describe("ImportProgress", () => {
  it("shows requested, fetched, stored, duplicate, and failed counts separately", () => {
    render(
      <ImportProgress
        summary={{
          duplicateCount: 2,
          failedCount: 1,
          fetchedCount: 27,
          requestedTopLevelCount: 20,
          status: "partially_succeeded",
          storedCount: 24,
          updatedCount: 0,
        }}
      />,
    );

    const progress = screen.getByRole("region", {
      name: "최근 댓글 가져오기 결과",
    });

    expect(within(progress).getByText("요청한 상위 댓글")).toBeInTheDocument();
    expect(within(progress).getByText("확인한 전체 댓글")).toBeInTheDocument();
    expect(within(progress).getByText("신규 저장")).toBeInTheDocument();
    expect(within(progress).getByText("이미 저장됨")).toBeInTheDocument();
    expect(within(progress).getByText("저장 실패")).toBeInTheDocument();
    expect(within(progress).getByText("일부 완료")).toBeInTheDocument();
  });

  it("does not label imported data as a sample", () => {
    render(
      <ImportProgress
        summary={{
          duplicateCount: 0,
          failedCount: 0,
          fetchedCount: 20,
          requestedTopLevelCount: 20,
          status: "succeeded",
          storedCount: 20,
          updatedCount: 0,
        }}
      />,
    );

    expect(screen.queryByText(/샘플|예시/)).not.toBeInTheDocument();
  });
});
