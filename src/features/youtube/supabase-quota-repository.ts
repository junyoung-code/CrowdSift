import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import type { QuotaUsageRepository } from "./quota-usage";

/**
 * 오늘 태운 유닛을 두 곳에서 더한다.
 *
 * 가져오기(읽기)와 조치(쓰기)가 다른 표에 쌓이지만 구글이 보는 한도는 하나다.
 * 따로 세면 「가져오기를 잔뜩 한 날 조치가 왜 막히는지」를 설명할 수 없다.
 */
export const createSupabaseQuotaRepository = ({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}): QuotaUsageRepository => ({
  async sumUnitsSince({ since, workspaceId }) {
    const [imports, moderations] = await Promise.all([
      supabase
        .from("comment_import_jobs")
        .select("youtube_quota_units_used")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since),
      supabase
        .from("moderation_action_requests")
        .select("youtube_quota_units_used")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since),
    ]);

    // 화면에 숫자를 못 띄우는 것과 조치를 못 하는 것은 다르다. 여기서 막지 않는다.
    if (imports.error || moderations.error) return 0;

    const total = (rows: { youtube_quota_units_used: number | null }[]) =>
      rows.reduce((sum, row) => sum + (row.youtube_quota_units_used ?? 0), 0);

    return total(imports.data ?? []) + total(moderations.data ?? []);
  },
});
