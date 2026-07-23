const urlPattern = /\b(?:https?:\/\/|www\.)[^\s]+/giu;
const repeatedCharacterPattern = /([a-z가-힣])\1{2,}/giu;
const repeatedVowelSyllablePattern =
  /(아|야|어|여|오|요|우|유|으|이)\1{1,}/gu;

const removeMatchingWhitespace = (value: string) => value.replace(/\s+/g, "");

export const normalizeForMatching = (source: string) => {
  const normalized = source
    .normalize("NFKC")
    .toLowerCase()
    .replace(urlPattern, " __url__ ");
  const twoCharacterRepeat = normalized.replace(
    repeatedCharacterPattern,
    "$1$1",
  );
  const singleCharacterRepeat = normalized.replace(
    repeatedCharacterPattern,
    "$1",
  );
  const removedVowelElongation = normalized.replace(
    repeatedVowelSyllablePattern,
    "",
  );
  const variants = [
    twoCharacterRepeat,
    singleCharacterRepeat,
    removedVowelElongation,
  ].map(removeMatchingWhitespace);

  return [...new Set(variants)].join("|");
};

export const containsUrl = (source: string) => {
  urlPattern.lastIndex = 0;
  return urlPattern.test(source.normalize("NFKC"));
};
