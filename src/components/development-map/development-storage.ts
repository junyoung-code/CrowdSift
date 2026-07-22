import {
  DEVELOPMENT_PART_IDS,
  cloneDefaultPlans,
  type PlansByPart,
} from "./development-data";

export const DEVELOPMENT_MAP_STORAGE_KEY = "commenthawk.development-map.v1";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

function isPlansByPart(value: unknown): value is PlansByPart {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return DEVELOPMENT_PART_IDS.every((partId) => {
    const items = record[partId];

    return (
      Array.isArray(items) &&
      items.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as { id?: unknown }).id === "string" &&
          (item as { id: string }).id.trim().length > 0 &&
          typeof (item as { title?: unknown }).title === "string" &&
          (item as { title: string }).title.trim().length > 0,
      )
    );
  });
}

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readDevelopmentPlans(storage?: ReadableStorage): PlansByPart {
  const resolvedStorage = storage ?? getBrowserStorage();

  if (!resolvedStorage) {
    return cloneDefaultPlans();
  }

  try {
    const serialized = resolvedStorage.getItem(DEVELOPMENT_MAP_STORAGE_KEY);

    if (!serialized) {
      return cloneDefaultPlans();
    }

    const parsed: unknown = JSON.parse(serialized);
    return isPlansByPart(parsed) ? parsed : cloneDefaultPlans();
  } catch {
    return cloneDefaultPlans();
  }
}

export function writeDevelopmentPlans(
  plans: PlansByPart,
  storage?: WritableStorage,
): boolean {
  const resolvedStorage = storage ?? getBrowserStorage();

  if (!resolvedStorage) {
    return false;
  }

  try {
    resolvedStorage.setItem(DEVELOPMENT_MAP_STORAGE_KEY, JSON.stringify(plans));
    return true;
  } catch {
    return false;
  }
}
