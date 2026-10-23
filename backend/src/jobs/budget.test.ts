import assert from "node:assert/strict";
import test from "node:test";
import { assertBudgetAvailable } from "./budget.js";

test("a job is blocked when committed weekly cost reaches the user's allowance", () => {
  assert.throws(
    () => assertBudgetAvailable({ plan: "free_beta", weeklyBudgetMicros: 2_000_000, spentMicros: 2_000_000, model: "gemini-3.1-flash-lite" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "weekly_ai_budget_exhausted",
  );
});

test("free accounts cannot queue a paid-only model", () => {
  assert.throws(
    () => assertBudgetAvailable({ plan: "free_beta", weeklyBudgetMicros: 2_000_000, spentMicros: 0, model: "gemini-3.1-pro-preview" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "paid_model_required",
  );
});

test("admin access is not blocked by an exhausted weekly allowance", () => {
  assert.doesNotThrow(() => assertBudgetAvailable({
    plan: "admin",
    weeklyBudgetMicros: null,
    spentMicros: Number.MAX_SAFE_INTEGER,
    model: "gemini-3.1-pro-preview",
  }));
});
