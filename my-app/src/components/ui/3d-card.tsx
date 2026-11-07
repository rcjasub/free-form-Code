import { createContext, useContext, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A card that tilts toward the pointer in 3D, with parts of it (CardItem)
// floating forward at their own depth while it's hovered. CardContainer
// tracks the pointer and tilts; CardBody is the card; each CardItem says how
// far it lifts (translateZ, in px) and turns. Pass `disabled` to the
// container for a flat card.

const MouseEnterContext = createContext<{ entered: boolean; disabled: boolean }>({ entered: false, disabled: true });

export function CardContainer({
  children,
  className,
  containerClassName,
  disabled = false,
  tiltDivisor = 25,
}: {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  // how many px of pointer travel make one degree of tilt (higher: gentler)
  tiltDivisor?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled || !containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - left - width / 2) / tiltDivisor;
    const y = (e.clientY - top - height / 2) / tiltDivisor;
    containerRef.current.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
  }

  function handleMouseLeave() {
    setEntered(false);
    if (containerRef.current) containerRef.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  }

  // switching to flat (the theme changed) drops any tilt left over
  useEffect(() => {
    if (disabled && containerRef.current) containerRef.current.style.transform = "";
  }, [disabled]);

  return (
    <MouseEnterContext.Provider value={{ entered, disabled }}>
      <div className={cn("flex items-center justify-center", containerClassName)} style={{ perspective: "1000px" }}>
        <div
          ref={containerRef}
          onMouseEnter={() => setEntered(true)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={cn("relative flex items-center justify-center transition-all duration-200 ease-linear", className)}
          style={{ transformStyle: "preserve-3d" }}
        >
          {children}
        </div>
      </div>
    </MouseEnterContext.Provider>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("[transform-style:preserve-3d] [&>*]:[transform-style:preserve-3d]", className)}>{children}</div>;
}

export function CardItem({
  as: Tag = "div",
  children,
  className,
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  ...rest
}: {
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  translateX?: number | string;
  translateY?: number | string;
  translateZ?: number | string;
  rotateX?: number | string;
  rotateY?: number | string;
  rotateZ?: number | string;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const { entered, disabled } = useContext(MouseEnterContext);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.transform =
      entered && !disabled
        ? `translateX(${translateX}px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`
        : "";
  }, [entered, disabled, translateX, translateY, translateZ, rotateX, rotateY, rotateZ]);

  return (
    <Tag ref={ref} className={cn("w-fit transition duration-200 ease-linear", className)} {...rest}>
      {children}
    </Tag>
  );
}
