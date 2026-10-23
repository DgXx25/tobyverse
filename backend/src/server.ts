import { DEFAULT_GEMINI_MODEL } from "../../lib/ai/catalog.js";
import { assertJobBudget } from "./jobs/budget.js";
import { FirestoreJobStore } from "./jobs/firestore-store.js";
import { createChatGenerationHandler } from "./jobs/handlers/chat.js";
import { GenerationWorker, JobExecutionError } from "./jobs/worker.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const store = new FirestoreJobStore();
const worker = new GenerationWorker({
  store,
  handlers: { chat: createChatGenerationHandler() },
  concurrency: Number(process.env.JOB_WORKER_CONCURRENCY ?? 2),
  pollMs: Number(process.env.JOB_WORKER_POLL_MS ?? 1_000),
  heartbeatMs: Number(process.env.JOB_WORKER_HEARTBEAT_MS ?? 30_000),
  maxAttempts: Number(process.env.JOB_WORKER_MAX_ATTEMPTS ?? 3),
  preflight: async (uid, job) => {
    if (job.anonymous) {
      throw new JobExecutionError("account_required_for_background_jobs", "Sign in to run generation in the background.", false);
    }
    const input = await store.readInput(job);
    const model = input && typeof input === "object" && "model" in input && typeof input.model === "string"
      ? input.model
      : DEFAULT_GEMINI_MODEL;
    await assertJobBudget(uid, model);
  },
});
const app = createApp({
  jobs: { store, worker, budgetCheck: assertJobBudget },
  readiness: () => store.checkReady(),
});

const server = app.listen(port, host, () => {
  worker.start();
  const cleanupExpired = () => {
    void store.cleanupExpiredJobs().then((count) => {
      if (count) console.info(JSON.stringify({ scope: "generation_job_cleanup", removed: count }));
    }).catch((error) => {
      console.error(`[jobs] cleanup failed error=${error instanceof Error ? error.name : "Error"}`);
    });
  };
  cleanupExpired();
  const cleanupTimer = setInterval(cleanupExpired, 60 * 60 * 1_000);
  cleanupTimer.unref();
  process.once("beforeExit", () => clearInterval(cleanupTimer));
  console.log(`Tobyverse backend listening on http://${host}:${port}`);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; draining generation worker`);
  const hardStop = setTimeout(() => process.exit(1), 30_000);
  hardStop.unref();
  void worker.stop(25_000).then(() => {
    clearTimeout(hardStop);
    server.close((error) => {
      if (error) {
        console.error("Backend shutdown failed", error);
        process.exitCode = 1;
      }
    });
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
