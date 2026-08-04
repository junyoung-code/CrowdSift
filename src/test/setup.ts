import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class ControlledIntersectionObserver implements IntersectionObserver {
  private static readonly instances = new Set<ControlledIntersectionObserver>();
  private readonly observedTargets = new Set<Element>();
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  constructor(private readonly callback: IntersectionObserverCallback) {
    ControlledIntersectionObserver.instances.add(this);
  }

  disconnect() {
    this.observedTargets.clear();
    ControlledIntersectionObserver.instances.delete(this);
  }

  observe(target: Element) {
    this.observedTargets.add(target);
    this.notify(target, true);
  }

  takeRecords() {
    return [];
  }

  unobserve(target: Element) {
    this.observedTargets.delete(target);
  }

  private notify(target: Element, isIntersecting: boolean) {
    const bounds = target.getBoundingClientRect();
    this.callback(
      [
        {
          boundingClientRect: bounds,
          intersectionRatio: isIntersecting ? 1 : 0,
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

  static setIntersection(target: Element, isIntersecting: boolean) {
    for (const observer of ControlledIntersectionObserver.instances) {
      if (observer.observedTargets.has(target)) {
        observer.notify(target, isIntersecting);
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
  isIntersecting: boolean,
) {
  ControlledIntersectionObserver.setIntersection(target, isIntersecting);
}

afterEach(() => {
  cleanup();
  ControlledIntersectionObserver.reset();
});
