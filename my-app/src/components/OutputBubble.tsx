interface Props {
  id: number;
  x: number;
  y: number;
  text: string;
  isError: boolean;
  onDismiss: (id: number) => void;
}

export default function OutputBubble({
  id,
  x,
  y,
  text,
  isError,
  onDismiss,
}: Props) {
  return (
    <div
      className={`absolute max-w-xs rounded-lg px-3 py-2 shadow-lg text-xs font-mono whitespace-pre-wrap border ${
        isError
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-gray-900 text-green-400 border-gray-700"
      }`}
      style={{ left: x, top: y }}
    >
      <button
        className={`absolute top-1 right-1.5 text-[10px] opacity-40 hover:opacity-100 transition-opacity ${isError ? "text-red-400" : "text-gray-400"}`}
        onClick={() => onDismiss(id)}
      >
        ✕
      </button>
      <span className="pr-3">{text}</span>
    </div>
  );
}
