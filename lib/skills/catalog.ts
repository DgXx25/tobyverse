/** Safe to import with tool declarations: metadata only, never the guide bodies. */
export const RUNTIME_SKILL_CATALOG = [
  {
    name: "technical-problem-solving",
    description: "Use for nontrivial quantitative problems across mathematics, physics, and statistics: assumptions, units, choosing a method, and checking results.",
  },
  {
    name: "algebra-equations",
    description: "Use for linear or quadratic equations, factoring, domain restrictions, and checking candidate solutions.",
  },
  {
    name: "calculus-derivatives",
    description: "Use for differentiation with chain, product, or quotient rules and domain restrictions.",
  },
  {
    name: "statistics-estimation",
    description: "Use for sample means, sample standard deviation, standard errors, or confidence intervals and their assumptions.",
  },
  { name: "physics-reasoning", description: "Use for nontrivial physics explanations or calculations involving models, units, diagrams, or experimental evidence." },
  { name: "chemistry-reasoning", description: "Use for chemical equations, quantitative chemistry, reaction mechanisms, or molecular explanations." },
  { name: "biology-reasoning", description: "Use for biological mechanisms, structures, systems, or evidence-based explanations." },
  { name: "medicine-reasoning", description: "Use for clinical, anatomical, or pharmacological explanations that need careful terminology and context." },
  { name: "programming-reasoning", description: "Use for nontrivial programming, debugging, algorithms, or software design tasks." },
  { name: "history-reasoning", description: "Use for historical explanation, source analysis, chronology, causation, or competing interpretations." },
  { name: "law-reasoning", description: "Use when explaining legal texts, concepts, or cases; distinguish jurisdiction, rule, and interpretation." },
  { name: "economics-reasoning", description: "Use for economics or business analysis with assumptions, units, time periods, and causal relationships." },
  { name: "language-reasoning", description: "Use for nuanced grammar, usage, translation choices, or language learning; preserve the requested language and level." },
  { name: "humanities-reasoning", description: "Use for close reading, literary interpretation, argument analysis, or philosophical concepts." },
  { name: "geography-reasoning", description: "Use for spatial, climate, geological, or population patterns and their causes." },
  { name: "native-document-writing", description: "Use when a formal document should be delivered as TobyVerse's editable native paper sheet, including certificates, requests, or complaints." },
  { name: "native-chat-blocks", description: "Use when specialized in-chat blocks (titled sections, visual explanation with a relevant photo, dialogue, form, image list, or arithmetic grid) improve clarity or make an explanation easier to scan." },
] as const;

export function formatRuntimeSkillCatalog(): string {
  return RUNTIME_SKILL_CATALOG.map(({ name, description }) => `- ${name}: ${description}`).join("\n");
}
