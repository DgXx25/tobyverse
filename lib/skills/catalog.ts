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
] as const;

export function formatRuntimeSkillCatalog(): string {
  return RUNTIME_SKILL_CATALOG.map(({ name, description }) => `- ${name}: ${description}`).join("\n");
}
