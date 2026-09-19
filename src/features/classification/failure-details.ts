/** Diagnostics contain no source text, prompts, credentials, or provider response bodies. */
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};
const safeIdentifier = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : null;
const safeMessages = new Set([
  "Luna returned no parsed output", "Terra returned no parsed output",
  "Luna output did not match the first pass schema", "Terra output did not match the verdict schema",
  "Invalid classification evidence",
]);
export function describeClassificationError(error: unknown, depth = 0): Record<string, unknown> {
  const data = record(error);
  const message = typeof data.message === "string" ? data.message : "";
  return {
    name: safeIdentifier(data.name) ?? "Error",
    message: safeMessages.has(message) || /^classification_[a-z_]+$/.test(message)
      ? message : "Detailed provider message omitted; see code and request ID",
    code: safeIdentifier(data.code) ?? safeIdentifier(record(data.error).code),
    status: typeof data.status === "number" ? data.status : null,
    requestId: safeIdentifier(data.request_id),
    responseId: safeIdentifier(data.responseId),
    issues: Array.isArray(data.issues) ? data.issues.slice(0, 20).map(issue => {
      const entry = record(issue);
      return { code: safeIdentifier(entry.code), path: Array.isArray(entry.path) ? entry.path.filter(v => typeof v === "number" || safeIdentifier(v)) : [] };
    }) : [],
    cause: depth < 3 && data.cause ? describeClassificationError(data.cause, depth + 1) : null,
  };
}
