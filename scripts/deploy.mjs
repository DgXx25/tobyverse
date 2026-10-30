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

run("npm", ["run", "clean"]);
run("npm", ["run", "build"]);
run("npm", ["exec", "firebase", "--", "deploy", "--only", "hosting", "--project", "ugstuff-c351a"]);
