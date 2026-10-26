import { useNavigate } from "react-router-dom";
import { useActiveTab } from "../hooks/useActiveTab";

// Shows the browser-only canvas in one tab at a time (hooks/useActiveTab);
// other tabs get a note and a way to switch here instead.
export default function LocalCanvasGate({ children }: { children: React.ReactNode }) {
  const { state, movedTo, takeOver } = useActiveTab();
  const navigate = useNavigate();

  if (state === "active") return <>{children}</>;

  const button =
    "px-4 py-1.5 text-sm font-medium rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 transition-opacity disabled:opacity-60";

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-white dark:bg-[#121212]">
      {state !== "checking" && (
        <div className="max-w-sm mx-4 text-center flex flex-col items-center gap-3">
          {movedTo ? (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">This canvas was moved online.</p>
              <button className={button} onClick={() => navigate(`/canvas/${movedTo}`, { replace: true })}>
                Open it
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">This canvas is open in another tab.</p>
              <button className={button} onClick={takeOver} disabled={state === "waiting"}>
                {state === "waiting" ? "Switching…" : "Use here"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
