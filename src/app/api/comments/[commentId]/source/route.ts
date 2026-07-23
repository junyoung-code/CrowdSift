import { requireViewer } from "@/features/auth/require-viewer";
import {
  SourceAcknowledgementError,
  SourceNotFoundError,
  loadAcknowledgedSource,
  type SourceRepository,
} from "@/features/inbox/source-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ commentId: string }>;
  },
) {
  const { commentId } = await params;
  let acknowledged = false;

  try {
    const body = (await request.json()) as { acknowledged?: unknown };
    acknowledged = body.acknowledged === true;
  } catch {
    acknowledged = false;
  }

  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const repository: SourceRepository = {
    async findOwnedSource(input) {
      const { data, error } = await supabase
        .from("raw_comments")
        .select("text_display, text_original, captured_at")
        .eq("workspace_id", input.workspaceId)
        .eq("id", input.commentId)
        .is("source_deleted_at", null)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }

      return {
        textDisplay: data.text_display,
        textOriginal: data.text_original,
        capturedAt: data.captured_at,
      };
    },
  };

  try {
    const source = await loadAcknowledgedSource(
      {
        workspaceId,
        commentId,
        acknowledged,
      },
      repository,
    );
    return Response.json(source);
  } catch (error) {
    if (error instanceof SourceAcknowledgementError) {
      return Response.json(
        { error: "source_acknowledgement_required" },
        { status: 400 },
      );
    }
    if (error instanceof SourceNotFoundError) {
      return Response.json({ error: "source_not_found" }, { status: 404 });
    }
    return Response.json({ error: "source_request_failed" }, { status: 500 });
  }
}
