# 운영 자동화 검증

이 문서는 CrowdSift MVP의 채널 댓글 자동화 계약과 운영 점검 방법을 정리한다.
fixture 검증은 외부 API를 호출하지 않는다. 실제 YouTube·OpenAI 연결 여부는 아래
production 점검을 별도로 수행해야 한다.

## 자동화 계약

| 영역 | 계약 | 실패 처리 |
| --- | --- | --- |
| worker wake-up | Supabase Cron이 5분마다 인증된 Vercel 내부 endpoint를 호출 | 한 lane이 실패해도 YouTube 수집과 OpenAI 분류를 각각 실행하고, 하나라도 실패하면 HTTP 500으로 모니터링 신호를 남김 |
| 신규 댓글 | 완료된 incremental sync는 다음 실행을 정확히 60분 뒤 예약 | 일반 실패 5분, provider 오류 15분 뒤 재시도 |
| YouTube rate limit | `rateLimitExceeded`, `userRateLimitExceeded`, HTTP 429를 일일 quota와 분리 | 15분 뒤 재시도 |
| YouTube 일일 quota | `quotaExceeded`, `dailyLimitExceeded`를 안정 코드 `quota_exceeded`로 기록 | 미국 `America/Los_Angeles` 기준 다음 자정 이후 재시도 |
| OAuth access token | API 요청 전에 만료 임박 token을 refresh하고 새 token 저장까지 완료 | refresh 저장 실패 시 YouTube 요청을 시작하지 않음 |
| OAuth refresh token | `invalid_grant`, `invalid_rapt`, 401, 명시적 인증 실패를 재연결 필요로 분류 | CAS로 기존 token을 지우고 connection을 `revoked`로 전환. 새로 연결된 token은 오래된 worker가 지울 수 없음 |
| OpenAI 일시 오류 | 429, 5xx, 연결·timeout 오류를 항목별로 기록 | 5분 worker 주기에 최대 3회 자동 재시도 |
| OpenAI 영구 오류 | 잘못된 API key, 사용량 부족, schema/코드 오류를 별도 안정 코드로 기록 | 자동 반복을 중단하고 설정 수정 후 수동 재시도 |
| worker 중단 | 15분 넘게 `running`인 분류 항목을 stale로 판단 | 최대 3회 범위 안에서 다시 claim; 마지막 시도도 중단되면 terminal failure |

자동 수집은 읽기·저장·분류까지만 수행한다. 숨김·거절·삭제 같은 YouTube 조치는
자동 재시도하지 않으며 사용자의 명시적 확인이 계속 필요하다.

## 자동 검증

저장소 루트에서 다음을 실행한다.

```bash
npm test -- --run \
  src/features/ingestion/operation-automation-config.test.ts \
  src/app/api/internal/channel-comment-sync/process/route.test.ts \
  src/features/ingestion/import-errors.test.ts \
  src/features/classification/classification-errors.test.ts \
  src/features/youtube/oauth-errors.test.ts

npm run db:test
npm run lint
npm run build
```

DB 테스트는 다음을 확인한다.

- incremental 완료 후 다음 실행이 59~61분 사이에 예약되는지
- 실패 run이 lease를 해제하고 오류 종류에 맞는 재시도 시각을 갖는지
- 같은 claim token으로 실패 처리를 반복해도 상태가 중복 변경되지 않는지
- OpenAI 일시 오류가 attempt 2·3으로 재claim되는지
- 세 번째 시도 이후와 영구 오류가 자동 재claim되지 않는지
- 오래된 `running` 분류 항목이 안전하게 회수되는지

## 로컬 worker 확인

개발 서버와 로컬 Supabase를 실행한 상태에서 브라우저 세션으로 확인한다.

```js
await fetch("/api/channel-comment-sync/status").then((response) => response.json())
await fetch("/api/channel-comment-sync/process", { method: "POST" }).then((response) => response.json())
```

cron endpoint는 `.env.local`의 `CRON_SECRET`과 같은 bearer 값으로만 호출한다.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/internal/channel-comment-sync/process
```

응답에는 내부 ID나 token이 포함되지 않는다. `syncProcessed`와
`analysisProcessed`만 공개하며, 일부 실패 시에도 성공한 lane의 결과는 `true`로
남는다.

## production 배포 후 확인

배포 설정만 존재하는 것은 실제 cron 실행의 증거가 아니다. 배포 후 다음 순서로
실제 연결을 확인한다.

1. Vercel production 환경에 `CRON_SECRET`, Google OAuth, YouTube API,
   OpenAI, Supabase server 환경 변수가 모두 설정됐는지 확인한다.
2. Supabase Vault에 같은 `CRON_SECRET`과 production 앱 URL을 저장하고,
   `crowdsift-worker-five-minutes` job이 `*/5 * * * *`로 활성인지 확인한다.
3. fixture provider가 production에서 비활성인지 확인한다.
4. 본인 채널을 연결하고 시작 날짜를 오늘로 설정한다.
5. 첫 backfill이 끝난 뒤 `channel_comment_sync_settings`의
   `last_successful_sync_at`, `next_sync_at`, `last_error_code`를 확인한다.
6. 테스트 댓글 하나를 작성하고 다음 60분 실행 뒤 원문, 별도 분석 결과,
   Comment Inbox 노출을 확인한다.
7. Supabase Cron history와 Vercel runtime log에서 5분 wake-up과 bounded 처리
   응답을 함께 확인한다.
8. 실제 quota와 OpenAI 사용량이 저장된 run·stage 기록과 맞는지 확인한다.

Hobby production에서는 `vercel.json`에 5분 cron을 넣지 않는다. Vercel Hobby는
cron을 하루 한 번만 허용하므로 배포가 거절된다. Supabase SQL Editor에서 Vault
secret을 만든 뒤 다음 job을 등록한다. 실제 값은 저장소나 SQL history에 직접
적지 말고 Vault UI에서 `crowdsift_app_url`, `crowdsift_cron_secret` 이름으로
등록한다.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'crowdsift-worker-five-minutes',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'crowdsift_app_url'
    ) || '/api/internal/channel-comment-sync/process',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'crowdsift_cron_secret'
      )
    ),
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);
```

운영 상태 확인용 SQL은 token column을 조회하지 않는다.

```sql
select
  enabled,
  sync_interval_minutes,
  backfill_status,
  last_successful_sync_at,
  next_sync_at,
  last_error_code
from public.channel_comment_sync_settings
order by updated_at desc;

select
  kind,
  status,
  quota_units_used,
  error_code,
  started_at,
  finished_at
from public.channel_comment_sync_runs
order by created_at desc
limit 20;

select
  status,
  attempt_count,
  error_code,
  started_at,
  finished_at
from public.analysis_job_items
order by created_at desc
limit 50;

select status, updated_at
from public.youtube_connections
order by updated_at desc;
```

## 운영 판정

다음 조건을 모두 충족해야 4번 운영 자동화 검증을 production에서 완료한 것으로
판정한다.

- Supabase Cron history와 Vercel runtime log가 모두 존재한다.
- 신규 댓글이 60분 계약 안에서 한 번만 저장되고 한 번만 분류된다.
- 같은 원문을 다시 관찰해도 OpenAI 비용이 다시 발생하지 않는다.
- 일시 오류는 정해진 횟수·시각에 재시도되고 영구 오류는 반복되지 않는다.
- OAuth 영구 만료 후 token이 브라우저나 로그에 노출되지 않고 재연결 UI가 보인다.
- moderation action은 자동 실행되지 않는다.
