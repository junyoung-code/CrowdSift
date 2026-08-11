import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class ControlledIntersectionObserver implements IntersectionObserver {
  private static readonly instances = new Set<ControlledIntersectionObserver>();
  private readonly observedTargets = new Set<Element>();
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: number[];

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options.threshold)
      ? [...options.threshold].sort((left, right) => left - right)
      : [options.threshold ?? 0];
    ControlledIntersectionObserver.instances.add(this);
  }

  disconnect() {
    this.observedTargets.clear();
    ControlledIntersectionObserver.instances.delete(this);
  }

  observe(target: Element) {
    this.observedTargets.add(target);
    this.notify(target, 1);
  }

  takeRecords() {
    return [];
  }

  unobserve(target: Element) {
    this.observedTargets.delete(target);
  }

  private notify(target: Element, intersectionRatio: number) {
    const bounds = target.getBoundingClientRect();
    const isIntersecting = intersectionRatio > 0;
    this.callback(
      [
        {
          boundingClientRect: bounds,
          intersectionRatio,
          intersectionRect: isIntersecting ? bounds : new DOMRectReadOnly(),
          isIntersecting,
          rootBounds: null,
          target,
          time: 0,
        },
      ],
      this,
    );
  }

  static setIntersection(target: Element, intersectionRatio: number) {
    for (const observer of ControlledIntersectionObserver.instances) {
      if (observer.observedTargets.has(target)) {
        observer.notify(target, intersectionRatio);
      }
    }
  }

  static reset() {
    ControlledIntersectionObserver.instances.clear();
  }
}

globalThis.IntersectionObserver = ControlledIntersectionObserver;

export function setElementIntersection(
  target: Element,
  intersectionRatio: number,
) {
  ControlledIntersectionObserver.setIntersection(target, intersectionRatio);
}

afterEach(() => {
  cleanup();
  ControlledIntersectionObserver.reset();
});
