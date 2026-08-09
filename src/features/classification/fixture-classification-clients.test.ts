import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { routeFirstPass } from "./branch";
import {
  createClassificationService,
  type ClassificationJobRepository,
  type ClassificationWorkItem,
  type StoredFinalVerdict,
} from "./classification-service";
import {
  classificationStageProvider,
  createFixtureFirstPass,
  createFixtureSecondPass,
} from "./fixture-classification-clients";
import {
  DEFAULT_CLASSIFICATION_PROFILE,
  LunaFirstPassSchema,
  ModerationResultSchema,
  TerraVerdictSchema,
} from "./schemas";
import { toStageRunRow, toVerdictRow } from "./storage";

afterEach(() => {
  vi.restoreAllMocks();
});

const item = (
  id: string,
  sourceText: string,
): ClassificationWorkItem => ({
  id,
  workspaceId: "workspace-fixture",
  rawCommentId: `raw-${id}`,
  sourceText,
  videoTitle: "TEST FIXTURE · 채널 영상",
  channelId: "fixture-channel-1",
  policyVersion: 1,
  profile: DEFAULT_CLASSIFICATION_PROFILE,
  similarExamples: [],
  parent: null,
});

describe("Classification V1 fixture clients", () => {
  it("uses the same schemas, branch, finalize, and storage path without external network", async () => {
    const safe = item("safe", "2026-08-08 최신 채널 댓글");
    const danger = item(
      "danger",
      "다음 방송 장소로 찾아가서 가만두지 않겠다.",
    );
    const savedFirstPass = new Map<
      string,
      Parameters<ClassificationJobRepository["saveFirstPass"]>[1]
    >();
    const savedTerra = new Map<
      string,
      Parameters<ClassificationJobRepository["saveTerra"]>[1]
    >();
    const savedVerdicts = new Map<string, StoredFinalVerdict>();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const repository: ClassificationJobRepository = {
      claimItems: vi.fn(async () => [safe, danger]),
      loadState: vi.fn(async () => ({
        firstPass: null,
        branch: null,
        terra: null,
        verdict: null,
      })),
      saveFirstPass: vi.fn(async (target, result) => {
        savedFirstPass.set(target.id, result);
      }),
      saveBranch: vi.fn(async () => undefined),
      saveTerra: vi.fn(async (target, result) => {
        savedTerra.set(target.id, result);
      }),
      saveVerdict: vi.fn(async (target, result) => {
        savedVerdicts.set(target.id, result);
      }),
      completeItem: vi.fn(async () => undefined),
      failItem: vi.fn(async () => undefined),
      refreshJobProgress: vi.fn(async () => ({
        status: "succeeded" as const,
        total: 2,
        completed: 2,
        failed: 0,
        remaining: 0,
      })),
    };

    const progress = await createClassificationService({
      firstPass: createFixtureFirstPass(),
      secondPass: createFixtureSecondPass(),
      repository,
    }).processChunk("fixture-job", 5);

    expect(progress).toMatchObject({ status: "succeeded", completed: 2 });
    expect(fetchSpy).not.toHaveBeenCalled();

    const safeFirst = savedFirstPass.get("safe");
    const dangerFirst = savedFirstPass.get("danger");
    const dangerTerra = savedTerra.get("danger");
    expect(safeFirst).toBeDefined();
    expect(dangerFirst).toBeDefined();
    expect(dangerTerra).toBeDefined();
    expect(savedTerra.has("safe")).toBe(false);
    expect(routeFirstPass(safeFirst!)).toMatchObject({
      kind: "instant_safe",
    });
    expect(routeFirstPass(dangerFirst!)).toMatchObject({ kind: "verify" });
    expect(() => LunaFirstPassSchema.parse(dangerFirst!.luna.result)).not.toThrow();
    expect(() =>
      ModerationResultSchema.parse(dangerFirst!.moderation?.result),
    ).not.toThrow();
    expect(() => TerraVerdictSchema.parse(dangerTerra!.result)).not.toThrow();

    expect(savedVerdicts.get("safe")?.verdict).toMatchObject({
      status: "decided",
      level: "safe",
      basis: "instant_safe",
    });
    expect(savedVerdicts.get("danger")?.verdict).toMatchObject({
      status: "decided",
      level: "danger",
      hideSource: true,
    });

    const stageRow = toStageRunRow({
      item: danger,
      stage: "terra",
      provider: classificationStageProvider("fixture"),
      modelIdentifier: dangerTerra!.run.model,
      providerResponseId: dangerTerra!.run.responseId,
      idempotencyKey: "fixture-danger-terra",
      promptVersion: dangerTerra!.promptVersion,
      schemaVersion: "classification-v1",
      policyVersion: danger.policyVersion,
      latencyMs: dangerTerra!.run.latencyMs,
      usage: dangerTerra!.run.usage,
      status: "succeeded",
      output: dangerTerra!.result,
      errorCode: null,
    });
    const dangerVerdict = savedVerdicts.get("danger")!;
    const verdictRow = toVerdictRow({
      item: danger,
      ...dangerVerdict,
    });

    expect(stageRow).toMatchObject({
      provider: "fixture",
      model_identifier: "fixture-terra-v1",
      schema_version: "classification-v1",
    });
    expect(verdictRow).toMatchObject({
      level: "risk",
      hide_source: true,
    });
  });

  it("keeps the live stage provider identifier unchanged", () => {
    expect(classificationStageProvider("live")).toBe("openai");
  });
});
