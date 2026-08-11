import { readFileSync } from "node:fs";

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChannelSyncProgress } from "./channel-sync-progress";
import {
  ChannelSyncProgressPanel,
  ChannelSyncSetup,
} from "./channel-sync-progress-panel";

const progress = (
  overrides: Partial<ChannelSyncProgress> = {},
): ChannelSyncProgress => ({
  configured: true,
  enabled: true,
  active: true,
  startDate: "2026-08-01",
  backfillStatus: "running",
  backfillLabel: "초기 댓글 수집 중",
  lastSuccessfulSyncAt: null,
  counts: { stored: 12, duplicate: 3, failed: 1, analyzed: 10 },
  statusMessage: "선택한 날짜까지 댓글을 가져오고 있습니다.",
  errorMessage: null,
  ...overrides,
});

const action = vi.fn(async () => undefined);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("channel sync setup", () => {
  it("keeps the date form focused on automatic channel sync", () => {
    render(
      <ChannelSyncSetup
        configureAction={action}
        maxDate="2026-08-08"
      />,
    );

    expect(
      screen.getByLabelText("언제의 댓글부터 가져올까요?"),
    ).toHaveAttribute("type", "date");
    expect(
      screen.getByLabelText("언제의 댓글부터 가져올까요?"),
    ).toHaveAttribute("max", "2026-08-08");
    expect(
      screen.getByRole("button", { name: "댓글 가져오기 시작" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("link", { name: "영상 하나로 분류 테스트" }),
    ).not.toBeInTheDocument();
  });
});

describe("channel sync progress panel", () => {
  it("shows real dates and counts with an indeterminate accessible progress state", () => {
    render(
      <ChannelSyncProgressPanel
        initialProgress={progress()}
        requestNowAction={action}
        setEnabledAction={action}
      />,
    );

    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
    expect(screen.getAllByText("초기 댓글 수집 중")).toHaveLength(2);
    expect(screen.getByText("최근 성공 기록 없음")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar", {
      name: "댓글 동기화 진행 중",
    });
    expect(progressbar).not.toHaveAttribute("aria-valuenow");
    expect(progressbar).toHaveAttribute(
      "aria-valuetext",
      "전체 댓글 수를 알 수 없어 완료율 없이 진행 중",
    );
    expect(
      screen.getByText("선택한 날짜까지 댓글을 가져오고 있습니다."),
    ).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByRole("button", { name: "지금 동기화" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "자동 동기화 일시중지" }),
    ).toBeEnabled();
  });

  it("renders a failure as an alert and offers resume when paused", () => {
    render(
      <ChannelSyncProgressPanel
        initialProgress={progress({
          enabled: false,
          active: false,
          statusMessage: "자동 동기화를 일시중지했습니다.",
          errorMessage: "YouTube 읽기 권한을 확인할 수 없습니다.",
        })}
        requestNowAction={action}
        setEnabledAction={action}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "YouTube 읽기 권한을 확인할 수 없습니다.",
    );
    expect(
      screen.getByRole("button", { name: "자동 동기화 다시 시작" }),
    ).toBeEnabled();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("gets status, posts one bounded process request, polls again, and stops after unmount", async () => {
    vi.useFakeTimers();
    const activeProgress = progress();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => activeProgress,
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => activeProgress,
      } as Response);
    const view = render(
      <ChannelSyncProgressPanel
        initialProgress={activeProgress}
        requestNowAction={action}
        setEnabledAction={action}
      />,
    );

    await act(async () => {
      for (let count = 0; count < 12; count += 1) {
        await Promise.resolve();
      }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/channel-comment-sync/status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/channel-comment-sync/process",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/channel-comment-sync/status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const callsBeforeUnmount = fetchMock.mock.calls.length;

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeUnmount);
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).signal,
    ).toHaveProperty("aborted", true);
  });

  it("defines 44px targets and a single-column layout at 760px", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(
      /\.channel-sync-(?:setup|actions)[\s\S]*min-height:\s*44px/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*\.channel-sync-(?:setup-row|actions|metrics)[\s\S]*grid-template-columns:\s*1fr/,
    );
  });
});
