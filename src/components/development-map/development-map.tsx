"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { buildMermaidSource } from "./build-mermaid-source";
import {
  type DevelopmentPartId,
  type PlansByPart,
} from "./development-data";
import {
  DEVELOPMENT_MAP_STORAGE_KEY,
  readDevelopmentPlans,
  writeDevelopmentPlans,
} from "./development-storage";
import { MermaidCanvas } from "./mermaid-canvas";
import { PlanEditor } from "./plan-editor";

function createPlanId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function subscribeToStoredPlans(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === DEVELOPMENT_MAP_STORAGE_KEY) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

function getStoredPlansSnapshot(): string | null {
  try {
    return window.localStorage.getItem(DEVELOPMENT_MAP_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerPlansSnapshot(): null {
  return null;
}

export function DevelopmentMap() {
  const [selectedPartId, setSelectedPartId] = useState<DevelopmentPartId>("frontend");
  const storedSnapshot = useSyncExternalStore(
    subscribeToStoredPlans,
    getStoredPlansSnapshot,
    getServerPlansSnapshot,
  );
  const storedPlans = useMemo(
    () =>
      readDevelopmentPlans({
        getItem: () => storedSnapshot,
      }),
    [storedSnapshot],
  );
  const [editedPlans, setEditedPlans] = useState<PlansByPart | null>(null);
  const [storageWarning, setStorageWarning] = useState("");
  const plans = editedPlans ?? storedPlans;
  const mermaidSource = useMemo(() => buildMermaidSource(plans), [plans]);

  function updatePart(
    partId: DevelopmentPartId,
    updater: (items: PlansByPart[DevelopmentPartId]) => PlansByPart[DevelopmentPartId],
  ) {
    const nextPlans = {
      ...plans,
      [partId]: updater(plans[partId]),
    };

    setEditedPlans(nextPlans);
    const stored = writeDevelopmentPlans(nextPlans);
    setStorageWarning(stored ? "" : "변경 내용은 현재 화면에만 유지됩니다.");
  }

  function addPlan(title: string) {
    updatePart(selectedPartId, (items) => [
      ...items,
      { id: createPlanId(), title },
    ]);
  }

  function renamePlan(itemId: string, title: string) {
    updatePart(selectedPartId, (items) =>
      items.map((item) => (item.id === itemId ? { ...item, title } : item)),
    );
  }

  function deletePlan(itemId: string) {
    updatePart(selectedPartId, (items) => items.filter((item) => item.id !== itemId));
  }

  return (
    <section
      id="development-map"
      aria-label="CommentHawk 개발 지도"
      className="relative border-t border-slate-200 bg-white py-24 sm:py-28"
    >
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-700 sm:text-sm">COMMENTHAWK DEVELOPMENT MAP</p>
          <h2 className="mt-5 text-balance text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-5xl">
            우리가 해야 할 일을, 하나의 지도로 봅니다.
          </h2>
          <p className="mt-5 text-pretty text-base leading-7 text-slate-600 sm:text-lg">
            Frontend, Backend, AI, Security 네 파트가 실제 댓글을 다루는 통합 MVP로 모입니다. 아래 노드는 구현 계획이며 현재 완료 상태를 의미하지 않습니다.
          </p>
        </div>

        <MermaidCanvas source={mermaidSource} />

        <div className="mt-6">
          <PlanEditor
            selectedPartId={selectedPartId}
            items={plans[selectedPartId]}
            onSelectPart={setSelectedPartId}
            onAdd={addPlan}
            onRename={renamePlan}
            onDelete={deletePlan}
          />
        </div>

        {storageWarning && (
          <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {storageWarning}
          </p>
        )}
      </div>
    </section>
  );
}
