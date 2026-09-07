export const VISUAL_TYPES = [
  "term_card",
  "concept_row",
  "compare_vs",
  "formula_card",
  "table",
  "steps",
  "example",
  "pitfall",
  "sparkline",
  "source_image",
] as const;

export type VisualType = (typeof VISUAL_TYPES)[number];

/** Add a type + renderer. Do not delete old fields. Bump schemaVersion. */

export const CATALOG_KINDS = ["icon", "flag", "element", "formula", "slide", "none"] as const;

export type CatalogKind = (typeof CATALOG_KINDS)[number];

export type CatalogRef = {
  kind: CatalogKind;
  id: string;
};

export type ExerciseVisual = CatalogRef & {
  placement: "after_question" | "in_option";
};

export type TermCardFields = {
  title: string;
  text: string;
  icon?: string;
  iconName?: string;
};

export type TermCardVisual = {
  type: "term_card";
} & TermCardFields;

export type ConceptRowVisual = {
  type: "concept_row";
  items: TermCardFields[];
};

export type CompareVsVisual = {
  type: "compare_vs";
  title?: string;
  left: TermCardFields;
  right: TermCardFields;
};

export type FormulaCardVisual = {
  type: "formula_card";
  title?: string;
  formula: string;
};

export type TableVisual = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type StepsVisual = {
  type: "steps";
  items: string[];
};

export type ExampleVisual = {
  type: "example";
  text: string;
};

export type PitfallVisual = {
  type: "pitfall";
  text: string;
};

export type SparklineVisual = {
  type: "sparkline";
  title?: string;
  points: number[];
  caption?: string;
};

export type SourceImageVisual = {
  type: "source_image";
  path: string;
  slide?: number;
  caption?: string;
};

export type VisualBlock =
  | TermCardVisual
  | ConceptRowVisual
  | CompareVsVisual
  | FormulaCardVisual
  | TableVisual
  | StepsVisual
  | ExampleVisual
  | PitfallVisual
  | SparklineVisual
  | SourceImageVisual;

export type InvalidVisual = {
  type: "invalid";
  message: string;
};

export type NoteBlock = VisualBlock | InvalidVisual;
