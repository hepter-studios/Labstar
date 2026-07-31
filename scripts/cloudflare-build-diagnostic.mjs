import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    signal: result.signal ?? "",
    error: result.error?.message ?? "",
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

const typecheck = run(["node_modules/typescript/bin/tsc", "-b"]);
if (typecheck.status !== 0) {
  if (typecheck.signal || typecheck.error) {
    console.log(`LABSTAR_PROBE_PROCESS_TERMINATED signal=${typecheck.signal || "none"} error=${typecheck.error || "none"}`);
    process.exit(0);
  }
  console.error("LABSTAR_PROBE_NORMAL_TSC_FAILURE");
  process.exit(37);
}

const vite = run(["node_modules/vite/bin/vite.js", "build"]);
process.stdout.write(vite.output);
process.exit(vite.status);
