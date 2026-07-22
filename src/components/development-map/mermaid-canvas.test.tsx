import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MermaidCanvas } from "./mermaid-canvas";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: mermaidMock,
}));

describe("MermaidCanvas", () => {
  beforeEach(() => {
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({
      svg: '<svg data-testid="rendered-map"><text>map</text></svg>',
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("initializes Mermaid securely and renders the supplied source", async () => {
    render(<MermaidCanvas source={"flowchart TD\nA --> B"} />);

    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(1));

    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: "strict",
        flowchart: expect.objectContaining({ htmlLabels: false }),
      }),
    );
    expect(mermaidMock.render.mock.calls[0]?.[1]).toBe("flowchart TD\nA --> B");
    expect(screen.getByTestId("mermaid-output").querySelector("svg")).not.toBeNull();
  });

  it("copies the exact Mermaid source and reports feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    const source = "flowchart TD\nROOT --> MVP";
    render(<MermaidCanvas source={source} />);

    await user.click(screen.getByRole("button", { name: "Mermaid 복사" }));

    expect(writeText).toHaveBeenCalledWith(source);
    expect(screen.getByRole("status")).toHaveTextContent("복사됨");
  });

  it("requests full screen from the chart shell", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    render(<MermaidCanvas source={"flowchart TD\nA --> B"} />);

    const shell = screen.getByTestId("mermaid-shell");
    Object.defineProperty(shell, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    fireEvent.click(screen.getByRole("button", { name: "전체 화면" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous SVG visible when a later render fails", async () => {
    const { rerender } = render(<MermaidCanvas source={"flowchart TD\nA --> B"} />);
    await screen.findByTestId("rendered-map");

    mermaidMock.render.mockRejectedValueOnce(new Error("invalid graph"));
    rerender(<MermaidCanvas source={"flowchart TD\nA -- bad"} />);

    expect(await screen.findByText("차트를 다시 그리지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByTestId("rendered-map")).toBeInTheDocument();
  });
});
