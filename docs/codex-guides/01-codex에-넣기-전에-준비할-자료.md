# Codex에 넣기 전에 준비할 자료

## 문서 목적

Codex가 오래된 PDF 지침이나 시각 참고자료만 보고 제품 방향을 잘못 추측하지 않도록, 작업 시작 전에 기준 문서와 필요한 자료를 정리한다.

## 가장 먼저 확인할 기준 문서

내용이 충돌하면 다음 순서를 따른다.

1. `docs/product-context.md`
2. `docs/CrowdSift_Project_Context_v1.0.pdf`
3. 저장소 루트의 `AGENTS.md`
4. `docs/codex-guides/`의 단계별 가이드

첫 번째 개발 목표는 다음 실제 흐름이다.

```text
YouTube 연결
→ 영상 하나 선택
→ 댓글 20~50개 가져오기
→ AI 분류
→ 원문과 분석 결과를 DB에 분리 저장
→ Comment Inbox에서 실제 데이터 확인
```

## 시각 참고자료 준비

시각 레퍼런스 URL은 [BrandBastion](https://www.brandbastion.com/)이다. URL만 전달하기보다 아래 주요 화면을 직접 캡처해 저장하고, 구현 시에는 첨부된 스크린샷을 1차 시각 기준으로 사용한다.

```text
references/
└── brandbastion/
    ├── 01-hero-desktop.png
    ├── 02-problem-section.png
    ├── 03-solutions-overview.png
    ├── 04-comment-moderation.png
    ├── 05-brand-benefits.png
    ├── 06-ai-processing.png
    ├── 07-integrations.png
    ├── 08-customer-results.png
    ├── 09-dashboard-hero-detail.png
    └── README.md
```

최소 캡처 범위는 다음과 같다.

1. 상단 내비게이션과 Hero
2. 제품 화면이 중심이 되는 구간
3. 문제를 설명하는 카드 섹션
4. 솔루션과 기능 섹션
5. AI가 댓글을 처리하는 표현 방식
6. AI 분석과 수치 표현
7. 외부 플랫폼 연동 표현
8. 고객 사례 카드와 가로 탐색 방식
9. Hero에 사용하는 브라우저형 대시보드와 플로팅 카드의 세부 구성

현재 첨부 자료는 데스크톱 화면만 포함한다. 모바일 구현은 이 레퍼런스의 시각 언어를 유지하되 CrowdSift의 실제 콘텐츠와 접근성 기준에 맞춰 별도로 설계하고 검증한다.

스크린샷은 분위기, 정보 밀도, 여백과 타이포그래피를 판단하는 1차 자료로 사용한다. BrandBastion의 자산, 로고, 문구, 고객 주장, 소스 코드나 정확한 화면 구조를 복사하지 않는다.

## 외부 연동 준비

실제 연동 단계 전까지 다음 값의 발급 여부만 확인한다. 비밀값은 문서나 Git에 기록하지 않는다.

- Supabase 프로젝트 URL과 서버용 키
- Google OAuth 클라이언트 ID와 클라이언트 보안 비밀
- YouTube Data API 사용 설정
- OpenAI API 키
- 로컬·배포 환경의 OAuth 콜백 URL

저장소에는 변수 이름만 있는 `.env.example`을 유지하고 실제 값이 들어간 `.env` 파일은 커밋하지 않는다.

## 작업 시작 전 체크리스트

- [ ] Codex가 `docs/product-context.md`와 `AGENTS.md`를 읽었다.
- [ ] 현재 `package.json`과 잠금 파일을 확인했다.
- [ ] 시각 참고자료와 복제 금지 범위를 구분했다.
- [ ] 연결되지 않은 기능을 실제 기능처럼 표시하지 않기로 했다.
- [ ] 원본 댓글과 파생 데이터를 분리할 계획이 있다.
- [ ] 유해 댓글 원문을 기본적으로 가릴 계획이 있다.
- [ ] 비가역적 조치 전에 사용자 확인을 받는다.

준비가 끝나면 [2. 먼저 설치하면 좋은 Codex용 기능](./02-먼저-설치하면-좋은-codex용-기능.md)을 확인한다.
