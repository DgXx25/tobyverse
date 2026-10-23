import express from "express";
import { createJobRouter, type JobRouteDependencies } from "./jobs/routes.js";
import type { TokenVerifier } from "./auth/require-user.js";

type AppOptions = {
  jobs?: JobRouteDependencies;
  verifyToken?: TokenVerifier;
  readiness?: () => Promise<void>;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10mb" }));

  const allowedOrigins = new Set(
    (process.env.FRONTEND_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  app.use((request, response, next) => {
    const origin = request.get("origin");
    if (!origin) {
      if (request.method === "OPTIONS") response.sendStatus(204);
      else next();
      return;
    }
    if (!allowedOrigins.has(origin)) {
      response.status(403).json({ error: "Origin is not allowed.", code: "origin_not_allowed" });
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID, Idempotency-Key");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") response.sendStatus(204);
    else next();
  });

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get("/readyz", async (_request, response) => {
    try {
      if (!options.readiness) throw new Error("Readiness checks are not configured.");
      await options.readiness();
      response.status(200).json({ ready: true });
    } catch {
      response.status(503).json({ ready: false });
    }
  });

  if (options.jobs) app.use("/api/jobs", createJobRouter(options.jobs, options.verifyToken));

  return app;
}
