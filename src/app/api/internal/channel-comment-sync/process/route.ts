import { timingSafeEqual } from "node:crypto";

import {
  processOneChannelSyncWork,
  processPendingChannelClassification,
} from "@/features/ingestion/process-channel-comment-sync";
import { getServerEnv } from "@/lib/env";

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

  try {
    const sync = await processOneChannelSyncWork({});
    const analysis = await processPendingChannelClassification({
      maxItems: 5,
    });

    return Response.json({
      data: {
        syncProcessed: sync !== null,
        analysisProcessed: analysis !== null,
      },
    });
  } catch {
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
