import type { ChatToolCall, ChatToolName } from "@/lib/ai/tools";

export const TOOL_TIMEOUT_MS = 10_000;

export type ToolExecutionStatus = {
  call: ChatToolCall;
  phase: "start" | "complete" | "error";
  response?: unknown;
};

/** Public execution metadata only; no model reasoning. */
export type ToolStatusUpdate = {
  id: string;
  toolName: ChatToolName;
  phase: ToolExecutionStatus["phase"];
  status: string;
  detail?: string;
};

export function upsertToolStatus(rows: ToolStatusUpdate[], update: ToolStatusUpdate): ToolStatusUpdate[] {
  return rows.some((row) => row.id === update.id)
    ? rows.map((row) => row.id === update.id ? update : row)
    : [...rows, update].slice(-32);
}

/** Bound the wait even when a dependency ignores cancellation. */
export async function withToolTimeout<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = TOOL_TIMEOUT_MS): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(signal?.reason);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new Error("Tool timed out. Continue with a text answer using the available context; do not retry the tool.");
      error.name = "ToolTimeoutError";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), deadline]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

const labels: Record<ChatToolName, [string, string, string, string]> = {
  search_chat_history: ["Looking up earlier context…", "Earlier context found", "წინა საუბარში ვეძებ…", "წინა კონტექსტი მოიძებნა"],
  load_skill: ["Reading guide…", "Guide loaded", "გზამკვლევს ვკითხულობ…", "გზამკვლევი ჩაიტვირთა"],
  answer: ["Preparing answer…", "Answer ready", "პასუხს ვამზადებ…", "პასუხი მზადაა"],
  clarify: ["Preparing question…", "Question ready", "კითხვას ვამზადებ…", "კითხვა მზადაა"],
  illustrate: ["Creating illustration…", "Illustration ready", "ილუსტრაციას ვამზადებ…", "ილუსტრაცია მზადაა"],
  suggest_practice: ["Preparing suggestion…", "Suggestion ready", "შეთავაზებას ვამზადებ…", "შეთავაზება მზადაა"],
  suggest_sheet: ["Preparing suggestion…", "Suggestion ready", "შეთავაზებას ვამზადებ…", "შეთავაზება მზადაა"],
  suggest_path: ["Preparing suggestion…", "Suggestion ready", "შეთავაზებას ვამზადებ…", "შეთავაზება მზადაა"],
  create_practice: ["Creating practice…", "Practice ready", "სავარჯიშოს ვქმნი…", "სავარჯიშო მზადაა"],
  edit_practice: ["Updating practice…", "Practice updated", "სავარჯიშოს ვაახლებ…", "სავარჯიშო განახლდა"],
  append_practice: ["Adding practice items…", "Practice items added", "სავარჯიშოებს ვამატებ…", "სავარჯიშოები დაემატა"],
  create_sheet: ["Creating sheet…", "Sheet ready", "ნოუთს ვქმნი…", "ნოუთი მზადაა"],
  create_note: ["Saving note…", "Note saved", "ჩანაწერს ვინახავ…", "ჩანაწერი შენახულია"],
  edit_note: ["Updating note…", "Note updated", "ჩანაწერს ვაახლებ…", "ჩანაწერი განახლდა"],
  edit_sheet: ["Updating sheet…", "Sheet updated", "ნოუთს ვაახლებ…", "ნოუთი განახლდა"],
  create_path: ["Creating path…", "Path ready", "გზას ვქმნი…", "გზა მზადაა"],
  advance_path: ["Moving to next topic…", "Topic updated", "შემდეგ თემაზე გადავდივარ…", "თემა განახლდა"],
  restart_path: ["Restarting path…", "Path restarted", "გზას თავიდან ვიწყებ…", "გზა თავიდან დაიწყო"],
  start_path: ["Opening path…", "Path opened", "გზას ვხსნი…", "გზა გაიხსნა"],
  search_images: ["Searching images…", "Image search complete", "ფოტოებს ვეძებ…", "ფოტოების ძიება დასრულდა"],
};

export function toolStatusText(event: ToolExecutionStatus, ka = false): string {
  if (event.phase === "error") return ka ? "ინსტრუმენტი მიუწვდომელია. ტექსტით გავაგრძელებ…" : "Tool unavailable. Continuing in text…";
  const response = event.response as { images?: unknown[]; deferred?: boolean; skipped?: boolean; alreadyLoaded?: boolean } | undefined;
  if (event.phase === "complete" && event.call.name === "load_skill" && (response?.skipped || response?.alreadyLoaded)) {
    return ka ? "ჩატვირთულ გზამკვლევს ვიყენებ" : "Using loaded guidance";
  }
  if (event.phase === "complete" && response?.deferred) return ka ? "მოთხოვნა მზადაა…" : "Request ready…";
  if (event.phase === "complete" && event.call.name === "search_images" && Array.isArray(response?.images)) {
    return ka ? `მოიძებნა ${response.images.length} ფოტო` : `Found ${response.images.length} results`;
  }
  return labels[event.call.name][(ka ? 2 : 0) + (event.phase === "complete" ? 1 : 0)];
}

export function toolFallbackText(ka = false): string {
  return ka
    ? "ინსტრუმენტის გამოყენება ვერ მოხერხდა. შემიძლია აქ არსებული ინფორმაციით დაგეხმარო."
    : "I couldn’t complete that tool. I can still help using the information in this chat.";
}
