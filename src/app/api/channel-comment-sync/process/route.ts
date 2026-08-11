import { requireViewer } from "@/features/auth/require-viewer";
import {
  processOneChannelSyncWork,
  processPendingChannelClassification,
} from "@/features/ingestion/process-channel-comment-sync";

export async function POST() {
  const { workspaceId } = await requireViewer();

  try {
    const sync = await processOneChannelSyncWork({ workspaceId });
    const analysis = await processPendingChannelClassification({
      workspaceId,
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
