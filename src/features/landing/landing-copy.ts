export const landingCopy = {
  hero: {
    eyebrow: "CREATOR COMMENT OPERATIONS",
    title: "댓글의 소음은 줄이고, 중요한 목소리는 더 선명하게.",
    description:
      "CommentHawk는 YouTube 댓글을 안전·주의·위험으로 정리하고, 크리에이터마다 다른 기준과 과거 판단을 반영해 지금 검토할 댓글부터 보여줍니다.",
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
