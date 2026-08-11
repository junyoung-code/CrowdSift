"use client";

import { YoutubeLogo } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

export function IntegrationMark() {
  const scope = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: scope,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-8, 8]);

  return (
    <motion.div
      aria-hidden="true"
      className="youtube-mark"
      ref={scope}
      style={shouldReduceMotion ? undefined : { y }}
    >
      <YoutubeLogo weight="fill" />
    </motion.div>
  );
}
