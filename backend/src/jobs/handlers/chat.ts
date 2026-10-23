import { getAdminAuth } from "../../firebase/admin.js";
import { JobExecutionError, type JobHandler } from "../worker.js";
import { invokeLegacyChat } from "./legacy-chat-bridge.js";

type ChatHandlerDependencies = {
  idTokenFor?(uid: string): Promise<string>;
  invokeChat?(request: Request): Promise<Response>;
};

type ChatEvent = Record<string, unknown>;

async function createInternalIdToken(uid: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) throw new JobExecutionError("auth_not_configured", "Generation authentication is not configured.", false);

  let customToken: string;
  try {
    customToken = await getAdminAuth().createCustomToken(uid);
  } catch {
    throw new JobExecutionError("auth_token_unavailable", "Generation could not verify this account.", true);
  }

  let response: Response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
  } catch {
    throw new JobExecutionError("auth_token_unavailable", "Generation could not verify this account.", true);
  }
  if (!response.ok) throw new JobExecutionError("auth_token_unavailable", "Generation could not verify this account.", response.status >= 500);
  const body = await response.json() as { idToken?: unknown };
  if (typeof body.idToken !== "string" || !body.idToken) {
    throw new JobExecutionError("auth_token_unavailable", "Generation could not verify this account.", true);
  }
  return body.idToken;
}

function eventType(event: ChatEvent): string {
  if (typeof event.delta === "string") return "delta";
  if (event.tool) return "tool";
  if (event.done === true) return "done";
  return "update";
}

async function consumeStream(response: Response, emit: (event: { type: string; data: unknown }) => Promise<void>) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "chat_generation_failed";
    if (code === "weekly_ai_budget_exhausted") {
      throw new JobExecutionError(code, "Your weekly AI allowance is used up.", false);
    }
    if (code === "paid_model_required") {
      throw new JobExecutionError(code, "This model is not included in your current plan.", false);
    }
    throw new JobExecutionError(code, "The assistant could not start this response.", response.status >= 500);
  }
  if (!response.body) throw new JobExecutionError("empty_chat_response", "The assistant returned no response.", true);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const events: ChatEvent[] = [];
  let text = "";
  let tool: unknown;

  const consume = async (block: string) => {
    if (block.startsWith(":")) return;
    const data = block.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    let event: ChatEvent;
    try {
      event = JSON.parse(data) as ChatEvent;
    } catch {
      throw new JobExecutionError("invalid_chat_event", "The assistant returned an unreadable response.", true);
    }
    if (typeof event.error === "string") {
      throw new JobExecutionError("chat_generation_failed", "The assistant could not finish this response. You can retry it.", true);
    }
    if (typeof event.delta === "string") text += event.delta;
    if (event.tool) tool = event.tool;
    events.push(event);
    await emit({ type: eventType(event), data: event });
  };

  try {
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done }).replace(/\r\n/g, "\n");
      let delimiter = pending.indexOf("\n\n");
      while (delimiter >= 0) {
        const block = pending.slice(0, delimiter);
        pending = pending.slice(delimiter + 2);
        await consume(block);
        delimiter = pending.indexOf("\n\n");
      }
      if (chunk.done) break;
    }
    if (pending.trim()) await consume(pending);
  } finally {
    reader.releaseLock();
  }
  return { text, tool, events };
}

export function createChatGenerationHandler(dependencies: ChatHandlerDependencies = {}): JobHandler {
  const idTokenFor = dependencies.idTokenFor ?? createInternalIdToken;
  const invokeChat = dependencies.invokeChat ?? invokeLegacyChat;

  return async (input, context) => {
    if (context.job.anonymous) {
      throw new JobExecutionError("account_required_for_background_jobs", "Sign in to run generation in the background.", false);
    }
    const token = await idTokenFor(context.job.uid);
    const request = new Request("http://tobyverse.internal/api/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: context.signal,
    });
    const response = await invokeChat(request);
    return consumeStream(response, context.emit);
  };
}
