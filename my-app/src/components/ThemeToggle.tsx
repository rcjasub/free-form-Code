import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

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
    document.startViewTransition(() => setTheme(next));
  }, [theme, setTheme]);

  return { isDark, toggleTheme };
};

export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { isDark, toggleTheme } = useThemeToggle();

  return (
    <button
      type="button"
      className={`size-8 cursor-pointer rounded-full bg-black p-0 transition-all duration-300 active:scale-95 ${className}`}
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <motion.g
          animate={{ rotate: isDark ? -180 : 0 }}
          transition={{ ease: "easeInOut", duration: 0.5 }}
        >
          <path d="M120 67.5C149.25 67.5 172.5 90.75 172.5 120C172.5 149.25 149.25 172.5 120 172.5" fill="white" />
          <path d="M120 67.5C90.75 67.5 67.5 90.75 67.5 120C67.5 149.25 90.75 172.5 120 172.5" fill="black" />
        </motion.g>
        <motion.path
          animate={{ rotate: isDark ? 180 : 0 }}
          transition={{ ease: "easeInOut", duration: 0.5 }}
          d="M120 3.75C55.5 3.75 3.75 55.5 3.75 120C3.75 184.5 55.5 236.25 120 236.25C184.5 236.25 236.25 184.5 236.25 120C236.25 55.5 184.5 3.75 120 3.75ZM120 214.5V172.5C90.75 172.5 67.5 149.25 67.5 120C67.5 90.75 90.75 67.5 120 67.5V25.5C172.5 25.5 214.5 67.5 214.5 120C214.5 172.5 172.5 214.5 120 214.5Z"
          fill="white"
        />
      </svg>
    </button>
  );
}
