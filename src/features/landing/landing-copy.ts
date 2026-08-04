export const landingCopy = {
  hero: {
    eyebrow: "CREATOR COMMENT OPERATIONS",
    title: "댓글의 소음은 줄이고, 중요한 목소리는 더 선명하게.",
    description:
      "CrowdSift는 YouTube 댓글을 안전·주의·위험으로 정리하고, 크리에이터마다 다른 기준과 과거 판단을 반영해 지금 검토할 댓글부터 보여줍니다.",
  },
  problems: [
    {
      number: "01",
      title: "유해한 표현에 반복 노출",
      description:
        "원문을 직접 훑는 시간을 줄이고, 꼭 필요한 순간에만 경고 후 확인합니다.",
    },
    {
      number: "02",
      title: "유용한 피드백의 손실",
      description:
        "거친 표현 안에 남아 있는 질문과 개선 신호를 분리해 놓치지 않습니다.",
    },
    {
      number: "03",
      title: "사람마다 달라지는 판단",
      description:
        "정책·규칙·과거 수정을 함께 사용해 판단 근거를 일관되게 남깁니다.",
    },
  ],
  solutions: [
    {
      eyebrow: "PRIORITY",
      title: "검토할 댓글부터",
      description:
        "모든 원문은 그대로 보존하면서 주의와 위험 댓글을 Inbox 위로 올립니다.",
    },
    {
      eyebrow: "PERSONALIZATION",
      title: "나의 운영 기준으로",
      description:
        "금지어뿐 아니라 허용어, 문맥 예외, 과거에 수정한 판단을 함께 봅니다.",
    },
    {
      eyebrow: "HUMAN CONTROL",
      title: "조치는 내가 결정",
      description:
        "AI는 이유와 함께 추천하고, 실제 moderation은 확인을 거친 뒤 실행합니다.",
    },
  ],
  processSteps: [
    {
      step: "01",
      title: "1차 분석",
      description: "공통 규칙과 AI가 모든 댓글을 빠르게 분류합니다.",
    },
    {
      step: "02",
      title: "크리에이터 문맥",
      description:
        "채널 정책과 비슷한 과거 판단 사례를 최대 5개 찾아옵니다.",
    },
    {
      step: "03",
      title: "2차 분석",
      description:
        "주의·위험·낮은 신뢰도 댓글만 문맥과 함께 다시 분석합니다.",
    },
    {
      step: "04",
      title: "사용자 확인",
      description:
        "근거와 원문을 확인한 크리에이터가 최종 조치를 결정합니다.",
    },
  ],
} as const;

export const previewMetrics = [
  { label: "가져온 댓글", value: "248", tone: "blue" },
  { label: "분석 완료", value: "241", tone: "violet" },
  { label: "주의", value: "17", tone: "caution" },
  { label: "위험", value: "6", tone: "risk" },
] as const;

export const heroPreviewStates = [
  {
    id: "imported",
    tabLabel: "댓글 수집",
    kicker: "SOURCE PRESERVED",
    title: "댓글 원문과 스레드를 가져왔어요",
    status: "수집 완료",
    summary: "원문과 답글을 분리해 보존했습니다.",
    tone: "blue",
  },
  {
    id: "classified",
    tabLabel: "1차 분류",
    kicker: "FIRST PASS",
    title: "문맥 확인이 필요한 댓글을 찾았어요",
    status: "주의 · 78%",
    summary: "공통 규칙과 AI가 우선 검토 대상으로 분류했습니다.",
    tone: "caution",
  },
  {
    id: "recommended",
    tabLabel: "최종 추천",
    kicker: "CREATOR CONTEXT",
    title: "크리에이터 기준을 반영했어요",
    status: "사용자 검토 필요",
    summary: "과거 수정과 채널 정책을 근거로 숨김 검토를 추천합니다.",
    tone: "risk",
  },
] as const;

export const previewReviewLevels = [
  {
    label: "안전",
    count: 218,
    description: "낮은 검토 우선순위",
    tone: "safe",
  },
  {
    label: "주의",
    count: 17,
    description: "문맥 확인이 필요한 댓글",
    tone: "caution",
  },
  {
    label: "위험",
    count: 6,
    description: "우선 검토할 댓글",
    tone: "risk",
  },
] as const;

export type LandingAnalysisExample = {
  id: string;
  label: string;
  isHarmful: boolean;
  rawSource: string;
  sourceSummary: string;
  ruleSignals: readonly string[];
  stageOne: {
    level: "안전" | "주의" | "위험";
    reason: string;
  };
  creatorContext: string;
  sanitizedFeedback: string | null;
  finalRecommendation: string;
  proposedAction: string;
};

export const landingAnalysisExamples = [
  {
    id: "question",
    label: "질문 댓글",
    isHarmful: false,
    rawSource: "영상에서 소개한 장비 모델명과 구매 링크를 알려주실 수 있나요?",
    sourceSummary: "제품 정보와 구매 경로를 묻는 질문입니다.",
    ruleSignals: ["질문 표현", "제품명 언급", "공격 표현 없음"],
    stageOne: {
      level: "안전",
      reason: "답변 가치가 높은 구체적인 제품 질문입니다.",
    },
    creatorContext: "반복 질문은 답변 후보로 모아 달라는 채널 정책을 반영합니다.",
    sanitizedFeedback: null,
    finalRecommendation: "답변 우선순위에 추가하는 것을 추천합니다.",
    proposedAction: "답변 검토",
  },
  {
    id: "feedback",
    label: "개선 의견",
    isHarmful: false,
    rawSource: "설명은 유용했는데 자막이 조금 빨라서 핵심 부분을 따라가기 어려웠어요.",
    sourceSummary: "자막 속도에 관한 구체적인 개선 의견입니다.",
    ruleSignals: ["개선 제안", "구체적 근거", "공격 표현 없음"],
    stageOne: {
      level: "안전",
      reason: "실행 가능한 시청 경험 피드백이 포함되어 있습니다.",
    },
    creatorContext: "제작 개선 의견은 별도로 모아 달라는 채널 정책을 반영합니다.",
    sanitizedFeedback: "자막 속도를 낮춰 핵심 설명을 따라가기 쉽게 개선해 주세요.",
    finalRecommendation: "콘텐츠 개선 피드백으로 저장하는 것을 추천합니다.",
    proposedAction: "피드백 저장 검토",
  },
  {
    id: "harmful",
    label: "유해 댓글",
    isHarmful: true,
    rawSource: "진짜 못생겼고 말투도 역겨우니까 영상 그만 올려.",
    sourceSummary: "외모와 말투를 겨냥한 인신공격이 포함되어 있습니다.",
    ruleSignals: ["외모 비하", "인신공격", "활동 중단 요구"],
    stageOne: {
      level: "위험",
      reason: "콘텐츠 비평이 아닌 개인 특성을 겨냥한 공격입니다.",
    },
    creatorContext: "외모 관련 비꼼은 우선 검토한다는 채널 정책과 과거 수정 3건을 반영합니다.",
    sanitizedFeedback: null,
    finalRecommendation: "원문을 보존한 상태에서 숨김 여부를 검토하도록 추천합니다.",
    proposedAction: "숨김 검토",
  },
] as const satisfies readonly LandingAnalysisExample[];
