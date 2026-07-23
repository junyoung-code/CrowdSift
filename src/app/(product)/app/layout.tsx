import type { ReactNode } from "react";

import { AppShell } from "@/features/app-shell/app-shell";
import { requireViewer } from "@/features/auth/require-viewer";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireViewer();

  return <AppShell>{children}</AppShell>;
}
