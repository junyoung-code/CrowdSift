import { requireViewer } from "@/features/auth/require-viewer";
import {
  processOneChannelSyncWork,
  processPendingChannelClassification,
} from "@/features/ingestion/process-channel-comment-sync";

export async function POST() {
  const { workspaceId } = await requireViewer();

  const [sync, analysis] = await Promise.allSettled([
    processOneChannelSyncWork({ workspaceId }),
    processPendingChannelClassification({ workspaceId, maxItems: 5 }),
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
