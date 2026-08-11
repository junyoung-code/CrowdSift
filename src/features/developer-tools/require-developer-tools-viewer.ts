import "server-only";

import { notFound } from "next/navigation";

import {
  requireViewer,
  type Viewer,
} from "@/features/auth/require-viewer";
import { getServerEnv } from "@/lib/env";

import { hasDeveloperToolsAccess } from "./developer-tools-access";

export const canUseDeveloperTools = (userId: string) => {
  const environment = getServerEnv();

  return hasDeveloperToolsAccess({
    allowedUserIds: environment.DEVELOPER_USER_IDS,
    enabled: environment.ENABLE_DEVELOPER_TOOLS,
    nodeEnv: process.env.NODE_ENV,
    userId,
  });
};

export const requireDeveloperToolsViewer = async (): Promise<Viewer> => {
  const viewer = await requireViewer();

  if (!canUseDeveloperTools(viewer.userId)) {
    notFound();
  }

  return viewer;
};
