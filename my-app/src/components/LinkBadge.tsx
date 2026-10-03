import { Link } from "lucide-react";

function hostname(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

// The small chip under a block that has a link (right-click > Add link).
// Opens in a new tab; noopener keeps the opened page from controlling this one.
export default function LinkBadge({ link, isDark }: { link: string; isDark: boolean }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title={link}
      // a click here opens the link — it shouldn't also select or drag the block
      onMouseDown={(e) => e.stopPropagation()}
      className={`absolute -bottom-6 right-0 z-20 flex items-center gap-1 max-w-[220px] px-1.5 py-0.5 rounded border text-[11px] font-canvas transition-colors ${
        isDark
          ? "bg-[#232329] border-[#3c3c4a] text-[#4fb4f2] hover:text-[#8fd0f7]"
          : "bg-white border-gray-200 text-[#1d8fd6] hover:text-[#0b6aa6]"
      }`}
      style={{ pointerEvents: "auto" }}
    >
      <Link size={11} className="shrink-0" />
      <span className="truncate">{hostname(link)}</span>
    </a>
  );
}
