import type { Transition } from "motion/react";

// The left sidebar's widths and its open/close animation, shared with what
// sits beside it (the properties panel), so both move together.
export const SIDEBAR_CLOSED_REM = 3.05;
export const SIDEBAR_OPEN_REM = 15;
export const SIDEBAR_TRANSITION: Transition = { type: "tween", ease: "easeOut", duration: 0.2 };

// How far something next to the sidebar moves right while it's open: the
// extra width it gains, in px.
export function sidebarOpenShift() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return (SIDEBAR_OPEN_REM - SIDEBAR_CLOSED_REM) * rem;
}
