import { type RefObject, useEffect, useEffectEvent, useState } from "react";

export function useViewportPresence<T extends Element>(
  targetRef: RefObject<T | null>,
  { amount, onLeave }: { amount: number; onLeave: () => void },
) {
  const [isInView, setIsInView] = useState(false);
  const notifyLeave = useEffectEvent(onLeave);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
      if (!entry.isIntersecting) notifyLeave();
    }, { threshold: amount });

    observer.observe(target);
    return () => observer.disconnect();
  }, [amount, targetRef]);

  return isInView;
}
