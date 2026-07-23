import { requireViewer } from "@/features/auth/require-viewer";
import { getDashboardData } from "@/features/dashboard/dashboard-query";
import { createSupabaseDashboardRepository } from "@/features/dashboard/supabase-dashboard-repository";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AppOverviewPage() {
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const data = await getDashboardData(
    workspaceId,
    createSupabaseDashboardRepository({
      rpc: (name, input) => supabase.rpc(name, input),
    }),
  );

  return (
    <div className="overview-page">
      <div className="page-heading">
        <div>
          <p>OVERVIEW</p>
          <h1>댓글 관리 개요</h1>
          <span>
            연결된 채널과 실제로 가져온 댓글의 상태만 이 화면에 표시됩니다.
          </span>
        </div>
      </div>
      <DashboardView data={data} />
    </div>
  );
}
