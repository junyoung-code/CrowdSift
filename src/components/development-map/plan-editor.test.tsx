import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PLANS } from "./development-data";
import { PlanEditor } from "./plan-editor";

function renderEditor(overrides?: Partial<React.ComponentProps<typeof PlanEditor>>) {
  const props: React.ComponentProps<typeof PlanEditor> = {
    selectedPartId: "frontend",
    items: DEFAULT_PLANS.frontend,
    onSelectPart: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  return { ...render(<PlanEditor {...props} />), props };
}

describe("PlanEditor", () => {
  it("shows the four parts and reports part selection", async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();

    expect(screen.getByRole("button", { name: /Frontend/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Backend/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AI/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Security/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Backend/ }));
    expect(props.onSelectPart).toHaveBeenCalledWith("backend");
  });

  it("adds a trimmed plan and rejects whitespace-only names", async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();

    await user.click(screen.getByRole("button", { name: "계획 추가" }));
    const input = screen.getByRole("textbox", { name: "새 계획 이름" });
    await user.type(input, "   ");
    await user.click(screen.getByRole("button", { name: "추가하기" }));

    expect(props.onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("계획 이름을 입력해 주세요.")).toBeInTheDocument();

    await user.type(input, "  반응형 대시보드 구현  ");
    await user.click(screen.getByRole("button", { name: "추가하기" }));

    expect(props.onAdd).toHaveBeenCalledWith("반응형 대시보드 구현");
  });

  it("renames a plan inline and supports cancel", async () => {
    const user = userEvent.setup();
    const item = DEFAULT_PLANS.frontend[0];
    const { props } = renderEditor({ items: [item] });

    await user.click(screen.getByRole("button", { name: `${item.title} 수정` }));
    const input = screen.getByRole("textbox", { name: "계획 이름 수정" });
    await user.clear(input);
    await user.type(input, "공통 UI 시스템 구현");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(props.onRename).toHaveBeenCalledWith(item.id, "공통 UI 시스템 구현");

    await user.click(screen.getByRole("button", { name: `${item.title} 수정` }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("textbox", { name: "계획 이름 수정" })).not.toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    const user = userEvent.setup();
    const item = DEFAULT_PLANS.frontend[0];
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { props } = renderEditor({ items: [item] });

    const deleteButton = screen.getByRole("button", { name: `${item.title} 삭제` });
    await user.click(deleteButton);
    expect(props.onDelete).not.toHaveBeenCalled();

    await user.click(deleteButton);
    expect(confirm).toHaveBeenCalledWith("이 계획을 삭제할까요?");
    expect(props.onDelete).toHaveBeenCalledWith(item.id);
  });

  it("shows a useful empty state", () => {
    renderEditor({ items: [] });

    expect(screen.getByText("아직 세부 계획이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첫 계획 추가" })).toBeInTheDocument();
  });
});
