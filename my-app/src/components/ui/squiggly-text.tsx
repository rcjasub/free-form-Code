import { useEffect, useId, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Text that wobbles like a hand-drawn cartoon: an SVG filter pushes its
// pixels around with noise, and every `stepDuration` ms it switches to
// another noise pattern, so the outline "boils". `scale` is how far pixels
// move (one number, or [min, max] to vary it from frame to frame). Still
// for people who ask for reduced motion.

const FRAMES = 5;

export function SquigglyText({
  children,
  className,
  stepDuration = 80,
  scale = 4,
  baseFrequency = 0.02,
}: {
  children: ReactNode;
  className?: string;
  stepDuration?: number;
  scale?: number | [number, number];
  baseFrequency?: number;
}) {
  const id = `squiggle-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES), stepDuration);
    return () => clearInterval(timer);
  }, [reduced, stepDuration]);

  // each frame's strength, spread evenly between min and max
  const [min, max] = Array.isArray(scale) ? scale : [scale, scale];
  const strength = (i: number) => min + ((max - min) * ((i * 3) % FRAMES)) / (FRAMES - 1);

  return (
    <span className={cn("relative inline-block", className)} style={reduced ? undefined : { filter: `url(#${id}-${frame})` }}>
      {children}
      <svg aria-hidden width="0" height="0" className="absolute">
        {Array.from({ length: FRAMES }, (_, i) => (
          <filter key={i} id={`${id}-${i}`}>
            <feTurbulence type="fractalNoise" baseFrequency={baseFrequency} numOctaves={3} seed={i + 1} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={strength(i)} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </svg>
    </span>
  );
}
