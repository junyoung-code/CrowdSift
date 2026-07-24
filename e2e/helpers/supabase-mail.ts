import type { Page } from "@playwright/test";

type MailpitMessageSummary = {
  ID: string;
  Created: string;
  To: Array<{ Address: string }>;
};

type MailpitListResponse = {
  messages: MailpitMessageSummary[];
};

type MailpitMessage = {
  HTML: string;
  Text: string;
};

type FetchLike = (
  input: string,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const assertLocalMailpitUrl = (mailpitUrl: string) => {
  const parsed = new URL(mailpitUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("Mailpit helper is local-only");
  }
  return parsed.origin;
};

const extractMagicLink = (message: MailpitMessage) => {
  const htmlMatch = message.HTML.match(/href="([^"]+)"/i);
  const textMatch = message.Text.match(/https?:\/\/[^\s)]+/i);
  const link = htmlMatch?.[1] ?? textMatch?.[0];

  if (!link) {
    throw new Error("Magic link was not found in the local test email");
  }

  return link.replaceAll("&amp;", "&");
};

export const getLatestMagicLink = async (
  recipient: string,
  options: {
    mailpitUrl?: string;
    fetch?: FetchLike;
    createdAfter?: Date;
  } = {},
) => {
  const mailpitOrigin = assertLocalMailpitUrl(
    options.mailpitUrl ??
      process.env.LOCAL_MAILPIT_URL ??
      "http://127.0.0.1:54324",
  );
  const fetcher = options.fetch ?? fetch;
  const listResponse = await fetcher(`${mailpitOrigin}/api/v1/messages`);

  if (!listResponse.ok) {
    throw new Error("Local Mailpit message list could not be read");
  }

  const list = (await listResponse.json()) as MailpitListResponse;
  const latest = list.messages
    .filter((message) =>
      message.To.some(
        ({ Address }) => Address.toLowerCase() === recipient.toLowerCase(),
      ),
    )
    .filter(
      (message) =>
        !options.createdAfter ||
        new Date(message.Created).getTime() >= options.createdAfter.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(right.Created).getTime() - new Date(left.Created).getTime(),
    )[0];

  if (!latest) {
    throw new Error(`No local magic-link email found for ${recipient}`);
  }

  const detailResponse = await fetcher(
    `${mailpitOrigin}/api/v1/message/${latest.ID}`,
  );
  if (!detailResponse.ok) {
    throw new Error("Local Mailpit message could not be read");
  }

  return extractMagicLink((await detailResponse.json()) as MailpitMessage);
};

export const requestAndOpenMagicLink = async (
  page: Page,
  recipient: string,
) => {
  const requestedAt = new Date(Date.now() - 1_000);
  const alternative = page.getByText("다른 방법으로 로그인", {
    exact: true,
  });
  const details = alternative.locator("xpath=ancestor::details");
  if ((await details.getAttribute("open")) === null) {
    await alternative.click();
  }
  await page.getByLabel("이메일").fill(recipient);
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await page.getByText("로그인 링크를 이메일로 보냈습니다.").waitFor();

  const deadline = Date.now() + 10_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const magicLink = await getLatestMagicLink(recipient, {
        createdAfter: requestedAt,
      });
      await page.goto(magicLink);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
    }
  }

  throw lastError ?? new Error("Timed out waiting for local magic-link email");
};
