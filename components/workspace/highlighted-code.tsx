"use client";

import { useMemo } from "react";
import hljs from "highlight.js/lib/common";

const ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  html: "xml",
  htm: "xml",
  md: "markdown",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
  rs: "rust",
  golang: "go",
  kt: "kotlin",
  text: "",
  plaintext: "",
  txt: "",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlight(code: string, lang?: string) {
  const key = ALIAS[lang?.toLowerCase() ?? ""] ?? lang?.toLowerCase() ?? "";
  try {
    if (key && hljs.getLanguage(key)) {
      return hljs.highlight(code, { language: key, ignoreIllegals: true }).value;
    }
    if (code.trim()) return hljs.highlightAuto(code).value;
  } catch {
    /* fall through */
  }
  return escapeHtml(code);
}

export function HighlightedCode({ code, lang }: { code: string; lang?: string }) {
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  return <code className="hljs chat-block-code" dangerouslySetInnerHTML={{ __html: html }} />;
}
