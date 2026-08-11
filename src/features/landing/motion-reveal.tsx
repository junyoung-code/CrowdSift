"use client";

import {
  motion,
  useAnimationControls,
  useInView,
  useReducedMotion,
} from "motion/react";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from "react";

import { landingMotion } from "./landing-motion";

const elements = {
  article: motion.article,
  div: motion.div,
  li: motion.li,
  section: motion.section,
};

type MotionRevealProps = {
  as?: keyof typeof elements;
  ariaHidden?: boolean;
  ariaLabelledby?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
  x?: number;
  y?: number;
};

export function MotionReveal({
  as = "div",
  ariaHidden,
  ariaLabelledby,
  children,
  className,
  delay = 0,
  once = true,
  x = 0,
  y = landingMotion.distance.medium,
}: MotionRevealProps) {
  const controls = useAnimationControls();
  const elementRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(elementRef, { amount: 0.18, once });
  const shouldReduceMotion = useReducedMotion();
  const Component = elements[as] as typeof motion.div;

  useEffect(() => {
    if (shouldReduceMotion) {
      controls.set({ opacity: 1, x: 0, y: 0 });
      return;
    }

    if (isInView) {
      void controls.start({ opacity: 1, x: 0, y: 0 });
      return;
    }

    controls.set({ opacity: 0, x, y });
  }, [controls, isInView, shouldReduceMotion, x, y]);

  return (
    <Component
      aria-hidden={ariaHidden}
      aria-labelledby={ariaLabelledby}
      data-motion-visible={isInView || Boolean(shouldReduceMotion)}
      ref={elementRef as Ref<HTMLDivElement>}
      animate={controls}
      className={className}
      initial={false}
      transition={{
        delay,
        duration: landingMotion.duration.section,
        ease: landingMotion.ease,
      }}
    >
      {children}
    </Component>
  );
}
