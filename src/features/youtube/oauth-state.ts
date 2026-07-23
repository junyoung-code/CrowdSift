import { randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthStatePurpose = "read" | "moderation";

type OAuthStatePayload = {
  state: string;
  purpose: OAuthStatePurpose;
  actionRequestId: string | null;
};

const decodePayload = (cookieValue: string): OAuthStatePayload => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8"),
    ) as Partial<OAuthStatePayload>;

    if (
      typeof parsed.state !== "string" ||
      (parsed.purpose !== "read" && parsed.purpose !== "moderation") ||
      !(
        parsed.actionRequestId === null ||
        typeof parsed.actionRequestId === "string"
      )
    ) {
      throw new Error("Invalid OAuth state");
    }

    return parsed as OAuthStatePayload;
  } catch {
    throw new Error("Invalid OAuth state");
  }
};

export const createOAuthStatePayload = (
  {
    actionRequestId = null,
    purpose,
  }: {
    purpose: OAuthStatePurpose;
    actionRequestId?: string | null;
  },
  createRandomBytes: () => Buffer = () => randomBytes(32),
) => {
  const state = createRandomBytes().toString("base64url");
  const payload: OAuthStatePayload = {
    state,
    purpose,
    actionRequestId,
  };

  return {
    state,
    cookieValue: Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    ),
  };
};

export const verifyOAuthStatePayload = ({
  cookieValue,
  receivedState,
}: {
  cookieValue: string;
  receivedState: string;
}) => {
  const payload = decodePayload(cookieValue);
  const expected = Buffer.from(payload.state);
  const received = Buffer.from(receivedState);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new Error("Invalid OAuth state");
  }

  return {
    purpose: payload.purpose,
    actionRequestId: payload.actionRequestId,
  };
};
