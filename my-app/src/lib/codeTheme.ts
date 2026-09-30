import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Syntax colors for code blocks, from the Beautiful Dracula VS Code theme
// (MIT, https://github.com/lamhoang1256/beautiful-dracula, themes/Dracula-normal.json).
// Dark mode uses the theme's colors as-is. Code blocks are transparent on the
// canvas, so light mode uses the same hues darkened to stay readable on white.

interface Palette {
  keyword: string;
  func: string;
  type: string;
  string: string;
  number: string;
  constant: string;
  comment: string;
  invalid: string;
}

const DARK: Palette = {
  keyword: "#ffabd8",
  func: "#21E4B3",
  type: "#8BE9FD",
  string: "#F1FA8C",
  number: "#ff1daf",
  constant: "#c299ff",
  comment: "#7A86b3",
  invalid: "#FF5555",
};

const LIGHT: Palette = {
  keyword: "#c2185b",
  func: "#0d8f6f",
  type: "#0e7490",
  string: "#7c6f00",
  number: "#c0138a",
  constant: "#7c3aed",
  comment: "#5c6a99",
  invalid: "#dc2626",
};

function highlightStyle(p: Palette) {
  return HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.comment, fontStyle: "italic" },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier, t.processingInstruction], color: p.keyword },
    { tag: [t.propertyName, t.tagName, t.escape], color: p.keyword },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.macroName], color: p.func },
    { tag: t.attributeName, color: p.func, fontStyle: "italic" },
    { tag: t.operator, color: p.func },
    // member-access dots (console.log, System.out, self.name) stay plain text,
    // as in the original theme; mint dots on every line read as noise
    { tag: t.derefOperator, color: "inherit" },
    { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: p.type, fontStyle: "italic" },
    { tag: [t.string, t.special(t.string), t.character, t.regexp], color: p.string },
    { tag: [t.number, t.integer, t.float], color: p.number },
    { tag: [t.bool, t.null, t.atom, t.constant(t.variableName), t.standard(t.variableName)], color: p.constant },
    { tag: t.self, color: p.constant, fontStyle: "italic" },
    { tag: t.invalid, color: p.invalid },
  ]);
}

// Built once; FloatingNode picks one per theme. The styles themselves are
// exported so the per-language coverage can be checked.
export const draculaDarkStyle = highlightStyle(DARK);
export const draculaLightStyle = highlightStyle(LIGHT);
export const draculaDark = syntaxHighlighting(draculaDarkStyle);
export const draculaLight = syntaxHighlighting(draculaLightStyle);
