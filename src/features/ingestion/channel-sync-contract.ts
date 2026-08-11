import { z } from "zod";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function getKoreanToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year!}-${values.month!}-${values.day!}`;
}

export function parseChannelSyncStartDate(value: unknown, now = new Date()) {
  const parsed = dateText.parse(value);
  const [year, month, day] = parsed.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month! - 1 ||
    utc.getUTCDate() !== day
  )
    throw new Error("invalid_start_date");
  if (parsed > getKoreanToday(now)) throw new Error("future_start_date");
  return parsed;
}
