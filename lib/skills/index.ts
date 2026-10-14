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
      "Write math with $...$ inline and $$...$$ for a displayed equation, equation only. When asked to solve, show the working one step per line and state the final answer plainly; when asked only for a result or a formula, give just that. Keep units, domains and assumptions explicit.",
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
      "Use the exact term and give a plain-language gloss once. Describe a process in the order it happens, and say where in the cell or organism it takes place. Keep structure and function together.",
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
      "Define a term in a clause, state the direction of an effect and why, and keep units and time periods explicit. Use a table only when comparing two or more cases side by side.",
  },
  {
    id: "language",
    label: "Language learning",
    keywords: [
      "grammar", "vocabular", "tense", "verb", "pronunciation", "idiom", "ielts", "toefl", "b1", "b2", "c1", "linguistic", "syntax",
      "გრამატიკ", "ლექსიკ", "დრო ", "ზმნა", "გამოთქმ", "იდიომ", "ენათმეცნიერ", "სინტაქს", "მართლწერ",
    ],
    write:
      "For a rule, give the pattern, when to reach for it, and one tight natural example. Translate only when asked or when it unlocks the example. Keep target-language examples idiomatic and short.",
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

const MATCHERS = new Map<string, RegExp[]>();

function matchersFor(skill: SubjectSkill): RegExp[] {
  let cached = MATCHERS.get(skill.id);
  if (!cached) {
    cached = skill.keywords.map((word) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(word.trim())}`, "iu"));
    MATCHERS.set(skill.id, cached);
  }
  return cached;
}

function distinctHits(skill: SubjectSkill, text: string): number {
  if (!text) return 0;
  let hits = 0;
  for (const pattern of matchersFor(skill)) if (pattern.test(text)) hits += 1;
  return hits;
}

export type SkillSignals = {
  prompt?: string;
  projectTitle?: string;
  materialNames?: readonly string[];
  /** Retrieved passage text for this turn. Only the start is looked at. */
  sourceText?: string;
};

const MIN_SCORE = 3;
const SOURCE_SCAN_CHARS = 6000;

/** Weighted keyword evidence: what they ask and name counts more than what the sources happen to contain. */
export function scoreSkills(signals: SkillSignals): { skill: SubjectSkill; score: number }[] {
  const prompt = signals.prompt ?? "";
  const title = signals.projectTitle ?? "";
  const names = (signals.materialNames ?? []).join("\n");
  const source = (signals.sourceText ?? "").slice(0, SOURCE_SCAN_CHARS);
  return SUBJECT_SKILLS.map((skill) => ({
    skill,
    score: distinctHits(skill, prompt) * 2 + distinctHits(skill, title) * 2 + distinctHits(skill, names) * 2 + distinctHits(skill, source),
  })).sort((a, b) => b.score - a.score);
}

/** The one skill that clearly fits, or null. A tie or weak evidence means no skill rather than a wrong one. */
export function detectSubjectSkill(signals: SkillSignals): SubjectSkill | null {
  const [best, next] = scoreSkills(signals);
  if (!best || best.score < MIN_SCORE) return null;
  if (next && next.score === best.score) return null;
  return best.skill;
}

export function formatSkillBlock(skill: SubjectSkill | null): string {
  if (!skill) return "";
  return `Writing conventions for ${skill.label.toLowerCase()} (wording and notation only; they add no lesson, quiz or recap, and the request still comes first): ${skill.write}`;
}
