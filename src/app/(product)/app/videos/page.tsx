import { redirect } from "next/navigation";

import { requireDeveloperToolsViewer } from "@/features/developer-tools/require-developer-tools-viewer";

export default async function LegacyVideosPage() {
  await requireDeveloperToolsViewer();
  redirect("/app/developer-tools");
}
