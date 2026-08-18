import { timingSafeEqual } from "node:crypto";

import {
  processOneChannelSyncWork,
  processPendingChannelClassification,
} from "@/features/ingestion/process-channel-comment-sync";
import { getServerEnv } from "@/lib/env";

export const maxDuration = 60;

const hasValidBearer = (request: Request, secret: string) => {
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
};

export async function GET(request: Request) {
  const { CRON_SECRET } = getServerEnv();
  if (!CRON_SECRET || !hasValidBearer(request, CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const [sync, analysis] = await Promise.allSettled([
    processOneChannelSyncWork({}),
    processPendingChannelClassification({ maxItems: 5 }),
  ]);
  const failed = sync.status === "rejected" || analysis.status === "rejected";
  const data = {
    syncProcessed: sync.status === "fulfilled" && sync.value !== null,
    analysisProcessed:
      analysis.status === "fulfilled" && analysis.value !== null,
  };

  return failed
    ? Response.json({ error: "processing_failed", data }, { status: 500 })
    : Response.json({ data });
}
