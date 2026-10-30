import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && command === "npm",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" });
if (branch.status !== 0 || !branch.stdout.trim()) {
  throw new Error("Deploy requires a named Git branch.");
}

run("git", ["add", "-A"]);
const staged = spawnSync("git", ["diff", "--cached", "--quiet"]);
if (staged.status === 1) run("git", ["commit", "-m", "Deploy TobyVerse"]);
else if (staged.status !== 0) process.exit(staged.status ?? 1);

run("git", ["push", "origin", branch.stdout.trim()]);
run("npm", ["run", "clean"]);
run("npm", ["run", "build"]);
run("npm", ["exec", "firebase", "--", "deploy", "--only", "hosting", "--project", "ugstuff-c351a"]);
