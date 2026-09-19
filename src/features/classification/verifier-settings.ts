/** Keep the current default; selecting Luna opts into the agreed xhigh comparison. */
export const verifierReasoningEffort = (model: string): "low" | "xhigh" =>
  model === "gpt-5.6-luna" ? "xhigh" : "low";
