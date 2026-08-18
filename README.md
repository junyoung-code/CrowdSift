# CrowdSift

CrowdSift는 YouTube 크리에이터가 댓글 속 질문과 유용한 피드백을 발견하고, 악성 댓글은 안전하게 검토하도록 돕는 AI 댓글 관리 도구입니다.

현재 저장소는 로그인, YouTube OAuth, 날짜 기준 채널 댓글 수집, Supabase
저장, OpenAI Classification V1과 Comment Inbox까지 첫 번째 실제 흐름을
검증할 수 있는 단계입니다.

## 시작하기

필요한 환경은 Node.js 22 이상과 npm입니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## 명령어

```bash
npm run dev
npm test
npm run test:e2e
npm run db:test
npm run lint
npm run build
npm run start
```

## 브랜치 이름 규칙

새 기능 브랜치는 다음 형식을 사용합니다.

```text
feature/<name>/<work>
```

- 작업자 이름과 작업 이름은 영문 소문자로 작성합니다.
- 작업 이름의 단어 구분에는 하이픈(`-`)을 사용합니다.
- `codex/`, `feat/`처럼 도구나 축약어를 앞에 붙이지 않습니다.
- 이번 작업 branch: `feature/junyoung/channel-comment-date-sync`

## 기본 사용자 흐름

```text
YouTube 연결 → 시작 날짜 선택 → 채널 댓글 수집 → 신규 댓글 AI 분류
→ 원문·분석 결과 분리 저장 → Comment Inbox
```

선택 날짜는 Asia/Seoul의 해당 날짜 00:00:00부터 포함합니다. 연결한 채널의
최신 댓글부터 그 경계까지 가져오며, 이후에는 새 댓글을 60분 간격으로 확인합니다.
`/app/videos`의 영상 하나·20/30/50개 가져오기는 분류 품질을 확인하기 위한
보조 수동 테스트 경로입니다.

시작 날짜가 오래될수록 YouTube 페이지와 quota 사용량이 늘고, 신규 댓글 수에
비례해 OpenAI 분석 비용도 증가합니다. 기존 댓글을 다시 관찰한 경우 원문 분석을
재실행하지 않습니다.

자동화 범위는 게시된 댓글 읽기, 저장, 분류와 권장 조치 생성까지입니다. 실제
YouTube 숨김·삭제·신고 같은 moderation action은 사용자가 원문과 권장안을 확인한
뒤 명시적으로 실행해야 합니다.

## 채널 동기화 worker 운영

동기화는 한 번에 작은 batch만 처리합니다. 로그인한 로컬 브라우저의 개발자
콘솔에서는 다음처럼 현재 상태를 확인하거나 한 batch를 실행할 수 있습니다.

```js
await fetch("/api/channel-comment-sync/status").then((response) => response.json())
await fetch("/api/channel-comment-sync/process", { method: "POST" }).then((response) => response.json())
```

production에서는 충분히 긴 임의 값의 `CRON_SECRET`을 서버 환경 변수로 설정해야
합니다. 현재 Hobby 배포는 Vercel cron의 하루 1회 제한을 피하기 위해 Supabase
Cron이 `/api/internal/channel-comment-sync/process`를 5분마다 깨웁니다. 앱 URL과
secret은 Supabase Vault에 암호화해 저장합니다. 이 5분은 worker의 wake-up
간격이며, 정상 상태에서 YouTube의 새 댓글을 가져오는 DB 계약은 60분 간격입니다.
내부 endpoint는 `Authorization: Bearer <CRON_SECRET>` 요청만 받습니다.

로컬에서 cron 경로를 직접 확인할 때는 `.env.local`에 설정한 값과 같은 secret을
보냅니다.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/internal/channel-comment-sync/process
```

fixture provider는 로컬·E2E 전용이며 화면에 `TEST FIXTURE`로 표시되고 외부
YouTube/OpenAI API를 호출하지 않습니다. production 또는 실제 연결 검증에서는
fixture를 활성화하지 않습니다.

## 프로젝트 문서

- [개발 로드맵](docs/development-roadmap.md)
- [운영 자동화 검증](docs/operation-automation-verification.md)
- [간략한 제품 컨텍스트](docs/product-context.md)
- [원본 프로젝트 컨텍스트 PDF](docs/CrowdSift_Project_Context_v1.0.pdf)
- [초기 설계 기록](docs/superpowers/specs/2026-07-22-crowdsift-bootstrap-design.md)
- [초기 구현 계획](docs/superpowers/plans/2026-07-22-crowdsift-bootstrap.md)
