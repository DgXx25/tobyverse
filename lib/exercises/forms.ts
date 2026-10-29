import type { PaperFormId } from "@/types/exercise";

export type PaperFormDef = {
  id: PaperFormId;
  title: string;
};

/** Printed layouts. Add a form here, then a branch in PaperPlay. The model fills brief/given/sample. */
export const PAPER_FORM_DEFS: Record<PaperFormId, PaperFormDef> = {
  ganckhadeba: { id: "ganckhadeba", title: "განცხადება" },
  certificate: { id: "certificate", title: "ცნობა / Certificate" },
};

export function paperFormTitle(form: PaperFormId): string {
  return PAPER_FORM_DEFS[form]?.title ?? form;
}
