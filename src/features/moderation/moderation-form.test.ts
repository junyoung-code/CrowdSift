import { describe, expect, it } from "vitest";

import {
  parseModerationConfirmationForm,
  parseModerationRequestForm,
} from "./moderation-form";

describe("parseModerationRequestForm", () => {
  it("accepts a supported action and a UUID comment id", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("action", "hold_for_review");

    expect(parseModerationRequestForm(formData)).toEqual({
      rawCommentId: "11111111-1111-4111-8111-111111111111",
      action: "hold_for_review",
    });
  });

  it("rejects unsupported actions before any provider call", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("action", "ban_creator");

    expect(() => parseModerationRequestForm(formData)).toThrow(
      "Invalid moderation request",
    );
  });
});

describe("parseModerationConfirmationForm", () => {
  it("requires the exact confirmation value", () => {
    const formData = new FormData();
    formData.set("requestId", "22222222-2222-4222-8222-222222222222");
    formData.set("confirmation", "I_UNDERSTAND");

    expect(parseModerationConfirmationForm(formData)).toEqual({
      requestId: "22222222-2222-4222-8222-222222222222",
      confirmation: "I_UNDERSTAND",
    });

    formData.set("confirmation", "true");
    expect(() => parseModerationConfirmationForm(formData)).toThrow(
      "Explicit confirmation required",
    );
  });
});
