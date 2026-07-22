import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cloneDefaultPlans } from "./development-data";
import { DEVELOPMENT_MAP_STORAGE_KEY } from "./development-storage";
import { DevelopmentMap } from "./development-map";

vi.mock("./mermaid-canvas", () => ({
  MermaidCanvas: ({ source }: { source: string }) => (
    <pre data-testid="mermaid-source">{source}</pre>
  ),
}));

describe("DevelopmentMap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders seeded plans and the four-part Mermaid source", async () => {
    render(<DevelopmentMap />);

    expect(await screen.findByText("Front-end 공통 기반과 디자인 시스템")).toBeInTheDocument();
    expect(screen.getByTestId("mermaid-source")).toHaveTextContent("subgraph FRONTEND_GROUP");
    expect(screen.getByTestId("mermaid-source")).toHaveTextContent("subgraph SECURITY_GROUP");
  });

  it("hydrates a valid stored plan without overwriting it first", async () => {
    const storedPlans = cloneDefaultPlans();
    storedPlans.frontend = [{ id: "stored", title: "저장된 사용자 화면 계획" }];
    window.localStorage.setItem(DEVELOPMENT_MAP_STORAGE_KEY, JSON.stringify(storedPlans));

    render(<DevelopmentMap />);

    expect(await screen.findByText("저장된 사용자 화면 계획")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(DEVELOPMENT_MAP_STORAGE_KEY) ?? "{}")).toEqual(
      storedPlans,
    );
  });

  it("persists a newly added plan and updates the Mermaid source", async () => {
    const user = userEvent.setup();
    render(<DevelopmentMap />);

    await user.click(screen.getByRole("button", { name: "계획 추가" }));
    await user.type(screen.getByRole("textbox", { name: "새 계획 이름" }), "사용자 설정 페이지");
    await user.click(screen.getByRole("button", { name: "추가하기" }));

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(DEVELOPMENT_MAP_STORAGE_KEY) ?? "{}",
      );
      expect(stored.frontend).toContainEqual(
        expect.objectContaining({ title: "사용자 설정 페이지" }),
      );
    });
    expect(screen.getByTestId("mermaid-source")).toHaveTextContent("사용자 설정 페이지");
  });

  it("keeps edits in memory and warns when storage writes fail", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    render(<DevelopmentMap />);

    await user.click(screen.getByRole("button", { name: "계획 추가" }));
    await user.type(screen.getByRole("textbox", { name: "새 계획 이름" }), "메모리 계획");
    await user.click(screen.getByRole("button", { name: "추가하기" }));

    expect(await screen.findByText("메모리 계획")).toBeInTheDocument();
    expect(
      await screen.findByText("변경 내용은 현재 화면에만 유지됩니다."),
    ).toBeInTheDocument();
  });
});
