import { useCallback, useState } from "react";
import { loadCanvasBackground, saveCanvasBackground, type CanvasBackground } from "../lib/canvasBackground";

// The person's chosen canvas background, remembered in this browser like the
// theme, so it's the same on every canvas they open.
export function useCanvasBackground() {
  const [background, setBackgroundState] = useState<CanvasBackground>(loadCanvasBackground);
  const setBackground = useCallback((bg: CanvasBackground) => {
    setBackgroundState(bg);
    saveCanvasBackground(bg);
  }, []);
  return { background, setBackground };
}
