/**
 * Subject skills: how to write in a subject. They shape wording and notation only.
 * They never add a lesson, a quiz, a recap or any other format on their own: the user's
 * request still comes first (docs/mindset.md). A skill rides along only when the notebook,
 * the question or the retrieved passages clearly belong to that subject.
 */

export type SubjectSkill = {
  id: string;
  label: string;
  /** Word stems, matched at a word start (Latin and Georgian). */
  keywords: readonly string[];
  /** One compact paragraph of writing conventions. */
  write: string;
};

export const SUBJECT_SKILLS: readonly SubjectSkill[] = [
  {
    id: "math",
    label: "Mathematics",
    keywords: [
      "math", "algebra", "calculus", "derivativ", "integral", "equation", "function", "theorem", "geometr", "trigonometr",
      "matrix", "probabilit", "statistic", "logarithm", "polynomial",
      "მათემატ", "ალგებრ", "გეომეტრ", "წარმოებული", "ინტეგრალ", "განტოლებ", "ფუნქცი", "თეორემ", "ალბათობ", "სტატისტიკ", "ტრიგონომეტრ",
    ],
    write:
      "Use $...$ for arithmetic expressions, even simple ones; keep final values, units and surrounding prose ordinary. For multi-step equation solutions, show all transitions in one $$...$$ block using \\begin{aligned}, one equation per row. Avoid inline prose and arrow chains. Add only an optional short purpose note if useful or requested; explain the goal, not the operation. Keep one-step calculations inline, state the answer plainly, and make units, domains and assumptions explicit.",
  },
  {
    id: "physics",
    label: "Physics",
    keywords: [
      "physic", "mechanic", "kinematic", "newton", "thermodynamic", "electromagnet", "optics", "quantum", "relativity", "velocity",
      "acceleration", "momentum", "voltage", "circuit",
      "ფიზიკ", "მექანიკ", "კინემატიკ", "ნიუტონ", "თერმოდინამიკ", "ოპტიკ", "სიჩქარ", "აჩქარებ", "ძაბვა", "დენის",
    ],
    write:
      "Name the physical idea before the formula, write formulas in $...$ with SI units, and say what each symbol stands for only when it is not obvious. In a calculation keep units through every line and check the order of magnitude of the result.",
  },
  {
    id: "chemistry",
    label: "Chemistry",
    keywords: [
      "chemi", "molecul", "reaction", "organic", "periodic table", "stoichiometr", "acid", "oxidation", "compound", "titration",
      "ქიმი", "მოლეკულ", "რეაქცი", "ორგანულ", "მჟავა", "ჟანგვა", "ნაერთ", "ელემენტთა",
    ],
    write:
      "Use proper notation: formulas such as $H_2SO_4$, balanced equations with states and conditions, and the name next to the formula the first time. For a mechanism or a synthesis, go in the order the steps happen.",
  },
  {
    id: "biology",
    label: "Biology",
    keywords: [
      "biolog", "cell", "genetic", "evolution", "ecosystem", "photosynthes", "protein", "enzyme", "organism", "species", "dna", "rna",
      "ბიოლოგ", "უჯრედ", "გენეტიკ", "ევოლუცი", "ეკოსისტემ", "ფოტოსინთეზ", "ცილა", "ფერმენტ", "ორგანიზმ", "ბიოსფერო",
    ],
    write:
      "Introduce only the biological terms needed for the question, with a brief plain-language gloss when useful. If the requested depth calls for a mechanism, explain it in causal order and connect the relevant structure with its function. A definition need not cover locations, stages, and the full mechanism.",
  },
  {
    id: "medicine",
    label: "Medicine and anatomy",
    keywords: [
      "medicin", "anatom", "physiolog", "pathology", "pharmac", "clinical", "diagnos", "symptom", "disease", "patient", "surgery",
      "მედიცინ", "ანატომი", "ფიზიოლოგი", "პათოლოგი", "ფარმაკოლოგ", "კლინიკ", "დიაგნოზ", "სიმპტომ", "დაავადებ", "პაციენტ", "ქირურგი",
    ],
    write:
      "Use standard terminology with a short plain gloss the first time. Explain a condition as cause, mechanism, presentation, then management, but only the parts that were asked about. Keep doses and thresholds exactly as the source states them.",
  },
  {
    id: "history",
    label: "History",
    keywords: [
      "histor", "century", "dynasty", "revolution", "empire", "medieval", "ancient", "war of", "treaty", "reign",
      "ისტორი", "საუკუნ", "დინასტი", "რევოლუცი", "იმპერი", "შუა საუკუნე", "ომი", "ხელშეკრულებ", "მეფობ",
    ],
    write:
      "Give dates and names exactly, put causes before consequences, and keep established fact apart from interpretation. When sources disagree, say whose view is whose.",
  },
  {
    id: "law",
    label: "Law",
    keywords: [
      "law", "legal", "statute", "constitution", "contract", "liability", "court", "criminal", "civil code", "article ",
      "სამართ", "კანონ", "კონსტიტუცი", "ხელშეკრულებ", "პასუხისმგებლობ", "სასამართლო", "სისხლის", "სამოქალაქო", "მუხლი",
    ],
    write:
      "State the rule, then its exception or condition, and cite the article or section as the source gives it. Keep a rule apart from its application to a case. Do not present a reading of the law as advice for a specific situation.",
  },
  {
    id: "economics",
    label: "Economics and business",
    keywords: [
      "econom", "market", "inflation", "supply", "demand", "gdp", "fiscal", "monetary", "accounting", "finance", "marketing", "profit",
      "ეკონომიკ", "ბაზარ", "ინფლაცი", "მიწოდებ", "მოთხოვნ", "მშპ", "ფისკალურ", "მონეტარულ", "ბუღალტ", "ფინანს", "მარკეტინგ", "მოგება",
    ],
    write:
      "When relevant, define unfamiliar terms briefly, explain the direction of an effect, and keep units and time periods explicit. A table can help compare cases across several attributes.",
  },
  {
    id: "language",
    label: "Language learning",
    keywords: [
      "grammar", "vocabular", "tense", "verb", "pronunciation", "idiom", "ielts", "toefl", "b1", "b2", "c1", "linguistic", "syntax",
      "გრამატიკ", "ლექსიკ", "დრო ", "ზმნა", "გამოთქმ", "იდიომ", "ენათმეცნიერ", "სინტაქს", "მართლწერ",
    ],
    write:
      "For a requested grammar explanation, a pattern, usage context, and a natural example can help. Keep target-language examples idiomatic. For translations or edits, follow the requested task and level of detail.",
  },
  {
    id: "programming",
    label: "Programming",
    keywords: [
      "program", "code", "coding", "software", "algorithm", "javascript", "typescript", "python", "java ", "database", "sql", "function(", "api",
      "პროგრამირ", "კოდ", "ალგორითმ", "პითონ", "ბაზა", "მონაცემთა ბაზ",
    ],
    write:
      "Put code in fenced blocks tagged with the language, keep snippets minimal and runnable, and explain only what is not obvious from the code. Keep identifiers exactly as written and never describe code you did not show.",
  },
  {
    id: "literature",
    label: "Literature and humanities",
    keywords: [
      "literatur", "novel", "poem", "poetry", "author", "philosoph", "essay", "narrat", "metaphor", "theme of",
      "ლიტერატურ", "რომან", "ლექსი", "პოეზი", "ავტორ", "ფილოსოფი", "ესე", "მეტაფორ", "თემა",
    ],
    write:
      "Quote briefly and name where the quote comes from. Keep what the text says apart from your interpretation, and support an interpretation with the passage rather than asserting it.",
  },
  {
    id: "geography",
    label: "Geography and earth science",
    keywords: [
      "geograph", "climate", "geolog", "tectonic", "ocean", "continent", "population", "erosion", "atmospher",
      "გეოგრაფი", "კლიმატ", "გეოლოგი", "ტექტონიკ", "ოკეანე", "კონტინენტ", "მოსახლეობ", "ატმოსფერო",
    ],
    write:
      "Name places exactly, give figures with their units and year, and link a pattern to its cause. A table suits comparing regions or periods.",
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// These stems occur frequently outside their subject; repetition is not stronger evidence.
const AMBIGUOUS = new Set([
  "function", "code", "program", "api", "cell", "reaction", "organic", "compound", "acid",
  "market", "supply", "demand", "profit", "patient", "article", "contract", "population",
  "author", "novel", "narrat", "verb", "tense", "syntax", "law", "mechanic", "velocity",
  "თემა", "კოდ", "ბაზა", "ბაზარ", "მიწოდებ", "მოთხოვნ", "მოგება", "რეაქცი",
  "ნაერთ", "პაციენტ", "მუხლი", "ავტორ", "მოსახლეობ", "სიჩქარ", "დრო", "ფუნქცი",
]);
const LATIN_STEMS = new Set([
  "derivativ", "geometr", "trigonometr", "probabilit", "statistic", "physic", "mechanic",
  "kinematic", "thermodynamic", "electromagnet", "chemi", "molecul", "stoichiometr",
  "biolog", "genetic", "ecosystem", "photosynthes", "organism", "medicin", "anatom",
  "physiolog", "pharmac", "diagnos", "symptom", "histor", "econom", "program", "vocabular",
  "linguistic", "literatur", "philosoph", "narrat", "geograph", "geolog", "atmospher",
]);
const MATCHERS = new Map<string, { pattern: RegExp; strong: boolean }[]>();

function matchersFor(skill: SubjectSkill): { pattern: RegExp; strong: boolean }[] {
  let cached = MATCHERS.get(skill.id);
  if (!cached) {
    cached = skill.keywords.map((word) => {
      const term = word.trim();
      // Keep intentional stems and Georgian inflections; complete words and level codes need an end boundary.
      const suffix = term === "math" ? "(?:s|ematics|ematical)?"
        : term === "physic" ? "(?:s|ist(?:s)?)"
        : LATIN_STEMS.has(term) || /[ა-ჰ]/u.test(term) ? "[\\p{L}]*"
        : /[a-z]$/i.test(term) ? "(?:s|es)?" : "";
      return {
        pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(term)}${suffix}(?=$|[^\\p{L}\\p{N}])`, "iu"),
        strong: !AMBIGUOUS.has(term),
      };
    });
    MATCHERS.set(skill.id, cached);
  }
  return cached;
}

function distinctHits(skill: SubjectSkill, text: string, strongOnly = false): number {
  if (!text) return 0;
  let hits = 0;
  for (const { pattern, strong } of matchersFor(skill)) {
    if ((!strongOnly || strong) && pattern.test(text)) hits += 1;
  }
  return hits;
}

export type SkillSignals = {
  prompt?: string;
  projectTitle?: string;
  materialNames?: readonly string[];
  /** Retrieved passage text for this turn. Only the start is looked at. */
  sourceText?: string;
};

const SOURCE_SCAN_CHARS = 6000;

/** Only qualified evidence scores. Current clear topics outrank possibly stale project metadata. */
export function scoreSkills(signals: SkillSignals): { skill: SubjectSkill; score: number }[] {
  const prompt = signals.prompt ?? "";
  const title = signals.projectTitle ?? "";
  const names = (signals.materialNames ?? []).join("\n");
  const source = (signals.sourceText ?? "").slice(0, SOURCE_SCAN_CHARS);
  const hasClearQuestion = SUBJECT_SKILLS.some((skill) => distinctHits(skill, prompt, true) > 0);
  return SUBJECT_SKILLS.map((skill) => {
    const questionHits = distinctHits(skill, prompt, true);
    if (hasClearQuestion) return { skill, score: questionHits * 3 };
    const isSubjectName = (value: string) => [skill.id, skill.label.toLowerCase()].includes(value.trim().toLowerCase());
    const namedHits = distinctHits(skill, title, true) + distinctHits(skill, names, true) +
      (isSubjectName(title) || signals.materialNames?.some(isSubjectName) ? 1 : 0);
    const sourceHits = distinctHits(skill, source);
    // One specific named signal is enough; passages need several distinct terms, including a specific one.
    const sourceScore = sourceHits >= 3 && distinctHits(skill, source, true) > 0 ? sourceHits : 0;
    return { skill, score: namedHits * 3 + sourceScore };
  }).sort((a, b) => b.score - a.score);
}

/** The one skill that clearly fits, or null. A tie or weak evidence means no skill rather than a wrong one. */
export function detectSubjectSkill(signals: SkillSignals): SubjectSkill | null {
  const [best, next] = scoreSkills(signals);
  if (!best || best.score < 3) return null;
  if (next && best.score - next.score < 2) return null;
  return best.skill;
}

export function formatSkillBlock(skill: SubjectSkill | null): string {
  if (!skill) return "";
  return `Optional writing conventions for ${skill.label.toLowerCase()}. Apply only to relevant parts of the current request; these preferences do not require a lesson or a fixed structure. ${skill.write}`;
}
