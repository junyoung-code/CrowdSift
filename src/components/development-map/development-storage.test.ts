import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLANS,
  cloneDefaultPlans,
  type PlansByPart,
} from "./development-data";
import {
  DEVELOPMENT_MAP_STORAGE_KEY,
  readDevelopmentPlans,
  writeDevelopmentPlans,
} from "./development-storage";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem(key: string) {
      return key === DEVELOPMENT_MAP_STORAGE_KEY ? value : null;
    },
    setItem(key: string, nextValue: string) {
      if (key === DEVELOPMENT_MAP_STORAGE_KEY) {
        value = nextValue;
      }
    },
    value() {
      return value;
    },
  };
}

describe("development plan storage", () => {
  it("returns cloned seeded plans when storage is empty", () => {
    const result = readDevelopmentPlans(createStorage());

    expect(result).toEqual(DEFAULT_PLANS);
    expect(result).not.toBe(DEFAULT_PLANS);
    expect(result.frontend).not.toBe(DEFAULT_PLANS.frontend);
  });

  it("returns persisted plans when the stored shape is valid", () => {
    const plans = cloneDefaultPlans();
    plans.frontend = [{ id: "custom", title: "커스텀 프런트 작업" }];

    expect(readDevelopmentPlans(createStorage(JSON.stringify(plans)))).toEqual(plans);
  });

  it("falls back when stored JSON is invalid", () => {
    expect(readDevelopmentPlans(createStorage("not-json"))).toEqual(DEFAULT_PLANS);
  });

  it("falls back when a required part is missing", () => {
    const incomplete = cloneDefaultPlans() as Partial<PlansByPart>;
    delete incomplete.security;

    expect(readDevelopmentPlans(createStorage(JSON.stringify(incomplete)))).toEqual(
      DEFAULT_PLANS,
    );
  });

  it("returns false instead of throwing when writes fail", () => {
    const storage = {
      setItem() {
        throw new Error("quota exceeded");
      },
    };

    expect(writeDevelopmentPlans(cloneDefaultPlans(), storage)).toBe(false);
  });

  it("serializes valid plans under the versioned key", () => {
    const storage = createStorage();
    const plans = cloneDefaultPlans();

    expect(writeDevelopmentPlans(plans, storage)).toBe(true);
    expect(storage.value()).toBe(JSON.stringify(plans));
  });
});
