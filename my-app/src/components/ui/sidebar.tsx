import { createContext, useContext, useEffect, useRef, useState } from "react";
import { motion, type Transition, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

// A rail of icons down the left edge that widens on hover to show labels
// (adapted from the SessionNavBar pattern, for React Router instead of
// Next.js). Clicks, drags and scrolls on it stay off the canvas behind it.

const sidebarVariants: Variants = {
  open: { width: "15rem" },
  closed: { width: "3.05rem" },
};

const labelVariants: Variants = {
  open: { x: 0, opacity: 1, transition: { x: { stiffness: 1000, velocity: -100 } } },
  closed: { x: -20, opacity: 0, transition: { x: { stiffness: 100 } } },
};

const transitionProps: Transition = { type: "tween", ease: "easeOut", duration: 0.2 };

const CollapsedContext = createContext(true);

const ROW =
  "flex h-8 w-full shrink-0 flex-row items-center rounded-md px-2 py-1.5 text-gray-500 dark:text-[#9b9ba8] transition-colors";
const ROW_HOVER = "hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-[#2c2c36] dark:hover:text-[#f5f5f5]";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function Sidebar({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const nav = useRef<HTMLElement>(null);
  const leaveWatch = useRef<(() => void) | null>(null);
  useEffect(() => () => leaveWatch.current?.(), []);

  // Closes only once the pointer has really moved off it. A mouseleave alone
  // isn't enough: switching the theme covers the page with a snapshot for a
  // moment, which fires one while the pointer is still on the sidebar.
  function closeWhenPointerLeaves() {
    if (leaveWatch.current) return;
    const onMove = (e: PointerEvent) => {
      const box = nav.current?.getBoundingClientRect();
      if (box && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom) return;
      stopWatching();
      setCollapsed(true);
    };
    const stopWatching = () => {
      window.removeEventListener("pointermove", onMove);
      leaveWatch.current = null;
    };
    window.addEventListener("pointermove", onMove);
    leaveWatch.current = stopWatching;
  }

  return (
    <CollapsedContext.Provider value={collapsed}>
      <motion.nav
        ref={nav}
        className="fixed left-0 top-0 z-40 h-full shrink-0 overflow-hidden border-r border-gray-200 bg-white dark:border-[#2e2e3a] dark:bg-[#1a1a22]"
        initial="closed"
        animate={collapsed ? "closed" : "open"}
        variants={sidebarVariants}
        transition={transitionProps}
        onMouseEnter={() => setCollapsed(false)}
        onMouseLeave={closeWhenPointerLeaves}
        onFocus={() => setCollapsed(false)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setCollapsed(true)}
        onMouseDown={stop}
        onPointerDown={stop}
        onClick={stop}
        onDoubleClick={stop}
        onWheel={stop}
      >
        <div className="flex h-full w-60 flex-col">
          <div className="flex h-[54px] shrink-0 items-center border-b border-gray-200 p-2 dark:border-[#2e2e3a]">
            {header}
          </div>
          <div className="flex grow flex-col gap-1 overflow-y-auto overflow-x-hidden p-2">{children}</div>
          {footer && <div className="flex flex-col gap-1 p-2">{footer}</div>}
        </div>
      </motion.nav>
    </CollapsedContext.Provider>
  );
}

// The label beside an icon: only there while the sidebar is open.
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  const collapsed = useContext(CollapsedContext);
  return (
    <motion.span variants={labelVariants} className={cn("ml-2 truncate text-xs font-medium", className)}>
      {!collapsed && children}
    </motion.span>
  );
}

export function SidebarItem({
  icon,
  label,
  onClick,
  title,
  disabled,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? (typeof label === "string" ? label : undefined)}
      className={cn(ROW, ROW_HOVER, "disabled:opacity-60 [&>svg]:size-4 [&>svg]:shrink-0")}
    >
      {icon}
      <Label>{label}</Label>
    </button>
  );
}

// Text to read rather than click (a warning, a status): its icon on the
// rail, the full text once open.
export function SidebarNote({ icon, children }: { icon: React.ReactNode; children: string }) {
  const collapsed = useContext(CollapsedContext);
  return (
    <div title={children} className={cn(ROW, "h-auto items-start [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0")}>
      {icon}
      <motion.span variants={labelVariants} className="ml-2 text-[11px] leading-snug">
        {!collapsed && children}
      </motion.span>
    </div>
  );
}

export function SidebarSeparator() {
  return <div className="my-1 h-px w-full shrink-0 bg-gray-200 dark:bg-[#2e2e3a]" />;
}

// The header's brand: a letter tile, and the name once open.
export function SidebarBrand({ name, title, onClick }: { name: string; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={title} className={cn(ROW, ROW_HOVER)}>
      <span className="flex size-4 shrink-0 items-center justify-center rounded bg-gray-900 text-[10px] font-semibold uppercase text-white dark:bg-[#f5f5f5] dark:text-gray-900">
        {name[0]}
      </span>
      <Label className="text-[11px] font-semibold uppercase tracking-widest">{name}</Label>
    </button>
  );
}
