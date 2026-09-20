export const VISUAL_TYPES = [
  "section",
  "term_card",
  "concept_row",
  "compare_vs",
  "formula_card",
  "diagram",
  "graph",
  "highlight",
  "table",
  "steps",
  "example",
  "pitfall",
  "sparkline",
  "source_image",
  "embed",
  "cluster",
  "flow",
  "walk",
  "from_to",
] as const;

export type VisualType = (typeof VISUAL_TYPES)[number];

/** Add a type + renderer. Do not delete old fields. Bump schemaVersion. */

export const EMBED_KINDS = ["icon", "flag", "element", "compound", "emoji"] as const;

export type EmbedKind = (typeof EMBED_KINDS)[number];

export const CATALOG_KINDS = ["icon", "flag", "element", "formula", "slide", "none"] as const;

export type CatalogKind = (typeof CATALOG_KINDS)[number];

export type CatalogRef = {
  kind: CatalogKind;
  id: string;
};

export type ExerciseVisual = CatalogRef & {
  placement: "after_question" | "in_option";
};

export type FromToEmbedVisual = {
  kind: EmbedKind;
  id: string;
  label?: string;
};

export type FromToSide = {
  formula?: string;
  text?: string;
  embed?: FromToEmbedVisual;
};

export type FromToEmbed = {
  via?: string;
  left: FromToSide;
  right: FromToSide;
};

export type TermCardFields = {
  title: string;
  text: string;
  icon?: string;
  iconName?: string;
  emoji?: string;
  from_to?: FromToEmbed;
};

export type SectionVisual = {
  type: "section";
  title?: string;
  text: string;
  from_to?: FromToEmbed;
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
  /** What the formula is saying, in ordinary words. */
  text?: string;
  formula: string;
};

export type DiagramVisual = {
  type: "diagram";
  title?: string;
  text: string;
};

export type GraphVisual = {
  type: "graph";
  title?: string;
  slope?: number;
  intercept?: number;
  points?: number[];
  caption?: string;
};

export type HighlightVisual = {
  type: "highlight";
  text: string;
  from_to?: FromToEmbed;
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
  steps?: string[];
  from_to?: FromToEmbed;
};

export type PitfallVisual = {
  type: "pitfall";
  text: string;
  from_to?: FromToEmbed;
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

export type EmbedVisual = {
  type: "embed";
  kind: EmbedKind;
  id: string;
  label?: string;
  text?: string;
};

export type ClusterItem = {
  title: string;
  text?: string;
  icon?: string;
  emoji?: string;
};

export type ClusterVisual = {
  type: "cluster";
  center: string;
  items: ClusterItem[];
};

export type FlowVisual = {
  type: "flow";
  title?: string;
  items: string[];
};

export type WalkSlide = {
  title?: string;
  formula?: string;
  text?: string;
  from_to?: FromToEmbed;
};

export type WalkVisual = {
  type: "walk";
  title?: string;
  slides: WalkSlide[];
};

export type FromToVisual = {
  type: "from_to";
  title?: string;
} & FromToEmbed;

export type VisualBlock =
  | SectionVisual
  | TermCardVisual
  | ConceptRowVisual
  | CompareVsVisual
  | FormulaCardVisual
  | DiagramVisual
  | GraphVisual
  | HighlightVisual
  | TableVisual
  | StepsVisual
  | ExampleVisual
  | PitfallVisual
  | SparklineVisual
  | SourceImageVisual
  | EmbedVisual
  | ClusterVisual
  | FlowVisual
  | WalkVisual
  | FromToVisual;

export type InvalidVisual = {
  type: "invalid";
  message: string;
};

export type NoteBlock = VisualBlock | InvalidVisual;
