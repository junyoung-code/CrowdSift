export const getSafeNextPath = (value: unknown) => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return "/app";
  }

  try {
    const decoded = decodeURIComponent(candidate);
    if (
      decoded.includes("\\") ||
      decoded.startsWith("//") ||
      /[\u0000-\u001F\u007F]/.test(decoded)
    ) {
      return "/app";
    }
    return candidate;
  } catch {
    return "/app";
  }
};
