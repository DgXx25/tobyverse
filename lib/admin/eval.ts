import { clipPrompt } from "@/lib/admin/playground";
import type { ChatToolCall, ChatToolName } from "@/lib/ai/tools";
import type {
  EvalCaseResult,
  EvalCaseSpec,
  EvalJudgeId,
  EvalSuiteId,
} from "@/types/admin";

export const EVAL_PROJECT_PREFIX = "eval-";
export const EVAL_FOLLOWUP_TOPIC = "ევროპის დედაქალაქები";
export const EVAL_FIXTURE_COUNT = 5;

export const EVAL_SUITE_IDS: EvalSuiteId[] = ["core", "practice", "sheet"];

export const EVAL_SUITE_META: Record<EvalSuiteId, { label: string; blurb: string }> = {
  core: { label: "Core tools", blurb: "8-step capitals fixture: answer, practice, edit, sheet" },
  practice: { label: "Practice quality", blurb: "Create a set and inspect the first items" },
  sheet: { label: "Sheet quality", blurb: "Create a sheet and inspect the markdown" },
};

const CORE_CASES: EvalCaseSpec[] = [
  {
    id: "1",
    prompt: "რა არის დედაქალაქი?",
    expected: "answer | short clarify (no create)",
    judge: "core-1",
  },
  {
    id: "2",
    prompt: "მინდა ვივარჯიშო დედაქალაქებზე",
    expected: "clarify | create_practice",
    judge: "core-2",
  },
  {
    id: "3",
    prompt: EVAL_FOLLOWUP_TOPIC,
    expected: "create_practice + card",
    judge: "core-3",
    skipIfPracticeExists: true,
  },
  {
    id: "4",
    prompt: "გაამარტივე კითხვები",
    expected: "edit_practice (same set id)",
    judge: "core-4",
  },
  {
    id: "5",
    prompt: "დაამატე 3",
    expected: "append_practice (same set, count+)",
    judge: "core-5",
  },
  {
    id: "6",
    prompt: "რა სეტი მაქვს?",
    expected: "answer names the active set",
    judge: "core-6",
  },
  {
    id: "7",
    prompt: "კონსპექტი დამიწერე ამაზე",
    expected: "create_sheet | clarify → sheet",
    judge: "core-7",
    followupIfClarify: true,
  },
  {
    id: "8",
    prompt: "უფრო მოკლე ქნი",
    expected: "edit_sheet (same sheet id)",
    judge: "core-8",
  },
];

export const EVAL_SUITES: Record<EvalSuiteId, EvalCaseSpec[]> = {
  core: CORE_CASES,
  practice: [
    {
      id: "1",
      prompt: "მინდა ვივარჯიშო ევროპის დედაქალაქებზე",
      expected: "create_practice + items",
      judge: "practice-create",
      followupIfClarify: true,
      useVariantAsPrompt: true,
    },
  ],
  sheet: [
    {
      id: "1",
      prompt: "კონსპექტი დამიწერე ევროპის დედაქალაქებზე",
      expected: "create_sheet + markdown",
      judge: "sheet-create",
      followupIfClarify: true,
      useVariantAsPrompt: true,
    },
  ],
};

/** @deprecated use EVAL_SUITES.core */
export const EVAL_CASES = CORE_CASES;

export type EvalJudgeContext = {
  tool: ChatToolCall;
  text: string;
  chips: boolean;
  created: boolean;
  card: boolean;
  practiceId: string | null;
  prevPracticeId: string | null;
  practiceCount: number | null;
  prevPracticeCount: number | null;
  sheetId: string | null;
  prevSheetId: string | null;
  practiceTitle: string | null;
  skipped?: boolean;
  followupTool?: ChatToolCall | null;
  itemsCount?: number;
  sheetChars?: number;
};

const CREATE_TOOLS = new Set<ChatToolName>(["create_practice", "create_sheet"]);
const SET_HINT = /სეტ|ვარჯიშ|practice|set|დედაქალაქ|ევროპ/i;
const DENY_SET = /არ მაქვს|არ გაქვს|no set|don't have|does not have|არ არის სეტ/i;

export function isEvalSuiteId(value: unknown): value is EvalSuiteId {
  return value === "core" || value === "practice" || value === "sheet";
}

export function isEvalProjectTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith(EVAL_PROJECT_PREFIX);
}

export function evalProjectTitle(suiteId: EvalSuiteId): string {
  return `${EVAL_PROJECT_PREFIX}${suiteId}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
}

export function looksLikeLongEssay(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 400) return true;
  return trimmed.split(/\n\s*\n/).filter(Boolean).length >= 3;
}

export function isShortClarify(tool: ChatToolCall, text: string): boolean {
  if (tool.name !== "clarify") return false;
  const body = (text || tool.args.question || "").trim();
  if (!body) return false;
  return body.length <= 280 && body.split(/\n\s*\n/).filter(Boolean).length <= 1;
}

export function lineNote(...parts: Array<string | false | null | undefined>): string {
  return clipPrompt(parts.filter((item): item is string => Boolean(item)).join(" · "), 120);
}

export function resolveEvalPrompt(spec: EvalCaseSpec, variant: string): string {
  const extra = variant.trim();
  if (spec.useVariantAsPrompt && extra) return extra;
  if (spec.prompt === EVAL_FOLLOWUP_TOPIC) return extra || EVAL_FOLLOWUP_TOPIC;
  if (!extra) return spec.prompt;
  return `${extra}\n\n${spec.prompt}`;
}

export function resolveFollowupTopic(variant: string): string {
  return variant.trim() || EVAL_FOLLOWUP_TOPIC;
}

function toolLabel(tool: ChatToolCall, extra?: string): string {
  const bits: string[] = [tool.name];
  if (tool.name === "suggest_practice" || tool.name === "suggest_sheet") bits.push("chip");
  if (extra) bits.push(extra);
  return bits.join(" ");
}

export function judgeEvalCase(judge: EvalJudgeId, ctx: EvalJudgeContext): Pick<EvalCaseResult, "actual" | "pass" | "note"> {
  if (judge === "core-1") {
    const created = CREATE_TOOLS.has(ctx.tool.name);
    const shortClarify = isShortClarify(ctx.tool, ctx.text);
    const ok =
      !created &&
      (ctx.tool.name === "answer" ||
        ctx.tool.name === "suggest_practice" ||
        ctx.tool.name === "suggest_sheet" ||
        shortClarify);
    return {
      actual: toolLabel(ctx.tool, created ? "created" : shortClarify ? "short clarify" : ctx.chips ? "chip" : undefined),
      pass: ok,
      note: created
        ? lineNote("created an artifact on a definition question")
        : lineNote(
            shortClarify ? "short clarify" : "answered",
            ctx.chips && "chip offered (optional)",
          ),
    };
  }

  if (judge === "core-2") {
    const ok = ctx.tool.name === "clarify" || ctx.tool.name === "create_practice";
    const essay = ctx.tool.name === "answer" || ctx.tool.name === "suggest_practice" || ctx.tool.name === "suggest_sheet";
    return {
      actual: toolLabel(ctx.tool, ctx.card ? "card" : undefined),
      pass: ok,
      note: ok
        ? lineNote(ctx.tool.name, ctx.card && "card ready")
        : lineNote(
            essay && looksLikeLongEssay(ctx.text) && "long essay only",
            !ok && `${ctx.tool.name} instead of clarify/create_practice`,
          ),
    };
  }

  if (judge === "core-3") {
    if (ctx.skipped) {
      return {
        actual: "skipped",
        pass: Boolean(ctx.practiceId),
        note: lineNote("practice already created"),
      };
    }
    const ok = ctx.tool.name === "create_practice" && ctx.card && Boolean(ctx.practiceId);
    return {
      actual: toolLabel(ctx.tool, ctx.card ? "card" : "no card"),
      pass: ok,
      note: ok ? lineNote("created set", ctx.practiceId && `id ${ctx.practiceId.slice(0, 8)}`) : lineNote("expected create_practice + card"),
    };
  }

  if (judge === "core-4") {
    const same = Boolean(ctx.practiceId && ctx.prevPracticeId && ctx.practiceId === ctx.prevPracticeId);
    const ok = ctx.tool.name === "edit_practice" && same;
    return {
      actual: toolLabel(ctx.tool, same ? "same id" : ctx.practiceId ? "id changed" : "no set"),
      pass: ok,
      note: ok ? lineNote("edited same set") : lineNote("need edit_practice on the same set id"),
    };
  }

  if (judge === "core-5") {
    const same = Boolean(ctx.practiceId && ctx.prevPracticeId && ctx.practiceId === ctx.prevPracticeId);
    const grew =
      ctx.practiceCount != null &&
      ctx.prevPracticeCount != null &&
      ctx.practiceCount > ctx.prevPracticeCount;
    const ok = ctx.tool.name === "append_practice" && same && grew;
    return {
      actual: toolLabel(
        ctx.tool,
        grew ? `${ctx.prevPracticeCount}→${ctx.practiceCount}` : same ? "count unchanged" : "no set",
      ),
      pass: ok,
      note: ok
        ? lineNote("appended", `${ctx.prevPracticeCount}→${ctx.practiceCount}`)
        : lineNote("need append on same set with higher count"),
    };
  }

  if (judge === "core-6") {
    const named = SET_HINT.test(ctx.text) && !DENY_SET.test(ctx.text);
    const ok = ctx.tool.name === "answer" && named && Boolean(ctx.text.trim());
    return {
      actual: toolLabel(ctx.tool, named ? "named set" : "did not name set"),
      pass: ok,
      note: ok
        ? lineNote("named active set", ctx.practiceTitle)
        : lineNote(ctx.tool.name !== "answer" ? `got ${ctx.tool.name}` : "reply did not name the active set"),
    };
  }

  if (judge === "core-7" || judge === "sheet-create") {
    const follow = ctx.followupTool;
    const created =
      (ctx.tool.name === "create_sheet" || follow?.name === "create_sheet") && Boolean(ctx.sheetId);
    const viaClarify = ctx.tool.name === "clarify" && follow?.name === "create_sheet";
    const hasBody = judge === "sheet-create" ? (ctx.sheetChars ?? 0) > 40 : true;
    const ok = created && hasBody;
    return {
      actual: viaClarify
        ? "clarify → create_sheet"
        : toolLabel(ctx.tool, ctx.sheetId ? "sheet" : undefined),
      pass: ok,
      note: ok
        ? lineNote(viaClarify ? "clarify then sheet" : "created sheet", judge === "sheet-create" && `${ctx.sheetChars} chars`)
        : lineNote("expected create_sheet or clarify then sheet"),
    };
  }

  if (judge === "core-8") {
    const same = Boolean(ctx.sheetId && ctx.prevSheetId && ctx.sheetId === ctx.prevSheetId);
    const ok = ctx.tool.name === "edit_sheet" && same;
    return {
      actual: toolLabel(ctx.tool, same ? "same id" : ctx.sheetId ? "id changed" : "no sheet"),
      pass: ok,
      note: ok ? lineNote("rewrote same sheet") : lineNote("need edit_sheet on the same sheet id"),
    };
  }

  const follow = ctx.followupTool;
  const created =
    (ctx.tool.name === "create_practice" || follow?.name === "create_practice") && Boolean(ctx.practiceId);
  const viaClarify = ctx.tool.name === "clarify" && follow?.name === "create_practice";
  const ok = created && (ctx.itemsCount ?? 0) > 0 && ctx.card;
  return {
    actual: viaClarify
      ? "clarify → create_practice"
      : toolLabel(ctx.tool, ctx.card ? `${ctx.itemsCount ?? 0} items` : "no card"),
    pass: ok,
    note: ok
      ? lineNote(viaClarify ? "clarify then set" : "created set", `${ctx.itemsCount} items`)
      : lineNote("expected create_practice with items"),
  };
}
