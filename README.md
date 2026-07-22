# CommentHawk

CommentHawk는 YouTube 크리에이터가 댓글 속 질문과 유용한 피드백을 발견하고, 악성 댓글은 안전하게 검토하도록 돕는 AI 댓글 관리 도구입니다.

현재 저장소는 첫 번째 Next.js 화면과 CommentHawk 개발 지도를 구성한 초기 단계입니다. YouTube OAuth, 댓글 수집, Supabase, AI 분류는 아직 연결되어 있지 않습니다.

## 시작하기

필요한 환경은 Node.js 20 이상과 npm입니다.

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
npm run lint
npm run build
npm run start
```

## CommentHawk 개발 지도

홈 화면 아래의 개발 지도는 Frontend, Backend, AI, Security 네 파트의 큰 구현 흐름을 한눈에 보고 계획을 직접 추가·수정·삭제하는 로컬 계획 도구입니다.

- 입력한 계획은 현재 브라우저의 `localStorage`에만 저장됩니다.
- 다른 브라우저나 기기와 자동으로 공유되지 않습니다.
- 차트의 노드는 구현 계획이며, 완료 상태나 실제 구현 여부를 뜻하지 않습니다.
- 전체 화면으로 살펴보거나 Mermaid 원문을 복사할 수 있습니다.

## 첫 번째 구현 목표

```text
YouTube 연결 → 영상 선택 → 댓글 20~50개 수집 → AI 분류 → DB 저장 → Inbox 표시
```

## 프로젝트 문서

- [간략한 제품 컨텍스트](docs/product-context.md)
- [원본 프로젝트 컨텍스트 PDF](docs/CommentHawk_Project_Context_v0.1.pdf)
- [초기 설계 기록](docs/superpowers/specs/2026-07-22-commenthawk-bootstrap-design.md)
- [초기 구현 계획](docs/superpowers/plans/2026-07-22-commenthawk-bootstrap.md)
