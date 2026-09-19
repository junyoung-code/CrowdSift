"use client";

import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { ArrowClockwise, Plus, ShieldCheck, WarningCircle, UserCircle, X } from "@phosphor-icons/react";
import type { PolicyAction, PolicySensitivity } from "./policy-service";
import { parsePolicyPhraseLines } from "./policy-service";
import { DEFAULT_POLICY_TOPICS, POLICY_PRESETS, parseAllowedContexts, type AllowedContext, type PolicyPreviewResult } from "./policy-editor";
import styles from "./policy.module.css";

export type PolicyFormValues = {
  version: number; blocked: string; allowed: string; contextExceptions: string;
  sensitivity: PolicySensitivity; cautionAction: PolicyAction; riskAction: PolicyAction; harmfulTextHidden: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return <button className={styles.save} disabled={pending} type="submit">{pending ? "저장 중…" : "기준 저장"}</button>;
}

function CommentPreview({ comment, author, level, reason, note }: {
  comment: string; author: string; level: PolicyPreviewResult["level"]; reason: string; note: string;
}) {
  const label = level === "safe" ? "안전" : level === "caution" ? "주의" : level === "danger" ? "위험" : "판단 보류";
  return <div className={styles.commentPreview}>
    <UserCircle className={styles.avatar} size={44} weight="duotone" aria-hidden="true" />
    <div className={styles.commentBody}>
      <small className={styles.author}>{author}</small>
      <p className={styles.commentText}>{comment}</p>
      <span className={styles.badge} data-level={level ?? "hold"}>{level === "safe" ? <ShieldCheck aria-hidden="true" /> : <WarningCircle aria-hidden="true" />}{label}</span>
      <p className={styles.reason}>{reason}</p>
      <small className={styles.resultNote}>{note}</small>
    </div>
  </div>;
}

export function PolicyForm({ action, initial, previewAction }: {
  action: (data: FormData) => void | Promise<void>;
  initial: PolicyFormValues;
  previewAction?: (data: FormData) => Promise<PolicyPreviewResult>;
}) {
  const [topics, setTopics] = useState(() => initial.version === 0 && !initial.blocked ? DEFAULT_POLICY_TOPICS : parsePolicyPhraseLines(initial.blocked));
  const [custom, setCustom] = useState("");
  const [contexts, setContexts] = useState<AllowedContext[]>(() => {
    const contextual = parseAllowedContexts(initial.contextExceptions);
    const existing = parseAllowedContexts(initial.allowed).filter(row => !contextual.some(other => other.phrase === row.phrase));
    return [...contextual, ...existing].length ? [...contextual, ...existing] : [{ phrase: "", context: "" }];
  });
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<PolicyPreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const revision = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const change = () => { revision.current += 1; setResult(null); setError(""); };
  const toggle = (topic: string) => {
    if (!topics.includes(topic) && topics.length >= 30) { setError("주의할 내용은 30개까지 추가할 수 있어요."); return; }
    change(); setTopics(topics.includes(topic) ? topics.filter(item => item !== topic) : [...topics, topic]);
  };
  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (value.length > 40 || /[|\r\n]/.test(value)) { setError("내용은 구분 기호 없이 40자 이내로 입력해 주세요."); return; }
    if (topics.includes(value)) { setError("이미 선택한 내용이에요."); return; }
    if (topics.length >= 30) { setError("주의할 내용은 30개까지 추가할 수 있어요."); return; }
    change(); setTopics([...topics, value]); setCustom("");
  };
  const updateContext = (index: number, field: keyof AllowedContext, value: string) => {
    change(); setContexts(contexts.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };
  const checkPreview = () => {
    if (!previewAction || !comment.trim() || !form.current) return;
    if (!form.current.reportValidity()) return;
    const data = new FormData(form.current);
    data.set("comment", comment);
    const atRevision = revision.current;
    startTransition(async () => {
      try {
        const next = await previewAction(data);
        if (atRevision === revision.current) setResult(next);
      } catch { if (atRevision === revision.current) setResult({level:null,fixture:false,error:"미리보기를 불러오지 못했어요. 다시 시도해 주세요."}); }
    });
  };

  return <form ref={form} action={action} className={styles.form} onSubmit={event => {
    if (custom.trim()) { event.preventDefault(); setError("작성한 내용을 ‘추가’한 뒤 저장해 주세요."); }
  }}>
    <input type="hidden" name="editor" value="minimal" />
    <input type="hidden" name="topics" value={JSON.stringify(topics)} />
    <input type="hidden" name="contexts" value={JSON.stringify(contexts.filter(row => row.phrase.trim() || row.context.trim()))} />
    <p className={styles.muted}>새 분류에서는 민감도·주의 주제·순화 말투 설정이 등급을 변경하지 않습니다. 허용 맥락은 의미 해석에 반영합니다.</p>
    <input type="hidden" name="sensitivity" value={initial.sensitivity} />
    <input type="hidden" name="cautionAction" value={initial.cautionAction} />
    <input type="hidden" name="riskAction" value={initial.riskAction} />
    <input type="hidden" name="harmfulTextHidden" value="on" />
    <div className={styles.columns}>
      <div className={styles.editor}>
        <section className={styles.section} aria-labelledby="watch-heading">
          <h2 id="watch-heading">주의해서 볼 내용</h2>
          <p>주의해서 검토할 항목을 선택해 주세요.</p>
          <p className={styles.muted}>의미 분석 기준: 의견과 공격을 분리 · 스팸은 별도 표시</p>
          <div className={styles.chips} aria-label="주의할 내용 선택">
            {[...POLICY_PRESETS, ...topics.filter(item => !POLICY_PRESETS.includes(item))].map(topic => <button key={topic} type="button" aria-pressed={topics.includes(topic)} className={styles.chip} onClick={() => toggle(topic)}>
              {topic}{topics.includes(topic) ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            </button>)}
          </div>
          <p className={styles.hint}>처음에는 3개가 선택돼요 · 눌러서 변경할 수 있어요</p>
          <label className={styles.customLabel} htmlFor="custom-topic">직접 추가</label>
          <div className={styles.customInput}>
            <input id="custom-topic" maxLength={40} placeholder="예: 다른 채널과 비교하며 비난하기" value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addCustom(); } }} />
            <button type="button" className={styles.secondary} onClick={addCustom}>추가</button>
          </div>
        </section>
        <section className={styles.section} aria-labelledby="allow-heading">
          <h2 id="allow-heading">허용할 표현과 맥락</h2>
          <p>우리 채널에서만 통하는 별명이나 농담을 알려주세요.</p>
          <p className={styles.muted}>일반적인 칭찬과 관용 표현은 기본으로 이해해요.</p>
          <div className={styles.contexts}>
            {contexts.map((row,index) => <div className={styles.contextRow} key={index}>
              <label>표현<input aria-label={`허용할 표현 ${index + 1}`} placeholder="예: 감자대장" maxLength={40} pattern="[^|\r\n]+" required={Boolean(row.context.trim())} value={row.phrase} onChange={event => updateContext(index,"phrase",event.target.value)} /></label>
              <label>허용하는 상황<input aria-label={`허용하는 상황 ${index + 1}`} placeholder="예: 팬들이 부르는 애칭" maxLength={200} value={row.context} onChange={event => updateContext(index,"context",event.target.value)} /></label>
              {(contexts.length > 1 || row.phrase || row.context) && <button type="button" className={styles.remove} aria-label={`표현 ${index + 1} 삭제`} onClick={() => { change(); setContexts(contexts.length === 1 ? [{phrase:"",context:""}] : contexts.filter((_,i) => i !== index)); }}><X aria-hidden="true" /></button>}
            </div>)}
          </div>
          <button type="button" className={styles.textButton} disabled={contexts.length >= 50} onClick={() => { change(); setContexts([...contexts,{phrase:"",context:""}]); }}><Plus aria-hidden="true" />표현 추가</button>
        </section>
      </div>
      <aside className={styles.preview} aria-labelledby="preview-heading">
        <h2 id="preview-heading">적용 미리보기</h2>
        <div className={styles.shifty}><span className={styles.owl}><Image className={styles.lightOwl} src="/brand/shifty-owl-profile.png" alt="시프티" width={72} height={84} /><Image className={styles.darkOwl} src="/brand/shifty-policy-dark.png" alt="시프티" width={72} height={84} /></span><p>예시 댓글로 기준이 어떻게 적용되는지<br />미리 확인해 보세요.</p></div>
        <div className={styles.previewCard}>
          <h3>{previewOpen ? "직접 입력 · 현재 기준으로 확인" : "예시 댓글 · 예상 결과"}</h3>
          {!previewOpen ? <>
            <CommentPreview comment="오늘 편집 미쳤다 ㅋㅋ" author="@example" level="safe" reason="편집에 대한 칭찬으로 판단해요." note="기본 판단 · 별도 규칙 없이 이해해요." />
          </> : <div className={styles.tryPreview}>
            <label htmlFor="preview-comment">확인할 댓글</label>
            <textarea id="preview-comment" maxLength={2000} rows={3} placeholder="확인할 댓글을 직접 입력해 주세요." value={comment} onChange={event => { change(); setComment(event.target.value); }} />
            <small>입력한 댓글은 저장하지 않고 분석에만 사용해요.</small>
            <button type="button" className={styles.secondary} disabled={pending || !comment.trim()} onClick={checkPreview}>{pending ? "분석 중…" : "현재 기준으로 확인"}</button>
            <div className={styles.previewResult} aria-live="polite">
              {result && (result.error ? <p className={styles.error} role="alert">{result.error}</p> : <>
                <h4>입력한 댓글 · 분석 결과</h4>
                <CommentPreview comment={comment.trim()} author="직접 입력한 댓글" level={result.level}
                  reason={result.fixture ? "TEST FIXTURE · 실제 AI 분석이 아닌 테스트 결과" : result.reason ?? "현재 입력한 기준으로 분석한 결과예요."}
                  note="현재 기준 적용 · 영상·답글 맥락에 따라 결과가 달라질 수 있어요." />
              </>)}
            </div>
          </div>}
          <button type="button" className={styles.previewLink} onClick={() => {
            if (previewOpen && result && !result.error) {
              change(); setComment(""); form.current?.querySelector<HTMLTextAreaElement>("#preview-comment")?.focus();
            } else { change(); setPreviewOpen(!previewOpen); }
          }}><ArrowClockwise aria-hidden="true" />{previewOpen && (!result || result.error) ? "기본 예시 보기" : "다른 댓글로 확인"}</button>
        </div>
      </aside>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <footer className={styles.footer}>
      <p><ShieldCheck aria-hidden="true" />원문은 보호하고, 숨김·삭제는 직접 확인해요.</p>
      <div><small>저장 후 새로 분석하는 댓글부터 적용돼요.</small><SaveButton /></div>
    </footer>
  </form>;
}
