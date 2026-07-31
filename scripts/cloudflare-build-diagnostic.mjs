import { spawnSync } from "node:child_process";

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  return {
    status: result.status ?? 1,
    signal: result.signal ?? "",
    error: result.error?.message ?? "",
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

const typecheck = run(
  ["node_modules/typescript/bin/tsc", "-b"],
  { NODE_OPTIONS: "--max-old-space-size=4096" },
);

if (typecheck.status !== 0) {
  console.error(typecheck.output);
  process.exit(typecheck.status);
}

const vite = run(["node_modules/vite/bin/vite.js", "build"]);
process.stdout.write(vite.output);
process.exit(vite.status);
