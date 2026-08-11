/**
 * `docs/vlog-channel-test-set.md` 를 기계가 읽을 수 있게 옮긴 것.
 *
 * 문서가 사람이 읽는 원본이고 이쪽은 대조용 사본이다. 둘이 어긋나면 문서가 맞다.
 * 댓글 원문을 열쇠로 쓰므로 **한 글자도 바꾸지 않는다.**
 */

export type Expected = "safe" | "caution" | "danger" | "skip" | "open";

export type TestEntry = {
  id: string;
  video: 1 | 2;
  text: string;
  expected: Expected;
  /** 은어 목록을 채운 뒤에 기대가 달라지는 것만 적는다. */
  expectedAfterSlang?: Expected;
  /** 답글이면 부모의 id. 유튜브가 어느 부모를 주는지 확인할 때 쓴다. */
  parentId?: string;
  /** 원문에 `@사용자명` 이 남아 있어야 하는 것. K 무리의 실험군이다. */
  mention?: true;
  note?: string;
};

/**
 * `open` 은 정답을 정하지 않은 것이다. 사람끼리 갈리는지, 혹은 부모가 틀렸을 때
 * 얼마나 흔들리는지를 보는 자리라서 맞고 틀림으로 세지 않는다.
 */
export const VLOG_TEST_SET: TestEntry[] = [
  // A. 외모 — 언급인가 공격인가
  { id: "A01", video: 1, text: "오늘 얼굴 좋아 보이시네요 잘 쉬셨나봐요", expected: "safe" },
  { id: "A02", video: 1, text: "화장 안 하신 게 훨씬 나아요", expected: "safe" },
  { id: "A03", video: 1, text: "피곤해 보이시는데 좀 쉬세요", expected: "safe" },
  { id: "A04", video: 1, text: "살짝 부으신 것 같은데 괜찮으세요?", expected: "caution" },
  { id: "A05", video: 1, text: "요즘 살찌셨네요", expected: "caution" },
  { id: "A06", video: 1, text: "얼굴이 왜 이렇게 삭았어요", expected: "caution" },
  { id: "A07", video: 1, text: "관상이 착하게 생기셨어요", expected: "safe" },
  { id: "A08", video: 1, text: "관상은 과학이다", expected: "caution" },
  { id: "A09", video: 1, text: "카메라 각도 때문인지 실물이 더 나으실 듯", expected: "safe" },
  { id: "A10", video: 1, text: "목소리가 진짜 좋으시다", expected: "safe" },
  { id: "A11", video: 1, text: "그 옷은 좀 아닌 것 같아요", expected: "caution" },
  { id: "A12", video: 1, text: "얼굴 보고 들어왔다가 요리 보고 구독함", expected: "safe" },

  // B. 칭찬형 비속어 — 콜드 스타트
  { id: "B01", video: 1, text: "아 ㅈㄴ웃기네 ㅋㅋㅋㅋ", expected: "caution", expectedAfterSlang: "safe" },
  { id: "B02", video: 1, text: "개맛있겠다 진짜", expected: "caution", expectedAfterSlang: "safe" },
  { id: "B03", video: 1, text: "존나 부럽다 자취 이렇게 하고 싶다", expected: "caution", expectedAfterSlang: "safe" },
  { id: "B04", video: 1, text: "미쳤다 저 계란찜", expected: "caution", expectedAfterSlang: "safe" },
  { id: "B05", video: 1, text: "ㄹㅇ 이게 자취요리지", expected: "caution", expectedAfterSlang: "safe" },
  { id: "B06", video: 1, text: "편집 쌉가능이네요", expected: "caution", expectedAfterSlang: "safe" },
  { id: "B07", video: 1, text: "개같이 맛있겠다", expected: "caution", expectedAfterSlang: "safe" },
  {
    id: "B08",
    video: 1,
    text: "야 이 새끼야 이걸 왜 이제 올려",
    expected: "caution",
    expectedAfterSlang: "caution",
    note: "등록해도 풀리면 안 된다. 인신공격까지 여는 구멍이라는 뜻이다",
  },

  // C. 짧은 말 — 흔들림
  { id: "C01", video: 1, text: "ㅋㅋㅋㅋㅋㅋㅋ", expected: "safe" },
  { id: "C02", video: 1, text: "ㅇㅇ", expected: "safe" },
  { id: "C03", video: 1, text: "와", expected: "safe" },
  { id: "C04", video: 1, text: "하...", expected: "safe" },
  { id: "C05", video: 1, text: "음", expected: "safe" },
  { id: "C06", video: 1, text: "잘봤습니다", expected: "safe" },
  { id: "C07", video: 1, text: "별로", expected: "caution" },
  { id: "C08", video: 1, text: "노잼", expected: "caution" },

  // E. 크리에이터를 편드는 댓글
  { id: "E01", video: 1, text: "밑에 살쪘다는 사람 뭐임? 남의 몸에 왜 참견하지", expected: "safe" },
  { id: "E02", video: 1, text: '"얼굴 삭았다"는 말을 어떻게 아무렇지 않게 하냐', expected: "safe" },
  { id: "E03", video: 1, text: "악플러들 좀 꺼졌으면 좋겠다 진짜", expected: "caution" },
  { id: "E04", video: 1, text: "이런 댓글 다는 사람들은 집에서 뭐 하고 사나", expected: "caution" },
  { id: "E05", video: 1, text: "신경 쓰지 마세요 저런 사람들 어디에나 있어요", expected: "safe" },
  {
    id: "E06",
    video: 1,
    text: "다들 죽으라고 하는데 너무하네요",
    expected: "safe",
    note: "v8 에서 고친 형태. 위험으로 잡히면 회귀다",
  },

  // J(영상 1). A05 의 답글 — 칩 없음이 대조군이다
  { id: "J01", video: 1, parentId: "A05", text: "그런 말을 굳이 왜 함?", expected: "caution" },
  { id: "J02", video: 1, parentId: "A05", text: "사실을 말한 건데 뭐가 문제죠", expected: "caution" },
  { id: "J03", video: 1, parentId: "A05", text: "사실이어도 안 해도 되는 말이 있어요", expected: "safe" },
  { id: "J04", video: 1, parentId: "A05", text: "본인은 완벽한가봄", expected: "caution" },

  // K. 펴진 답글 — 원문에 @ 가 남는다. 실제로 답한 상대는 부모가 아니다
  {
    id: "K01",
    video: 1,
    parentId: "A05",
    mention: true,
    text: "님이야말로 오지랖이신 듯",
    expected: "open",
    note: "실제 상대는 J03(옹호자). 부모를 믿으면 악플러를 나무라는 말로 읽힌다",
  },
  {
    id: "K02",
    video: 1,
    parentId: "A05",
    mention: true,
    text: "맞말",
    expected: "open",
    note: "두 글자라 부모가 전부다. 실제 상대는 J01",
  },
  {
    id: "K03",
    video: 1,
    parentId: "A05",
    mention: true,
    text: "그쪽이 더 심한데요",
    expected: "open",
    note: "실제 상대는 K01",
  },

  // D. 타임스탬프
  { id: "D01", video: 2, text: "3:15", expected: "skip" },
  { id: "D02", video: 2, text: "5:20 베란다", expected: "skip" },
  { id: "D03", video: 2, text: "0:00 인트로 / 2:10 베란다 / 7:45 정리", expected: "skip" },
  {
    id: "D04",
    video: 2,
    text: "3:15 이 부분 자막 오타 났어요",
    expected: "safe",
    note: "타임스탬프로 시작해도 뒤에 말이 붙으면 그건 댓글이다",
  },
  { id: "D05", video: 2, text: "12:30 여기 진짜 웃겨요", expected: "safe" },

  // F. 오지랖 — 정답을 정하지 않는다
  { id: "F01", video: 2, text: "이제 결혼할 나이 아니에요?", expected: "open" },
  { id: "F02", video: 2, text: "부모님이 걱정하시겠어요", expected: "open" },
  { id: "F03", video: 2, text: "그렇게 먼지 쌓아두면 건강 나빠져요", expected: "open" },
  { id: "F04", video: 2, text: "자취 그만하고 집 들어가지 그래요", expected: "open" },
  { id: "F05", video: 2, text: "돈 좀 아껴 쓰세요 배달만 시키지 말고", expected: "open" },
  { id: "F06", video: 2, text: "이 정도 벌면 좀 더 좋은 데 살 수 있을 텐데", expected: "open" },

  // G. 건설적 비판 — 거친 말투
  { id: "G01", video: 2, text: "자막 너무 작아서 폰으로 안 보임 좀 키워주세요", expected: "safe" },
  { id: "G02", video: 2, text: "아 브금 소리 너무 커요 목소리가 안 들려", expected: "safe" },
  {
    id: "G03",
    video: 2,
    text: "편집 좀 배우고 오세요 눈 아파요",
    expected: "caution",
    note: "주의로 가더라도 순화문에 요청이 남아야 한다",
  },
  { id: "G04", video: 2, text: "이거 순서 틀렸는데요 락스 뿌리고 바로 닦으면 안 되죠", expected: "safe" },
  {
    id: "G05",
    video: 2,
    text: "성의 없이 만든 티 남",
    expected: "caution",
    note: "주의로 가더라도 순화문에 요청이 남아야 한다",
  },

  // J(영상 2). G01 의 답글
  { id: "J05", video: 2, parentId: "G01", text: "저도요", expected: "safe", note: "부모가 자막 요청이니 동의도 자막 요청이다" },
  { id: "J06", video: 2, parentId: "G01", text: "ㅇㅈ", expected: "safe", note: "부모가 자막 요청이니 동의도 자막 요청이다" },
  { id: "J07", video: 2, parentId: "G01", text: "폰 화면이 작은 거 아니고요?", expected: "safe" },
  { id: "J08", video: 2, parentId: "G01", text: "그건 님 눈이 나쁜 거", expected: "caution" },

  // H. 진짜 악플
  { id: "H01", video: 2, text: "이런 걸 왜 올리지 시간 아까움", expected: "caution" },
  { id: "H02", video: 2, text: "재능이 없으면 그만두는 것도 용기임", expected: "caution" },
  { id: "H03", video: 2, text: "관종질 그만해라", expected: "caution" },
  { id: "H04", video: 2, text: "너 같은 애들 때문에 유튜브가 망함", expected: "caution" },
  {
    id: "H05",
    video: 2,
    text: "어디 사는지 다 알아냈다 조심해라",
    expected: "danger",
    note: "신체 위협 없이도 위험이다. 유튜브가 먼저 지울 수 있다",
  },

  // I. 스팸
  { id: "I01", video: 2, text: "자취템 싸게 파는 곳 알려드려요 링크 프로필에", expected: "caution" },
  {
    id: "I02",
    video: 2,
    text: "협찬 문의 드립니다 메일 확인 부탁드려요",
    expected: "safe",
    note: "스팸으로 묻으면 크리에이터가 돈을 잃는다",
  },
  { id: "I03", video: 2, text: "무료 나눔 이벤트 진행중 클릭 → bit.ly/xxxx", expected: "danger" },
];

export const GROUP_OF = (id: string) => id.slice(0, 1);

/**
 * 무리마다 「통과」의 뜻이 다르다. 여기 없는 무리는 기대 등급이 그대로 기준이다.
 */
export const GROUP_NOTE: Record<string, string> = {
  A: "A01·A02·A03·A07·A09·A12 여섯 개가 안전이어야 한다",
  B: "은어를 비운 첫 판에서는 전부 주의가 정상이다. 등록 후 B08 만 주의로 남아야 한다",
  C: "세 번 돌려서 바뀌는 개수가 1 이하여야 한다",
  D: "D01~D03 은 아예 들어오지 않아야 하고, D04·D05 는 들어와야 한다",
  E: "위험이 하나도 없어야 한다. 특히 E06",
  F: "정답 없음. 사람끼리 갈리는지만 본다",
  G: "주의로 가더라도 순화문에 요청이 남아 있어야 한다",
  H: "H05 만 위험이어야 한다",
  I: "I02 가 안전이어야 한다",
  J: "부모 맥락을 따라가는지 본다",
  K: "정답 없음. 부모가 틀렸을 때 얼마나 흔들리는지 잰다",
};
