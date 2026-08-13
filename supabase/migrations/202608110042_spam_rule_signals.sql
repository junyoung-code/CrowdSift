-- 스팸을 코드 규칙이 잡았을 때 그 사실을 기록에 남긴다.
--
-- 등급 기준은 크리에이터를 향한 공격만 다룬다. 스팸은 아무도 공격하지 않으므로
-- 기준대로 읽으면 안전이고, 실제로 그렇게 나왔다. 기획서가 이 자리를 규칙 엔진으로
-- 정해 두었으므로 코드가 최소 등급을 올린다.
--
-- 이유 코드에 넣지 않는 이유가 있다. 그쪽은 Terra 가 댓글의 내용을 적는 낱말들이라,
-- 코드가 만든 신호를 섞으면 누가 무엇을 보고 말한 것인지 알 수 없게 된다.

alter table public.classification_verdicts
  add column raised_by_spam boolean not null default false,
  add column spam_signals jsonb not null default '[]';
