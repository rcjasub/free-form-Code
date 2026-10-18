import type { Language } from "./languages";

// A best guess at what pasted text is, so pasted code gets highlighted and a
// run button without picking the language first. Anything that doesn't look
// like code stays Plain text. Wrong guesses are one dropdown away from fixed.
const SIGNS: [Language, RegExp][] = [
  ["java", /\b(public|private|protected)\s+(static\s+)?(final\s+)?(class|void|int|String)\b|System\.out\.print/],
  ["cpp", /#include\s*[<"]|\bstd::|\bcout\s*<<|\bint\s+main\s*\(/],
  ["python", /^\s*(def|class)\s+\w+.*:\s*$|^\s*(from\s+\S+\s+)?import\s+\w+\s*$|^\s*(if|for|while|elif)\b.*:\s*$|^\s*print\(/m],
  ["javascript", /\b(const|let|var)\s+\w+\s*=|\bfunction\s*\w*\s*\(|=>|console\.log|\brequire\(|^\s*(import|export)\s.+from\s/m],
];

// Code-shaped without a recognisable language: indented lines, or lines
// ending in braces or semicolons. Gets the default code language.
function looksLikeCode(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  const codeLines = lines.filter((l) => /^(\t| {2,})\S/.test(l) || /[{};]\s*$/.test(l));
  return lines.length > 1 && codeLines.length >= lines.length / 2;
}

export function detectLanguage(text: string): Language {
  for (const [language, sign] of SIGNS) if (sign.test(text)) return language;
  return looksLikeCode(text) ? "javascript" : "text";
}
