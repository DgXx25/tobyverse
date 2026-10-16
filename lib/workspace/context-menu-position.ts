const EDGE_GAP = 8;
const POINTER_GAP = 8;

/** Place a context menu by the pointer, flipping at viewport edges and clamping as a fallback. */
export function positionContextMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const rightSide = x + POINTER_GAP + width <= viewportWidth - EDGE_GAP;
  const below = y + POINTER_GAP + height <= viewportHeight - EDGE_GAP;
  const left = rightSide ? x + POINTER_GAP : x - POINTER_GAP - width;
  const top = below ? y + POINTER_GAP : y - POINTER_GAP - height;
  return {
    left: Math.max(EDGE_GAP, Math.min(left, viewportWidth - width - EDGE_GAP)),
    top: Math.max(EDGE_GAP, Math.min(top, viewportHeight - height - EDGE_GAP)),
  };
}
