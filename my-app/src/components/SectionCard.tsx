import { ArrowLeft, ArrowRight, FileText, Folder, X } from "lucide-react";
import { motion } from "motion/react";
import { themeColor } from "../lib/colors";
import { fileLink, KIND_NAMES, type Connection, type SelectedSection } from "../lib/sectionDetails";

interface Props {
  section: SelectedSection;
  connections: Connection[];
  isDark: boolean;
  // jump to the box at the other end of a connection
  onSelect: (shapeId: string) => void;
  onClose: () => void;
}

// How many files to list before "and N more"
const FILES_SHOWN = 12;

// The details of an AI diagram's box, beside the canvas while it's the one
// box selected: what the section is, its files (linked to GitHub when the
// diagram knows its repo) and what it connects to. Read-only; the box
// itself is edited on the canvas as usual.
export default function SectionCard({ section, connections, isDark, onSelect, onClose }: Props) {
  const { shape, meta } = section;
  const accent = themeColor(shape.stroke, isDark);
  const files = meta.files.slice(0, FILES_SHOWN);
  const more = meta.files.length - files.length;

  return (
    <motion.aside
      aria-label={`About ${shape.label || "this section"}`}
      className="absolute right-4 top-20 z-20 flex max-h-[calc(100vh-10rem)] w-80 flex-col overflow-hidden rounded-xl bg-white text-sm text-gray-800 shadow-[0_2px_12px_rgba(0,0,0,0.14)] dark:bg-[#232329] dark:text-gray-200 dark:shadow-[0_2px_14px_rgba(0,0,0,0.6)]"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      // reading the card doesn't drag or deselect what's under it
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-start gap-2 border-b border-gray-100 px-4 py-3 dark:border-[#2e2e3a]">
        <div className="min-w-0 flex-1">
          {meta.kind && (
            <span className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <span className="size-2 rounded-full" style={{ background: accent }} />
              {KIND_NAMES[meta.kind]}
            </span>
          )}
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white" title={shape.label}>
            {shape.label || "Untitled"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-[#2e2e3a] dark:hover:text-gray-200"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="overflow-y-auto px-4 py-3">
        {meta.summary && <p className="leading-relaxed text-gray-700 dark:text-gray-300">{meta.summary}</p>}

        {meta.files.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Files ({meta.files.length})
            </h3>
            <ul className="space-y-0.5">
              {files.map((path) => {
                const Icon = path.endsWith("/") ? Folder : FileText;
                const body = (
                  <>
                    <Icon className="size-3.5 shrink-0 text-gray-400" />
                    <span className="truncate font-mono text-xs">{path}</span>
                  </>
                );
                return (
                  <li key={path}>
                    {meta.repo ? (
                      <a
                        href={fileLink(meta.repo, path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open ${path} on GitHub`}
                        className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[#1971c2] hover:bg-gray-100 dark:text-[#56a2e8] dark:hover:bg-[#2e2e3a]"
                      >
                        {body}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 px-1 py-0.5">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {more > 0 && <p className="mt-1 px-1 text-xs text-gray-500">and {more} more</p>}
          </section>
        )}

        {connections.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Connects to
            </h3>
            <ul className="space-y-0.5">
              {connections.map((c, i) => (
                <li key={`${c.direction}-${c.shapeId}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.shapeId)}
                    title={`Select ${c.title}`}
                    className="flex w-full items-start gap-1.5 rounded px-1 py-1 text-left hover:bg-gray-100 dark:hover:bg-[#2e2e3a]"
                  >
                    {c.direction === "out" ? (
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-gray-400" aria-label="to" />
                    ) : (
                      <ArrowLeft className="mt-0.5 size-3.5 shrink-0 text-gray-400" aria-label="from" />
                    )}
                    {/* the box's name, and below it how they connect */}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      {c.via && <span className="block text-xs text-gray-500 dark:text-gray-400">{c.via}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </motion.aside>
  );
}
