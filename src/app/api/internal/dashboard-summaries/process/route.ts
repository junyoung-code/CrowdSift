import { timingSafeEqual } from "node:crypto";

import { processRetryableDashboardSummaries } from "@/features/dashboard/process-dashboard-summary-queue";
import { getServerEnv } from "@/lib/env";

const hasValidWorkerSecret = (
  authorization: string | null,
  secret: string,
) => {
  const actual = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
};

export const POST = async (request: Request) => {
  const { INTERNAL_WORKER_SECRET } = getServerEnv();

  if (!INTERNAL_WORKER_SECRET) {
    return Response.json(
      { error: "worker_not_configured" },
      { status: 503 },
    );
  }

  if (
    !hasValidWorkerSecret(
      request.headers.get("authorization"),
      INTERNAL_WORKER_SECRET,
    )
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json(await processRetryableDashboardSummaries(5));
};
