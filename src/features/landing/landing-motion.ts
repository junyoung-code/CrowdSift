export const landingMotion = {
  duration: { fast: 0.16, base: 0.42, section: 0.62 },
  stagger: 0.08,
  distance: { small: 8, medium: 20, parallax: 32 },
  tilt: 1.5,
  ease: [0.22, 1, 0.36, 1] as const,
} as const;

export function getAnalysisStepFromProgress(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));

  return Math.min(3, Math.floor(clamped * 4));
}
