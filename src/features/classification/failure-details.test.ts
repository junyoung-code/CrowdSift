import { describe, expect, it } from "vitest";
import { describeClassificationError } from "./failure-details";
import { ClassificationSchemaError } from "./luna-first-pass";
describe("classification diagnostics", () => {
  it("preserves the validation cause and response ID", () => {
    expect(describeClassificationError(new ClassificationSchemaError("Invalid classification evidence", {
      cause: new Error("classification_evidence_not_in_source"),
    }, "resp_test"))).toMatchObject({
      responseId: "resp_test", cause: { message: "classification_evidence_not_in_source" },
    });
  });
  it("does not retain provider bodies or credentials", () => {
    const result = JSON.stringify(describeClassificationError({ message: "sk-secret Bearer token comment text", body: "source", status: 400, request_id: "req_test" }));
    expect(result).not.toContain("sk-secret");
    expect(result).not.toContain("comment text");
    expect(result).toContain("req_test");
  });
});
