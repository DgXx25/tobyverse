import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commands = [
  {
    name: "frontend",
    args: ["../node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
    cwd: resolve(root, "frontend"),
  },
  {
    name: "backend",
    args: ["--conditions=react-server", "--env-file-if-exists=../.env.local", "--import", "tsx", "--watch", "src/server.ts"],
    cwd: resolve(root, "backend"),
  },
];

const children = new Map();
let shuttingDown = false;

function shutdown(signal = "SIGTERM", exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) child.kill(signal);
  }
  setTimeout(() => process.exit(exitCode), 2500).unref();
}

for (const command of commands) {
  const child = spawn(process.execPath, command.args, {
    cwd: command.cwd,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.set(command.name, child);

  child.on("error", (error) => {
    console.error(`[${command.name}] failed to start:`, error);
    shutdown("SIGTERM", 1);
  });
  child.on("exit", (code, signal) => {
    children.delete(command.name);
    if (!shuttingDown) {
      console.error(`[${command.name}] exited (${signal ?? code}); stopping the other service`);
      shutdown("SIGTERM", code ?? 1);
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

console.log("Starting Tobyverse parallel stack: Vite :5173 + API/worker :4000");
