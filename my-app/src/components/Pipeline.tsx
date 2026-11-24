import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { pipelineLayout, STEP_HEIGHT, type PipelineDirection } from "@/lib/pipelineLayout";

// A workflow drawn as steps and the links between them: the running step's
// border spins, a done one gets a check, and a link fills in as what one
// step made travels on to the next. The parent says where each step is
// (`status`), so it shows real progress rather than a canned loop.
// Ported from React Bits Pro's Pipeline, to the app's colors.

export type StepStatus = "idle" | "run" | "done" | "error";

export interface PipelineStep {
  id: string;
  title: string;
  // the line under the title; while running it says so instead, unless
  // `running` is given
  description?: string;
  running?: string;
  status?: StepStatus;
  icon?: ReactNode;
}

interface Props {
  steps: PipelineStep[];
  edges: (readonly [string, string])[];
  // "auto": side by side when that fits without shrinking much, else stacked
  direction?: PipelineDirection | "auto";
  stepWidth?: number;
  accentColor?: string;
  className?: string;
  "aria-label"?: string;
}

const STATUS_TEXT: Record<StepStatus, string> = { idle: "waiting", run: "running", done: "done", error: "failed" };

export default function Pipeline({
  steps,
  edges,
  direction = "auto",
  stepWidth = 188,
  accentColor = "#4f8cff",
  className = "",
  "aria-label": label,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ids = steps.map((s) => s.id);
  let dir: PipelineDirection = direction === "auto" ? "horizontal" : direction;
  let layout = pipelineLayout(ids, edges, dir, stepWidth);
  if (direction === "auto" && room && room / layout.width < 0.72) {
    dir = "vertical";
    layout = pipelineLayout(ids, edges, dir, stepWidth);
  }
  const scale = room ? Math.min(1, room / layout.width) : 1;
  const status = new Map(steps.map((s) => [s.id, s.status ?? "idle"]));

  return (
    <div
      ref={box}
      role="list"
      aria-label={label}
      className={`pipeline relative w-full ${className}`}
      style={{ "--accent": accentColor, "--w": `${stepWidth}px`, height: layout.height * scale } as CSSProperties}
    >
      <div
        className="absolute top-0 left-1/2 origin-top"
        style={{ width: layout.width, height: layout.height, transform: `translateX(-50%) scale(${scale})` }}
      >
        <svg className="pipeline-links" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.paths.map((d, i) => {
            const lit = status.get(edges[i][0]) === "done";
            return (
              <g key={i}>
                <path className="base" d={d} />
                <path className="flow" d={d} pathLength={1} data-lit={lit || undefined} />
              </g>
            );
          })}
        </svg>
        {steps.map((step) => {
          const p = layout.pos.get(step.id)!;
          const s = step.status ?? "idle";
          const line = s === "run" ? (step.running ?? "Running…") : step.description;
          return (
            <div
              key={step.id}
              role="listitem"
              aria-label={`${step.title}: ${STATUS_TEXT[s]}`}
              className="pipeline-step"
              data-s={s}
              style={{ left: p.x, top: p.y, height: STEP_HEIGHT }}
            >
              <span className="pipeline-icon">
                {step.icon}
                <span className="pipeline-badge">{s === "error" ? <X strokeWidth={4} /> : <Check strokeWidth={4} />}</span>
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-semibold">{step.title}</span>
                {line && <span className="pipeline-sub truncate text-[11px]">{line}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
