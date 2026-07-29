# 실제로 사용할 GitHub 저장소

## 문서 목적

CrowdSift에 필요한 공식 라이브러리 후보와 도입 시점을 정리한다. 저장소 전체나 완성형 대시보드 템플릿을 복제하지 않고, 승인된 기능에 필요한 패키지만 설치한다.

현재 `package.json`에는 Next.js, React, Tailwind CSS와 Vitest 중심의 최소 의존성만 있다. 아래 항목은 설치 완료 목록이 아니라 단계별 후보 목록이다.

| 용도 | 공식 프로젝트 | 도입 시점 | 주의사항 |
|---|---|---|---|
| 기본 UI | [shadcn/ui](https://github.com/shadcn-ui/ui) | 실제 UI 컴포넌트가 필요할 때 | 필요한 컴포넌트만 가져오고 현재 스타일을 보존한다. |
| 애니메이션 | [Motion](https://github.com/motiondivision/motion) | 상태 변화가 정적 CSS로 부족할 때 | 장식용 움직임과 과도한 의존성을 피한다. |
| 댓글 테이블 | [TanStack Table](https://github.com/TanStack/table) | 실제 Comment Inbox의 정렬·필터 요구가 확정될 때 | 단순 목록 단계에서는 도입하지 않는다. |
| 통계 차트 | [Recharts](https://github.com/recharts/recharts) | 실제 집계 데이터가 생긴 뒤 | 첫 수직 슬라이스보다 먼저 추가하지 않는다. |
| 브라우저 테스트 | [Playwright](https://github.com/microsoft/playwright) | 실제 OAuth·가져오기 흐름 E2E 검증 시 | 기존 Vitest 테스트와 역할을 구분한다. |
| YouTube 연결 | [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client) | YouTube OAuth와 댓글 가져오기 구현 시 | 공식 OAuth 흐름과 최소 권한을 사용한다. |
| DB·인증·저장 | [Supabase](https://github.com/supabase/supabase) | 실제 데이터 저장과 사용자 격리 구현 시 | 마이그레이션과 RLS 정책을 함께 관리한다. |
| AI 분석 | [OpenAI Node SDK](https://github.com/openai/openai-node) | 실제 댓글 분류 구현 시 | 서버에서만 호출하고 구조화 출력을 검증한다. |

## 도입 원칙

1. 구현할 기능이 확정된 뒤 패키지를 추가한다.
2. 공식 문서와 현재 프로젝트 버전의 호환성을 확인한다.
3. 전체 예제 앱이나 대시보드 템플릿을 합치지 않는다.
4. 패키지 설치 후 `package.json`과 `package-lock.json`을 함께 검토한다.
5. 새 의존성이 없어도 구현 가능한 작은 단계라면 기존 스택을 우선한다.

## 개인화 기능과 라이브러리의 관계

크리에이터별 정책은 Supabase의 구조화된 데이터로 저장한다. 과거 피드백 RAG는 같은 크리에이터의 승인된 사례만 검색하며, 처음부터 별도의 벡터 데이터베이스를 추가할 필요는 없다. 데이터량과 검색 성능을 측정한 뒤 Supabase의 벡터 기능이나 다른 저장 방식을 결정한다.

Fine-tuning은 현재 설치할 라이브러리가 아니다. 먼저 공통 OpenAI 모델, 크리에이터 정책, 규칙 엔진, 피드백 저장과 평가 세트를 구현한 뒤 별도 기술 결정으로 다룬다.

다음 단계는 [4. 첫 번째 Codex Ask 모드 프롬프트](./04-첫-번째-codex-ask-모드-프롬프트.md)다.
