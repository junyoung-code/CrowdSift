const urlPattern = /\b(?:https?:\/\/|www\.)[^\s]+/giu;
const repeatedCharacterPattern = /([a-z가-힣])\1{2,}/giu;
const repeatedVowelSyllablePattern =
  /(아|야|어|여|오|요|우|유|으|이)\1{1,}/gu;

const removeMatchingWhitespace = (value: string) => value.replace(/\s+/g, "");

export const normalizeForMatching = (source: string) => {
  // Strip whitespace BEFORE collapsing repeats so that spacing-split evasion
  // ("진 짜  한 심 하 다 아 아") cannot hide an elongated run from the reducers.
  const despaced = removeMatchingWhitespace(
    source.normalize("NFKC").toLowerCase().replace(urlPattern, " __url__ "),
  );
  const variants = [
    despaced.replace(repeatedCharacterPattern, "$1$1"),
    despaced.replace(repeatedCharacterPattern, "$1"),
    despaced.replace(repeatedVowelSyllablePattern, ""),
  ];

  return [...new Set(variants)].join("|");
};

export const containsUrl = (source: string) => {
  urlPattern.lastIndex = 0;
  return urlPattern.test(source.normalize("NFKC"));
};
