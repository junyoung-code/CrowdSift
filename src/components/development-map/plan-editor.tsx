"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  DEVELOPMENT_PARTS,
  type DevelopmentPartId,
  type PlanItem,
} from "./development-data";

type PlanEditorProps = {
  selectedPartId: DevelopmentPartId;
  items: PlanItem[];
  onSelectPart: (partId: DevelopmentPartId) => void;
  onAdd: (title: string) => void;
  onRename: (itemId: string, title: string) => void;
  onDelete: (itemId: string) => void;
};

const PART_STYLES: Record<DevelopmentPartId, { selected: string; badge: string }> = {
  frontend: {
    selected: "border-blue-300 bg-blue-50 text-blue-950 shadow-[0_10px_24px_rgba(37,99,235,0.10)]",
    badge: "bg-blue-600 text-white",
  },
  backend: {
    selected: "border-indigo-300 bg-indigo-50 text-indigo-950 shadow-[0_10px_24px_rgba(79,70,229,0.10)]",
    badge: "bg-indigo-600 text-white",
  },
  ai: {
    selected: "border-violet-300 bg-violet-50 text-violet-950 shadow-[0_10px_24px_rgba(124,58,237,0.10)]",
    badge: "bg-violet-600 text-white",
  },
  security: {
    selected: "border-orange-300 bg-orange-50 text-orange-950 shadow-[0_10px_24px_rgba(234,88,12,0.10)]",
    badge: "bg-orange-600 text-white",
  },
};

export function PlanEditor({
  selectedPartId,
  items,
  onSelectPart,
  onAdd,
  onRename,
  onDelete,
}: PlanEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editError, setEditError] = useState("");
  const selectedPart = DEVELOPMENT_PARTS.find((part) => part.id === selectedPartId)!;

  useEffect(() => {
    setIsAdding(false);
    setNewTitle("");
    setAddError("");
    setEditingId(null);
    setEditingTitle("");
    setEditError("");
  }, [selectedPartId]);

  function openAddForm() {
    setIsAdding(true);
    setNewTitle("");
    setAddError("");
    setEditingId(null);
  }

  function cancelAdd() {
    setIsAdding(false);
    setNewTitle("");
    setAddError("");
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();

    if (!title) {
      setAddError("계획 이름을 입력해 주세요.");
      return;
    }

    onAdd(title);
    cancelAdd();
  }

  function startEditing(item: PlanItem) {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setEditError("");
    setIsAdding(false);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingTitle("");
    setEditError("");
  }

  function submitRename(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault();
    const title = editingTitle.trim();

    if (!title) {
      setEditError("계획 이름을 입력해 주세요.");
      return;
    }

    onRename(itemId, title);
    cancelEditing();
  }

  function deleteItem(item: PlanItem) {
    if (window.confirm("이 계획을 삭제할까요?")) {
      onDelete(item.id);
    }
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="개발 파트 선택">
        {DEVELOPMENT_PARTS.map((part) => {
          const selected = part.id === selectedPartId;
          const styles = PART_STYLES[part.id];

          return (
            <button
              key={part.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectPart(part.id)}
              className={`flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                selected
                  ? styles.selected
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
              }`}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-black ${selected ? styles.badge : "bg-white text-slate-500 shadow-sm"}`}>
                {part.number}
              </span>
              <span>
                <span className="block text-sm font-bold">{part.label}</span>
                <span className="mt-1 block text-xs leading-5 opacity-75">{part.koreanLabel}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-blue-700">SELECTED PART {selectedPart.number}</p>
          <h3 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950">{selectedPart.label} 세부 계획</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{selectedPart.description}</p>
        </div>
        {!isAdding && items.length > 0 && (
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            계획 추가
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={submitAdd} className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
          <label htmlFor="new-plan-title" className="text-sm font-semibold text-slate-800">새 계획 이름</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="new-plan-title"
              autoFocus
              value={newTitle}
              onChange={(event) => {
                setNewTitle(event.target.value);
                setAddError("");
              }}
              className="h-11 min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="예: 사용자 설정 페이지 구현"
            />
            <button type="submit" className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">추가하기</button>
            <button type="button" onClick={cancelAdd} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">취소</button>
          </div>
          {addError && <p className="mt-2 text-sm font-medium text-rose-600">{addError}</p>}
        </form>
      )}

      {items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">아직 세부 계획이 없습니다.</p>
          <p className="mt-1 text-sm text-slate-500">이 파트에서 가장 먼저 해야 할 일을 추가해 보세요.</p>
          {!isAdding && (
            <button type="button" onClick={openAddForm} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              첫 계획 추가
            </button>
          )}
        </div>
      ) : (
        <ol className="mt-5 grid gap-3">
          {items.map((item, index) => (
            <li key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              {editingId === item.id ? (
                <form onSubmit={(event) => submitRename(event, item.id)}>
                  <label htmlFor={`edit-${item.id}`} className="text-sm font-semibold text-slate-800">계획 이름 수정</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`edit-${item.id}`}
                      autoFocus
                      value={editingTitle}
                      onChange={(event) => {
                        setEditingTitle(event.target.value);
                        setEditError("");
                      }}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button type="submit" className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">저장</button>
                    <button type="button" onClick={cancelEditing} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">취소</button>
                  </div>
                  {editError && <p className="mt-2 text-sm font-medium text-rose-600">{editError}</p>}
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-slate-500 shadow-sm">{index + 1}</span>
                    <p className="pt-0.5 text-sm font-medium leading-6 text-slate-800">{item.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-10 sm:pl-0">
                    <button type="button" onClick={() => startEditing(item)} aria-label={`${item.title} 수정`} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white hover:text-blue-700">수정</button>
                    <button type="button" onClick={() => deleteItem(item)} aria-label={`${item.title} 삭제`} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700">삭제</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
