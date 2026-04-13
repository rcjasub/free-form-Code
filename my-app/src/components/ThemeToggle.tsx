import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export const useThemeToggle = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    const css = `
      ::view-transition-group(root) { animation-duration: 0.7s; animation-timing-function: ease-in-out; }
      ::view-transition-new(root) { animation-name: reveal; }
      ::view-transition-old(root), .dark::view-transition-old(root) { animation: none; z-index: -1; }
      @keyframes reveal {
        from { clip-path: circle(0% at 50% 50%); }
        to { clip-path: circle(150% at 50% 50%); }
      }
    `;

    let styleEl = document.getElementById("theme-transition") as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "theme-transition";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;

    if (!document.startViewTransition) {
      setTheme(next);
      return;
    }
    document.startViewTransition(() => flushSync(() => setTheme(next)));
  }, [theme, setTheme]);

  return { isDark, toggleTheme };
};

export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { isDark, toggleTheme } = useThemeToggle();

  return (
    <button
      type="button"
      className={`size-8 cursor-pointer rounded-full p-0 transition-all duration-300 active:scale-95 ${isDark ? "bg-black text-white" : "bg-white text-black"} ${className}`}
      onClick={toggleTheme}
      aria-label="Toggle theme"
      style={{ viewTransitionName: "theme-toggle" }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        fill="currentColor"
        strokeLinecap="round"
        viewBox="0 0 32 32"
      >
        <clipPath id="skiper-btn-2">
          <motion.path
            animate={{ y: isDark ? 10 : 0, x: isDark ? -12 : 0 }}
            transition={{ ease: "easeInOut", duration: 0.35 }}
            d="M0-5h30a1 1 0 0 0 9 13v24H0Z"
          />
        </clipPath>
        <g clipPath="url(#skiper-btn-2)">
          <motion.circle
            animate={{ r: isDark ? 10 : 8 }}
            transition={{ ease: "easeInOut", duration: 0.35 }}
            cx="16"
            cy="16"
          />
          <motion.g
            animate={{
              rotate: isDark ? -100 : 0,
              scale: isDark ? 0.5 : 1,
              opacity: isDark ? 0 : 1,
            }}
            transition={{ ease: "easeInOut", duration: 0.35 }}
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M16 5.5v-4" />
            <path d="M16 30.5v-4" />
            <path d="M1.5 16h4" />
            <path d="M26.5 16h4" />
            <path d="m23.4 8.6 2.8-2.8" />
            <path d="m5.7 26.3 2.9-2.9" />
            <path d="m5.8 5.8 2.8 2.8" />
            <path d="m23.4 23.4 2.9 2.9" />
          </motion.g>
        </g>
      </svg>
    </button>
  );
}
