export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type GenerationJob = {
  id: string;
  kind: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  attempt: number;
  error?: { code: string; message: string; retryable: boolean };
  result?: { text?: string; tool?: unknown };
  retryOf?: string;
};

export type JobEvent = { id: number; type: string; data?: unknown };
export type ConnectionState = "connecting" | "reconnecting" | "connected" | "paused" | "closed";

export class JobApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "JobApiError";
  }
}

type ClientDependencies = {
  getIdToken(): Promise<string>;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  maxReconnects?: number;
};

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function decodeError(response: Response): Promise<JobApiError> {
  const body = await response.json().catch(() => ({})) as { code?: unknown; error?: unknown };
  return new JobApiError(
    typeof body.code === "string" ? body.code : "job_request_failed",
    typeof body.error === "string" ? body.error : "Generation service could not complete the request.",
    response.status,
  );
}

export function createJobClient(dependencies: ClientDependencies) {
  const fetcher = dependencies.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await dependencies.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetcher(`/api/jobs${path}`, { ...init, headers });
    if (!response.ok) throw await decodeError(response);
    return response.json() as Promise<T>;
  }

  return {
    start: (payload: unknown, idempotencyKey: string) => request<{ jobId: string; status: JobStatus }>("", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ kind: "chat", payload, idempotencyKey }),
    }),
    active: async () => (await request<{ jobs: GenerationJob[] }>("?active=true")).jobs,
    status: async (jobId: string) => (await request<{ job: GenerationJob }>(`/${encodeURIComponent(jobId)}`)).job,
    cancel: (jobId: string) => request<{ jobId: string; status: JobStatus }>(`/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }),
    retry: (jobId: string) => request<{ jobId: string; status: JobStatus; retryOf: string }>(`/${encodeURIComponent(jobId)}/retry`, { method: "POST" }),

    async events(
      jobId: string,
      initialEventId: number,
      signal: AbortSignal,
      onEvent: (event: JobEvent) => void,
      onConnection: (state: ConnectionState, message?: string) => void,
    ) {
      let lastEventId = initialEventId;
      const maxReconnects = Math.max(0, dependencies.maxReconnects ?? 5);
      let reconnects = 0;
      while (!signal.aborted) {
        onConnection(reconnects ? "reconnecting" : "connecting");
        try {
          const token = await dependencies.getIdToken();
          const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}/events`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Last-Event-ID": String(lastEventId),
            },
            signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
          });
          if (!response.ok) throw await decodeError(response);
          if (!response.body) throw new Error("The job event stream is unavailable.");
          onConnection("connected");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          let terminal = false;
          const consume = (block: string) => {
            const lines = block.split("\n");
            const idLine = lines.find((line) => line.startsWith("id:"));
            const typeLine = lines.find((line) => line.startsWith("event:"));
            const dataLine = lines.find((line) => line.startsWith("data:"));
            if (!typeLine || !dataLine) return;
            const id = idLine ? Number(idLine.slice(3).trim()) : lastEventId;
            if (Number.isSafeInteger(id) && id > 0) lastEventId = id;
            const type = typeLine.slice(6).trim();
            let data: unknown;
            try { data = JSON.parse(dataLine.slice(5).trimStart()); }
            catch { data = undefined; }
            onEvent({ id: lastEventId, type, data });
            if (["succeeded", "failed", "cancelled"].includes(type)) terminal = true;
          };
          try {
            while (!signal.aborted && !terminal) {
              const chunk = await reader.read();
              pending += decoder.decode(chunk.value, { stream: !chunk.done }).replace(/\r\n/g, "\n");
              let delimiter = pending.indexOf("\n\n");
              while (delimiter >= 0) {
                consume(pending.slice(0, delimiter));
                pending = pending.slice(delimiter + 2);
                delimiter = pending.indexOf("\n\n");
              }
              if (chunk.done) break;
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          if (signal.aborted || terminal) {
            onConnection("closed");
            return;
          }
          throw new Error("The connection ended before generation finished.");
        } catch (error) {
          if (signal.aborted) {
            onConnection("closed");
            return;
          }
          reconnects += 1;
          if (reconnects > maxReconnects) {
            const message = error instanceof Error ? error.message : "Could not reconnect to this job.";
            onConnection("paused", message);
            return;
          }
          onConnection("reconnecting", error instanceof Error ? error.message : "Connection interrupted.");
          const delay = Math.min(1_000 * (2 ** (reconnects - 1)), 15_000);
          await (dependencies.wait ?? wait)(delay, signal).catch(() => undefined);
        }
      }
    },
  };
}
