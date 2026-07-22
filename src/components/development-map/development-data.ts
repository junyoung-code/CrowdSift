export const DEVELOPMENT_PART_IDS = [
  "frontend",
  "backend",
  "ai",
  "security",
] as const;

export type DevelopmentPartId = (typeof DEVELOPMENT_PART_IDS)[number];

export type PlanItem = {
  id: string;
  title: string;
};

export type PlansByPart = Record<DevelopmentPartId, PlanItem[]>;

export type DevelopmentPart = {
  id: DevelopmentPartId;
  number: string;
  label: string;
  koreanLabel: string;
  description: string;
  className: string;
};

export const DEVELOPMENT_PARTS: DevelopmentPart[] = [
  {
    id: "frontend",
    number: "1",
    label: "Frontend",
    koreanLabel: "화면과 사용자 경험",
    description: "사용자가 보고 조작하는 웹 화면을 만듭니다.",
    className: "frontend",
  },
  {
    id: "backend",
    number: "2",
    label: "Backend",
    koreanLabel: "연결과 데이터",
    description: "인증, YouTube API, 데이터 저장 흐름을 만듭니다.",
    className: "backend",
  },
  {
    id: "ai",
    number: "3",
    label: "AI",
    koreanLabel: "분류와 인사이트",
    description: "댓글을 이해하고 안전하게 보여주는 AI를 만듭니다.",
    className: "ai",
  },
  {
    id: "security",
    number: "4",
    label: "Security",
    koreanLabel: "권한과 보호",
    description: "사용자 데이터와 중요한 조치를 보호합니다.",
    className: "security",
  },
];

export const DEFAULT_PLANS: PlansByPart = {
  frontend: [
    { id: "frontend-foundation", title: "Front-end 공통 기반과 디자인 시스템" },
    { id: "frontend-public", title: "서비스 소개와 사용자 웹 페이지" },
    { id: "frontend-dashboard", title: "대시보드와 Comment Inbox" },
    { id: "frontend-states", title: "로딩·빈 상태·오류·연결 해제 화면" },
    { id: "frontend-accessibility", title: "반응형·키보드·접근성 검증" },
  ],
  backend: [
    { id: "backend-schema", title: "Supabase 스키마와 원본 데이터 분리" },
    { id: "backend-auth", title: "앱 인증과 Google OAuth 경계" },
    { id: "backend-youtube", title: "YouTube 영상과 댓글 20–50개 수집" },
    { id: "backend-import", title: "페이지네이션·중복 방지·재시도" },
    { id: "backend-logs", title: "동기화 상태와 감사 로그" },
  ],
  ai: [
    { id: "ai-contract", title: "댓글 분류 카테고리와 신뢰도 계약" },
    { id: "ai-structured", title: "구조화 출력·스키마 검증·재시도" },
    { id: "ai-sanitized", title: "의미를 보존한 정제 피드백" },
    { id: "ai-insights", title: "Q&A Radar와 Signal Digest" },
    { id: "ai-quality", title: "한국어 평가셋·품질·비용 관리" },
  ],
  security: [
    { id: "security-secrets", title: "Secret과 refresh token 보호" },
    { id: "security-access", title: "RLS·테넌트 격리·최소 권한" },
    { id: "security-moderation", title: "증거 저장 후 사용자 승인 조치" },
    { id: "security-retention", title: "보관·내보내기·삭제 정책" },
    { id: "security-recovery", title: "실패 복구·속도 제한·안전한 로그" },
  ],
};

export function cloneDefaultPlans(): PlansByPart {
  return Object.fromEntries(
    DEVELOPMENT_PART_IDS.map((partId) => [
      partId,
      DEFAULT_PLANS[partId].map((item) => ({ ...item })),
    ]),
  ) as PlansByPart;
}
