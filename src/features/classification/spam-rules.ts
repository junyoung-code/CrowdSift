import type { RiskLevel } from "./schemas";

/**
 * 스팸·광고·피싱을 코드로 가른다.
 *
 * 기획서가 이 자리를 규칙 엔진으로 정해 두었다. 「반복 광고, 의심스러운 URL 처럼
 * 결정적으로 검사할 수 있는 신호를 코드로 처리한다.」 모델에게 맡기지 않는 이유가
 * 있다. 등급 기준은 **크리에이터를 향한 공격**만 다루는데 스팸은 아무도 공격하지
 * 않는다. 기준대로 읽으면 안전이 맞고, 실제로 그렇게 나왔다.
 *
 * 놓치는 쪽보다 **잘못 잡는 쪽을 더 무서워한다.** 「협찬 문의 드립니다」를 스팸으로
 * 묻으면 크리에이터가 돈을 잃는다. 그래서 홍보 어휘 하나만으로는 걸지 않고, 사람을
 * 어딘가로 보내려는 표현이 함께 있어야 스팸으로 본다.
 */

export type SpamSignal =
  | "promotion" // 홍보·판매 어휘
  | "off_platform_call" // 링크·프로필·DM 으로 유도
  | "shortened_link" // 단축 URL
  | "link";

export type SpamFinding = {
  level: RiskLevel;
  signals: SpamSignal[];
};

/** 홍보·판매·수익을 내세우는 말. */
const PROMOTION = [
  "무료",
  "나눔",
  "이벤트",
  "싸게",
  "저렴",
  "할인",
  "쿠폰",
  "특가",
  "판매",
  "팝니다",
  "구매",
  "부업",
  "수익",
  "재테크",
  "대출",
  "코인",
  "投資",
  "투자",
  "월수입",
  "돈버는",
  "돈 버는",
];

/**
 * 사람을 이 댓글 밖으로 보내려는 말.
 *
 * 「링크」 하나만으로는 걸지 않는다. 「이 영상 링크 공유해도 될까요?」 같은 물음이
 * 스팸이 아니기 때문이다.
 */
const OFF_PLATFORM_CALL = [
  "프로필",
  "클릭",
  "디엠",
  "dm",
  "디앰",
  "톡",
  "카톡",
  "오픈채팅",
  "연락",
  "접속",
  "방문",
  "가입",
  "신청",
  "링크",
  "주소",
];

/** 어디로 가는지 감출 수 있는 주소. 댓글에서 정당하게 쓸 일이 드물다. */
const SHORTENERS = [
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "is.gd",
  "han.gl",
  "vo.la",
  "buly.kr",
  "url.kr",
  "t.co",
  "goo.gl",
  "me2.do",
];

const URL = /(https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.(?:com|net|kr|co\.kr|io|me|ly|gl|gd|la)\b/iu;

const containsAny = (haystack: string, needles: readonly string[]) =>
  needles.some((needle) => haystack.includes(needle));

/**
 * 스팸이면 최소 등급과 근거를 낸다. 아니면 null.
 *
 * 여기서 정하는 것은 **최소 등급**이다. 모델이 더 높게 보았다면 그쪽이 이긴다.
 */
export const detectSpam = (text: string): SpamFinding | null => {
  const lowered = text.toLowerCase();

  const signals: SpamSignal[] = [];
  const promotion = containsAny(lowered, PROMOTION);
  const call = containsAny(lowered, OFF_PLATFORM_CALL);
  const shortened = containsAny(lowered, SHORTENERS);
  const hasUrl = URL.test(lowered);

  if (promotion) signals.push("promotion");
  if (call) signals.push("off_platform_call");
  if (shortened) signals.push("shortened_link");
  else if (hasUrl) signals.push("link");

  // 어디로 가는지 감춘 주소는 그 자체로 위험하다.
  if (shortened) return { level: "danger", signals };

  // 파는 말과 주소가 함께 있으면 홍보가 아니라 유인이다.
  if (promotion && hasUrl) return { level: "danger", signals };

  // 파는 말과 보내려는 말이 함께 있을 때만 스팸으로 본다.
  if (promotion && call) return { level: "caution", signals };

  return null;
};
