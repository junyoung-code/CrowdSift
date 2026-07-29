import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  deleteWorkspaceAction: vi.fn(async () => undefined),
}));

import { DataDeletionForm } from "./data-deletion-form";

describe("DataDeletionForm", () => {
  it("shows the exact confirmation text and does not imply Auth deletion", () => {
    render(<DataDeletionForm />);

    expect(screen.getByText("CROWDSIFT 데이터 삭제")).toBeInTheDocument();
    expect(screen.getByLabelText("확인 문구")).toHaveAttribute(
      "placeholder",
      "CROWDSIFT 데이터 삭제",
    );
    expect(
      screen.getByText(/CrowdSift 로그인 계정은 삭제되지 않습니다/),
    ).toBeInTheDocument();
  });
});
