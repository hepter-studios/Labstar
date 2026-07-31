import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

const typecheck = run(["node_modules/typescript/bin/tsc", "-b"]);
if (typecheck.status !== 0) {
  if (typecheck.output.includes("App.tsx")) {
    console.log("LABSTAR_PROBE_APP_MATCH");
    process.exit(0);
  }
  console.error("LABSTAR_PROBE_NOT_APP");
  process.exit(36);
}

const vite = run(["node_modules/vite/bin/vite.js", "build"]);
process.stdout.write(vite.output);
process.exit(vite.status);
