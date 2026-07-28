# CommentHawk 대시보드 Design QA

이전 랜딩 페이지 QA 기록은 `design-qa-landing.md`에 보존했다.

## 비교 대상

- source visual truth: `artifacts/dashboard-task12-reference.png`
- implementation screenshot: `artifacts/dashboard-task12-viewport-1440x900.png`
- full-view comparison: `artifacts/dashboard-task12-comparison.png`
- focused comparison: `artifacts/dashboard-task12-focused-comparison.png`
- route: `http://localhost:3000/app`
- viewport: CSS `1440 × 900`, device pixel ratio `1`
- source pixels: `1430 × 1076`
- implementation pixels: `1440 × 900`
- density normalization: 두 이미지를 각각 700px 너비로 비율 유지 축소해 나란히 비교했다. 실제 구현 판단에는 원본 1440 × 900 브라우저 캡처도 함께 사용했다.
- state: 로그인 완료, 로컬 Supabase에 저장된 QA 전용 채널·영상·20개 댓글·20개 분석 결과가 있는 상태. 모든 QA 데이터는 화면에서 `[로컬 QA]` 또는 `[로컬 QA 데이터]`로 명시했다.

## Findings

- P0/P1/P2 문제 없음.
- BrandBastion 레퍼런스의 밝은 청색 캔버스, 흰색 지표 카드, 상태별 색상, 채널 영역, AI Insight 카드의 시각적 계층을 유지하면서 CommentHawk의 실제 정보 구조로 전환했다.
- 레퍼런스의 겹쳐진 홍보용 카드 구성 대신 운영 화면에 필요한 고정 사이드바와 읽기 쉬운 그리드를 사용한 것은 의도된 제품 차이다. 위쪽 첫 화면에서 핵심 지표, 채널, AI 요약, 최근 작업 상태가 모두 확인된다.

## 필수 Fidelity 점검

- Fonts and typography: 한글과 영문 모두 동일한 산세리프 계열로 일관되며, 제목·지표·보조 문구의 크기와 굵기 차이가 명확하다. 잘림이나 겹침이 없다.
- Spacing and layout rhythm: 4열 지표, 2열 채널/AI 카드, 2열 작업 카드가 같은 간격·라운드·테두리 체계를 사용한다. 1440px 첫 화면에서 주요 영역이 과밀하지 않다.
- Colors and visual tokens: 레퍼런스의 연한 청색 바탕과 파란 강조색을 유지하고, 안전은 녹색, 주의는 황색, 위험은 적색으로 의미를 분리했다. 텍스트 대비는 충분하다.
- Image quality and asset fidelity: 이 화면의 대상은 실제 제품 대시보드이므로 홍보용 합성 이미지를 재사용하지 않았다. 아이콘은 동일한 선형 아이콘 계열을 사용하며 흐릿한 래스터 대체물이 없다.
- Copy and content: `안전 / 주의 / 위험`, `가져온 댓글`, `분석 완료`, `먼저 확인할 댓글`처럼 사용자가 바로 이해할 수 있는 한국어를 사용한다. 실제 연결 데이터만 표시한다는 안내와 순화 데이터 사용 원칙을 함께 보여준다.
- Accessibility: `main`, `banner`, `navigation`, `region`, 제목 계층과 접근 가능한 링크 이름이 브라우저 DOM에서 확인됐다. 의미를 색상만으로 전달하지 않고 텍스트 라벨과 숫자를 병기했다.

## Full-view 비교 증거

- `artifacts/dashboard-task12-comparison.png`
- 전체 구성, 정보 밀도, 밝은 표면, 카드 계층, AI Insight 강조가 레퍼런스의 디자인 의도와 일치한다.

## Focused region 비교 증거

- `artifacts/dashboard-task12-focused-comparison.png`
- 상단 지표 카드와 채널/AI Insight 영역을 확대 비교했다. 숫자 위계, 상태 아이콘, 카드 라운드와 내부 여백, AI 카드의 보라색 강조가 일관된다.

## 주요 상호작용 및 런타임 검증

- 이메일 매직 링크 요청 → 인증 콜백 → `/app` 로그인 완료
- 대시보드의 `Inbox 열기` → `/app/inbox` 이동 확인
- 저장된 댓글 20개, 분석 20개, 주의 5개, 위험 3개 및 우선 댓글 5개 표시 확인
- 브라우저 콘솔 warning/error: 없음
- 모바일 화면은 사용자의 승인된 범위에 따라 후속 단계로 남겨 두고 이번 QA 대상에서 제외했다.

## Comparison history

- Pass 1: 레퍼런스와 1440 × 900 구현을 전체 화면 및 집중 영역으로 비교했다. 조치가 필요한 P0/P1/P2 시각 차이가 없어서 추가 시각 수정 없이 통과했다.

## Follow-up Polish

- P3: 실제 채널 썸네일이 제공되는 경우 채널 카드에 작은 원형 썸네일을 추가하면 시각적 인지가 더 빨라질 수 있다. 현재는 데이터가 없는 경우 임의 이미지를 보여 주지 않는 원칙을 우선했다.

## Implementation Checklist

- [x] 실제 저장 지표 표시
- [x] 안전 / 주의 / 위험 분포 표시
- [x] 연결 채널과 최근 영상 표시
- [x] 집계·순화 데이터만 사용하는 AI 요약 표시
- [x] Comment Inbox 이동 확인
- [x] 1440 × 900 레퍼런스 비교
- [x] 브라우저 콘솔 오류 확인

final result: passed
