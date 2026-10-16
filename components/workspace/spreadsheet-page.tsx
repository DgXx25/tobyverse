"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkBook } from "xlsx";
import type { MaterialFileResult } from "@/lib/materials/file-client";
import type { StageChrome } from "@/components/workspace/material-viewer";

const ROWS = 40;
const COLS = 12;

export function SpreadsheetPage({ file, onChrome }: {
  file: MaterialFileResult | null;
  onChrome: (chrome: StageChrome | null) => void;
}) {
  const [loaded, setLoaded] = useState<{ book: WorkBook; utils: typeof import("xlsx").utils } | null>(null);
  const [error, setError] = useState("");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError("");
    if (file?.ok) void import("xlsx").then(({ read, utils }) => {
      const book = read(file.bytes, { type: "array", cellDates: true, cellFormula: false, cellHTML: false });
      if (!cancelled) { setLoaded({ book, utils }); setSheetIndex(0); setPage(1); }
    }).catch(() => { if (!cancelled) setError("Could not read this workbook."); });
    return () => { cancelled = true; };
  }, [file]);

  const name = loaded?.book.SheetNames[sheetIndex];
  const sheet = name ? loaded?.book.Sheets[name] : undefined;
  const range = useMemo(() => sheet?.["!ref"] && loaded ? loaded.utils.decode_range(sheet["!ref"]) : null, [loaded, sheet]);
  const bands = range ? Math.ceil((range.e.c - range.s.c + 1) / COLS) : 1;
  const count = range ? Math.ceil((range.e.r - range.s.r + 1) / ROWS) * bands : 1;
  useEffect(() => {
    onChrome({ page, count, zoom, setPage: (next) => setPage(Math.max(1, Math.min(count, next))), setZoom: (next) => setZoom(Math.max(50, Math.min(200, next))) });
    return () => onChrome(null);
  }, [page, count, zoom, onChrome]);

  if (!file) return <p className="p-8 text-center text-muted">Loading...</p>;
  if (!file.ok || error) return <p role="alert" className="p-8 text-center text-muted">{error || (!file.ok ? file.message : "")}</p>;
  if (!loaded) return <p className="p-8 text-center text-muted">Loading...</p>;
  const startRow = (range?.s.r ?? 0) + Math.floor((page - 1) / bands) * ROWS;
  const startCol = (range?.s.c ?? 0) + ((page - 1) % bands) * COLS;
  const columns = range ? Array.from({ length: Math.min(COLS, range.e.c - startCol + 1) }, (_, i) => startCol + i) : [];
  const rows = range ? Array.from({ length: Math.min(ROWS, range.e.r - startRow + 1) }, (_, i) => startRow + i) : [];
  return <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
    <div className="flex shrink-0 items-center gap-3 border-b border-border p-2 text-xs">
      <select aria-label="Worksheet" value={sheetIndex} onChange={(event) => { setSheetIndex(Number(event.target.value)); setPage(1); }} className="max-w-[60%] rounded border border-border bg-surface p-1">
        {loaded.book.SheetNames.map((sheetName, i) => <option key={sheetName} value={i}>{sheetName}</option>)}
      </select>
      <span>{range ? `${loaded.utils.encode_col(startCol)}${startRow + 1} : ${loaded.utils.encode_col(columns.at(-1)!)}${rows.at(-1)! + 1}` : "Empty sheet"}</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-left" style={{ fontSize: 12 * zoom / 100 }}>
        <caption className="sr-only">{name}</caption>
        <thead><tr><th className="border border-border p-2" />{columns.map((col) => <th scope="col" key={col} className="border border-border p-2 font-normal">{loaded.utils.encode_col(col)}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row}><th scope="row" className="border border-border p-2 font-normal">{row + 1}</th>{columns.map((col) => {
          const cell = sheet?.[loaded.utils.encode_cell({ r: row, c: col })];
          return <td key={col} className="min-w-24 max-w-72 whitespace-pre-wrap break-words border border-border p-2 align-top">{cell ? loaded.utils.format_cell(cell) : ""}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  </div>;
}
