import type {
  ExerciseCategory,
  ExercisePayloadMap,
  ExerciseTemplate,
  ExerciseType,
  ProblemExerciseType,
  TheoryExerciseType,
} from "@/types/exercise";
import { PROBLEM_EXERCISE_TYPES, THEORY_EXERCISE_TYPES } from "@/types/exercise";

export const MCQ_TEMPLATE: ExerciseTemplate<"mcq"> = {
  type: "mcq",
  category: "theory",
  version: 1,
  label: "Multiple choice",
  description: "One question with several options and a single correct answer.",
  example: {
    question: "What is the derivative of x²?",
    options: [
      { id: "a", text: "x" },
      { id: "b", text: "2x" },
      { id: "c", text: "2" },
      { id: "d", text: "x²" },
    ],
    correctOptionId: "b",
    explanation: "Power rule: d/dx xⁿ = n xⁿ⁻¹.",
  },
};

export const CONNECT_TEMPLATE: ExerciseTemplate<"connect"> = {
  type: "connect",
  category: "theory",
  version: 1,
  label: "Connect",
  description: "Match items from two columns.",
  example: {
    prompt: "Match each term with its definition.",
    left: [
      { id: "l1", text: "Photosynthesis" },
      { id: "l2", text: "Mitosis" },
    ],
    right: [
      { id: "r1", text: "Cell division for growth" },
      { id: "r2", text: "Conversion of light into chemical energy" },
    ],
    pairs: [
      { leftId: "l1", rightId: "r2" },
      { leftId: "l2", rightId: "r1" },
    ],
  },
};

export const TRUE_FALSE_TEMPLATE: ExerciseTemplate<"true_false"> = {
  type: "true_false",
  category: "theory",
  version: 1,
  label: "True / false",
  description: "A statement that is either true or false.",
  example: {
    statement: "The mitochondria is the powerhouse of the cell.",
    answer: true,
    explanation: "It produces ATP through cellular respiration.",
  },
};

export const FILL_BLANK_TEMPLATE: ExerciseTemplate<"fill_blank"> = {
  type: "fill_blank",
  category: "theory",
  version: 1,
  label: "Fill in the blank",
  description: "Complete the sentence. Placeholders use {{blankId}}.",
  example: {
    text: "Water boils at {{temp}} °C at sea level.",
    blanks: [{ id: "temp", answers: ["100", "one hundred"] }],
  },
};

export const OPEN_SHORT_TEMPLATE: ExerciseTemplate<"open_short"> = {
  type: "open_short",
  category: "theory",
  version: 1,
  label: "Short answer",
  description: "A short free-text response with an optional rubric.",
  example: {
    prompt: "In one or two sentences, define osmosis.",
    sampleAnswer: "Osmosis is the diffusion of water across a semipermeable membrane.",
    rubric: ["Mentions water", "Mentions membrane / concentration gradient"],
    maxLength: 280,
  },
};

export const PROBLEM_STEPS_TEMPLATE: ExerciseTemplate<"problem_steps"> = {
  type: "problem_steps",
  category: "problems",
  version: 1,
  label: "Step-by-step problem",
  description: "A problem solved through ordered steps. Hints support socratic mode.",
  example: {
    problem: "Solve 2x + 4 = 12.",
    steps: [
      { id: "s1", prompt: "Isolate the term with x.", expected: "2x = 8", hint: "Move the constant to the other side." },
      { id: "s2", prompt: "Solve for x.", expected: "x = 4", hint: "Divide both sides by 2." },
    ],
    finalAnswer: "x = 4",
  },
};

export const CASE_TREE_TEMPLATE: ExerciseTemplate<"case_tree"> = {
  type: "case_tree",
  category: "problems",
  version: 1,
  label: "Case + decision tree",
  description: "A case study with branching decisions.",
  example: {
    scenario: "A patient presents with fever and a rash. Choose the next diagnostic step.",
    rootNodeId: "n1",
    nodes: [
      {
        id: "n1",
        prompt: "What do you do first?",
        choices: [
          { id: "c1", label: "Take a history", nextNodeId: "n2", isCorrect: true },
          { id: "c2", label: "Start antibiotics immediately", nextNodeId: null, isCorrect: false },
        ],
      },
      {
        id: "n2",
        prompt: "History suggests a viral illness. Next?",
        choices: [
          { id: "c3", label: "Supportive care", nextNodeId: null, isCorrect: true },
        ],
      },
    ],
  },
};

export const ESSAY_TEMPLATE: ExerciseTemplate<"essay"> = {
  type: "essay",
  category: "problems",
  version: 1,
  label: "Essay",
  description: "A longer written response scored against a rubric.",
  example: {
    prompt: "Explain how supply and demand determine market price.",
    minWords: 150,
    maxWords: 400,
    rubric: [
      { criterion: "Defines supply and demand", weight: 0.3 },
      { criterion: "Explains equilibrium", weight: 0.4 },
      { criterion: "Uses an example", weight: 0.3 },
    ],
  },
};

export const ANALYSIS_TEMPLATE: ExerciseTemplate<"analysis"> = {
  type: "analysis",
  category: "problems",
  version: 1,
  label: "Analysis",
  description: "Analyze a source or dataset against given focus points.",
  example: {
    source: "A short excerpt from a historical speech.",
    prompt: "What is the speaker's main argument, and which rhetorical device is strongest?",
    focusPoints: ["Claim", "Evidence", "Rhetorical device"],
    sampleAnalysis: "The speaker argues for unity by repeating a central phrase.",
  },
};

export const PAPER_TEMPLATE: ExerciseTemplate<"paper"> = {
  type: "paper",
  category: "problems",
  version: 1,
  label: "Form paper",
  description: "A real-layout writing sheet. form picks the template; only brief/given change.",
  example: {
    form: "ganckhadeba",
    brief: "დაწერე განცხადება სკოლის დირექტორის სახელზე: ოჯახური მიზეზით 3 დღე გააცდინე.",
    given: { to: "სსიპ მე-12 საჯარო სკოლის დირექტორს" },
    rubric: [
      { criterion: "მიმართვა ზედა მარჯვნივ", weight: 0.2 },
      { criterion: "თხოვნა ნათელი და თავაზიანი", weight: 0.4 },
      { criterion: "თარიღი და სახელი", weight: 0.2 },
      { criterion: "ოფიციალური ქართული", weight: 0.2 },
    ],
  },
};

const BASE_TEMPLATES = {
  mcq: MCQ_TEMPLATE,
  connect: CONNECT_TEMPLATE,
  true_false: TRUE_FALSE_TEMPLATE,
  fill_blank: FILL_BLANK_TEMPLATE,
  open_short: OPEN_SHORT_TEMPLATE,
  problem_steps: PROBLEM_STEPS_TEMPLATE,
  case_tree: CASE_TREE_TEMPLATE,
  essay: ESSAY_TEMPLATE,
  analysis: ANALYSIS_TEMPLATE,
  paper: PAPER_TEMPLATE,
} as const satisfies { [K in ExerciseType]: ExerciseTemplate<K> };

const extraTemplates = new Map<string, ExerciseTemplate>();

export function getExerciseTemplate<T extends ExerciseType>(type: T): ExerciseTemplate<T> {
  const extra = extraTemplates.get(type);
  if (extra) {
    return extra as ExerciseTemplate<T>;
  }

  return BASE_TEMPLATES[type] as ExerciseTemplate<T>;
}

export function listExerciseTemplates(): ExerciseTemplate[] {
  const extras = [...extraTemplates.values()].filter(
    (template) => !(template.type in BASE_TEMPLATES),
  );
  return [...Object.values(BASE_TEMPLATES), ...extras];
}

export function templatesByCategory(category: ExerciseCategory): ExerciseTemplate[] {
  return listExerciseTemplates().filter((template) => template.category === category);
}

export function isTheoryType(type: string): type is TheoryExerciseType {
  return (THEORY_EXERCISE_TYPES as readonly string[]).includes(type);
}

export function isProblemType(type: string): type is ProblemExerciseType {
  return (PROBLEM_EXERCISE_TYPES as readonly string[]).includes(type);
}

export function isSupportedExerciseType(type: string): type is ExerciseType {
  return isTheoryType(type) || isProblemType(type);
}

export function exerciseTypeLabel(type: string): string {
  if (!isSupportedExerciseType(type)) return "Unsupported item";
  return getExerciseTemplate(type).label;
}

export function emptyPayload<T extends ExerciseType>(type: T): ExercisePayloadMap[T] {
  return structuredClone(getExerciseTemplate(type).example);
}

/**
 * Register a new exercise type at runtime. Prefer adding to BASE_TEMPLATES
 * and ExercisePayloadMap for compile-time safety.
 */
export function registerExerciseTemplate(template: ExerciseTemplate): void {
  extraTemplates.set(template.type, template);
}
