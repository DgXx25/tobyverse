import type { LessonRecipe } from "@/types/lesson";
import type { ProjectGoal } from "@/types/goals";

const RECIPES: Record<ProjectGoal, Omit<LessonRecipe, "id" | "goal">> = {
  exam_prep: {
    theoryCount: 6,
    problemCount: 8,
    essayCount: 1,
    theoryTypes: ["mcq", "true_false", "fill_blank"],
    problemTypes: ["problem_steps", "analysis"],
  },
  understand_topic: {
    theoryCount: 8,
    problemCount: 3,
    essayCount: 1,
    theoryTypes: ["mcq", "connect", "true_false", "open_short"],
    problemTypes: ["problem_steps", "case_tree"],
  },
  deep_understanding: {
    theoryCount: 6,
    problemCount: 5,
    essayCount: 2,
    theoryTypes: ["open_short", "connect", "fill_blank"],
    problemTypes: ["case_tree", "analysis", "problem_steps"],
  },
  practice: {
    theoryCount: 3,
    problemCount: 10,
    essayCount: 0,
    theoryTypes: ["mcq", "true_false", "fill_blank"],
    problemTypes: ["problem_steps"],
  },
  review: {
    theoryCount: 8,
    problemCount: 4,
    essayCount: 0,
    theoryTypes: ["mcq", "true_false", "connect"],
    problemTypes: ["problem_steps", "analysis"],
  },
};

export function recipeForGoal(goal: ProjectGoal): LessonRecipe {
  return {
    id: `recipe_${goal}_v1`,
    goal,
    ...RECIPES[goal],
  };
}

export function recipeTotals(recipe: LessonRecipe): number {
  return recipe.theoryCount + recipe.problemCount + recipe.essayCount;
}
