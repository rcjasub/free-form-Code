import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, Pencil, Check, Link2, X } from "lucide-react";

interface ShareDrawerProps {
  shareId: string | null;
  canvasId: string | undefined;
  onMakePublic: () => Promise<string | null>;
  isDark: boolean;
  children: React.ReactNode;
}

export default function ShareDrawer({ onMakePublic, isDark, children }: ShareDrawerProps) {
  const [open, setOpen] = useState(false);
  const [copiedView, setCopiedView] = useState(false);
  const [copiedEdit, setCopiedEdit] = useState(false);

  async function copyLink(mode: "view" | "edit") {
    const latestShareId = await onMakePublic();
    if (!latestShareId) return;
    const base = `${window.location.origin}/canvas/share/${latestShareId}`;
    const url = mode === "edit" ? `${base}?edit=true` : base;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    } else {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    if (mode === "view") {
      setCopiedView(true);
      setTimeout(() => setCopiedView(false), 2000);
    } else {
      setCopiedEdit(true);
      setTimeout(() => setCopiedEdit(false), 2000);
    }
  }

  const optionClass = `flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
    isDark
      ? "border-[#3c3c4a] bg-[#1a1a22] hover:border-[#5c5c6a]"
      : "border-gray-200 bg-gray-50 hover:border-gray-300"
  }`;

  return (
    <>
      <div onClick={() => setOpen(true)}>{children}</div>

      <AnimatePresence>
        {open && (
          <>
            {/* backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            {/* modal */}
            <motion.div
              className={`fixed z-50 left-1/2 top-1/2 w-full max-w-sm rounded-2xl border shadow-xl p-6 ${
                isDark
                  ? "bg-[#232329] border-[#3c3c4a]"
                  : "bg-white border-gray-200"
              }`}
              initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
              animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
              exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              {/* header */}
              <div className="flex items-center justify-between mb-1">
                <h2 className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                  Share canvas
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className={`p-1 rounded-lg transition-colors ${isDark ? "text-[#9b9ba8] hover:text-white" : "text-gray-400 hover:text-gray-700"}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className={`text-xs mb-4 ${isDark ? "text-[#9b9ba8]" : "text-gray-400"}`}>
                Choose how others can access this canvas
              </p>

              <div className="flex flex-col gap-3">
                {/* view only */}
                <button className={optionClass} onClick={() => copyLink("view")}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isDark ? "bg-[#2e2e3a]" : "bg-gray-100"}`}>
                      <Eye className={`w-4 h-4 ${isDark ? "text-[#9b9ba8]" : "text-gray-500"}`} />
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>View only</p>
                      <p className={`text-xs ${isDark ? "text-[#9b9ba8]" : "text-gray-400"}`}>Anyone with the link can view</p>
                    </div>
                  </div>
                  {copiedView ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-500">
                      <Check className="w-3 h-3" /> Copied
                    </span>
                  ) : (
                    <span className={`flex items-center gap-1 text-xs ${isDark ? "text-[#9b9ba8]" : "text-gray-400"}`}>
                      <Link2 className="w-3 h-3" /> Copy
                    </span>
                  )}
                </button>

                {/* can edit */}
                <button className={optionClass} onClick={() => copyLink("edit")}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isDark ? "bg-[#2e2e3a]" : "bg-gray-100"}`}>
                      <Pencil className={`w-4 h-4 ${isDark ? "text-[#9b9ba8]" : "text-gray-500"}`} />
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>Can edit</p>
                      <p className={`text-xs ${isDark ? "text-[#9b9ba8]" : "text-gray-400"}`}>Anyone with the link can edit</p>
                    </div>
                  </div>
                  {copiedEdit ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-500">
                      <Check className="w-3 h-3" /> Copied
                    </span>
                  ) : (
                    <span className={`flex items-center gap-1 text-xs ${isDark ? "text-[#9b9ba8]" : "text-gray-400"}`}>
                      <Link2 className="w-3 h-3" /> Copy
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
