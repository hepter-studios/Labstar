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

const appTypecheck = run([
  "node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.app.json",
  "--noEmit",
]);

if (appTypecheck.status !== 0) {
  console.log("LABSTAR_PROBE_APP_TYPECHECK_FAILED");
  process.exit(0);
}

const vite = run(["node_modules/vite/bin/vite.js", "build"]);
if (vite.status !== 0) {
  console.error("LABSTAR_PROBE_VITE_FAILED");
  process.exit(38);
}

console.log("LABSTAR_PROBE_ALL_OK");
process.exit(0);
