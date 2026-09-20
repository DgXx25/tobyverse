"use client";

import { renderFormula } from "@/lib/visuals/catalog";
import { parseGridExpr, type GridBlock, type GridMark, type GridPiece } from "@/lib/blocks/kinds/grid";

function asLatex(text: string): string {
  return text.replace(/×/g, "\\times").replace(/÷/g, "\\div");
}

function Circle({ mark }: { mark: Exclude<GridMark, "s"> }) {
  const empty = mark === "e";
  return (
    <svg className={`toby-grid-cell is-${mark}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r={empty ? 7.25 : 7.5}
        fill={empty ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={empty ? 1.6 : 0}
      />
    </svg>
  );
}

function Slot({ mark, tone }: { mark: GridMark; tone?: number }) {
  return (
    <span className="toby-grid-slot" data-tone={tone != null ? tone % 4 : undefined}>
      {mark === "s" ? null : <Circle mark={mark} />}
    </span>
  );
}

function Dots({ marks, tone }: { marks: GridMark[]; tone: number }) {
  return (
    <span className="toby-grid-group" data-tone={tone % 4}>
      {marks.map((mark, index) => (
        <Slot key={index} mark={mark} />
      ))}
    </span>
  );
}

function hasOp(pieces: GridPiece[]): boolean {
  return pieces.some((piece) => piece.kind === "op");
}

export function GridView({ block }: { block: GridBlock }) {
  const pieces = parseGridExpr(block.cells);
  const under = block.result?.trim() || block.note?.trim() || "";
  const cols = block.cols ?? 1;
  const array = Boolean(block.cols && block.cols > 0 && !hasOp(pieces));
  const marks = pieces.flatMap((piece) => (piece.kind === "group" ? piece.marks : []));
  const eq = block.result?.trim() ? renderFormula(asLatex(block.result.trim()), false) : null;
  let tone = 0;

  return (
    <div className="toby-grid" aria-label={under || "grid"}>
      <div className="toby-grid-stack">
        {array ? (
          <div className="toby-grid-board" style={{ gridTemplateColumns: `repeat(${cols}, 1.5rem)` }}>
            {marks.map((mark, index) => (
              <Slot key={index} mark={mark} tone={Math.floor(index / cols)} />
            ))}
          </div>
        ) : (
          <div className="toby-grid-row">
            {pieces.map((piece, index) =>
              piece.kind === "op" ? (
                <span key={index} className="toby-grid-op">
                  {piece.op}
                </span>
              ) : (
                <Dots key={index} marks={piece.marks} tone={tone++} />
              ),
            )}
          </div>
        )}
        {eq ? <div className="toby-grid-eq">{eq}</div> : null}
      </div>
    </div>
  );
}
