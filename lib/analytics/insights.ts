import type { AnalyticsEvent, AnalyticsEventType } from "@/types/analytics";

export type InsightsSummary = {
  activeToday: number;
  active7d: number;
  projectsCreated: number;
  messagesSent: number;
  exercisesCompleted: number;
  exercisesStarted: number;
  completionRate: number | null;
  returnRate: number | null;
  hintRate: number | null;
  uniqueUsers: number;
  returningUsers: number;
  oneTimeUsers: number;
  theoryStarted: number;
  problemsStarted: number;
  dropoff: { chat: number; exercise: number; project: number };
  conclusions: string[];
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countType(events: AnalyticsEvent[], type: AnalyticsEventType): number {
  return events.filter((event) => event.type === type).length;
}

function uniqueUsers(events: AnalyticsEvent[]): Set<string> {
  return new Set(events.map((event) => event.userId).filter(Boolean));
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export function summarizeInsights(events: AnalyticsEvent[], now = new Date()): InsightsSummary {
  const today = startOfDay(now).getTime();
  const week = today - 6 * 24 * 60 * 60 * 1000;

  const parsed = events.map((event) => ({
    ...event,
    at: Date.parse(event.createdAt),
  }));

  const valid = parsed.filter((event) => Number.isFinite(event.at));
  const todayEvents = valid.filter((event) => event.at >= today);
  const weekEvents = valid.filter((event) => event.at >= week);

  const projectsCreated = countType(valid, "project_created");
  const messagesSent = countType(valid, "chat_message_sent");
  const exercisesStarted = countType(valid, "exercise_started");
  const exercisesCompleted = countType(valid, "exercise_completed");
  const hintUsed = countType(valid, "hint_mode_used");
  const returnedNext = uniqueUsers(valid.filter((event) => event.type === "returned_next_day"));
  const users = uniqueUsers(valid);
  const usersWithReturn = uniqueUsers(
    valid.filter(
      (event) => event.type === "returned_same_day" || event.type === "returned_next_day",
    ),
  );

  const dropoff = { chat: 0, exercise: 0, project: 0 };
  for (const event of valid.filter((item) => item.type === "dropped_off")) {
    if (event.value === "chat" || event.value === "exercise" || event.value === "project") {
      dropoff[event.value] += 1;
    }
  }

  const theoryStarted = valid.filter(
    (event) => event.type === "exercise_started" && event.value === "theory",
  ).length;
  const problemsStarted = valid.filter(
    (event) => event.type === "exercise_started" && event.value === "problems",
  ).length;

  const completionRate = pct(exercisesCompleted, exercisesStarted);
  const returnRate = pct(usersWithReturn.size, users.size);
  const hintRate = pct(hintUsed, messagesSent);

  const summary: InsightsSummary = {
    activeToday: uniqueUsers(todayEvents).size,
    active7d: uniqueUsers(weekEvents).size,
    projectsCreated,
    messagesSent,
    exercisesCompleted,
    exercisesStarted,
    completionRate,
    returnRate,
    hintRate,
    uniqueUsers: users.size,
    returningUsers: usersWithReturn.size,
    oneTimeUsers: Math.max(0, users.size - usersWithReturn.size),
    theoryStarted,
    problemsStarted,
    dropoff,
    conclusions: [],
  };

  summary.conclusions = buildConclusions(summary, returnedNext.size);
  return summary;
}

function buildConclusions(summary: InsightsSummary, nextDayReturns: number): string[] {
  const lines: string[] = [];

  if (summary.uniqueUsers === 0) {
    return ["No usage signals yet. Numbers will appear as people use the product."];
  }

  if (summary.completionRate !== null) {
    lines.push(`Users finish ${summary.completionRate}% of started exercises.`);
  } else {
    lines.push("No exercise completions yet — chat is the only live surface.");
  }

  if (summary.hintRate !== null) {
    lines.push(
      summary.hintRate >= 40
        ? `Hint mode is common (${summary.hintRate}% of messages).`
        : `Hint mode is used on ${summary.hintRate}% of messages.`,
    );
  }

  const dropTotal = summary.dropoff.chat + summary.dropoff.exercise + summary.dropoff.project;
  if (dropTotal > 0) {
    const top = (Object.entries(summary.dropoff) as [keyof typeof summary.dropoff, number][])
      .sort((a, b) => b[1] - a[1])[0];
    if (top[0] === "chat") {
      lines.push("Most drop-off happens in chat.");
    } else if (top[0] === "exercise") {
      lines.push("Most drop-off happens during exercises.");
    } else {
      lines.push("Most drop-off happens right after opening a project.");
    }
  }

  if (summary.returnRate !== null) {
    lines.push(
      summary.returnRate >= 40
        ? `${summary.returnRate}% of users come back.`
        : `Only ${summary.returnRate}% of users return. ${nextDayReturns} came back the next day.`,
    );
  }

  if (summary.theoryStarted + summary.problemsStarted > 0) {
    const theoryShare = pct(summary.theoryStarted, summary.theoryStarted + summary.problemsStarted) ?? 0;
    lines.push(
      theoryShare >= 55
        ? "Exercise starts lean toward theory, not problems."
        : "Exercise starts lean toward problems more than theory.",
    );
  }

  return lines.slice(0, 4);
}
