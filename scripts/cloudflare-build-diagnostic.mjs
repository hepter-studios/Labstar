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
if (appTypecheck.status !== 0) process.exit(39);

const vite = run(["node_modules/vite/bin/vite.js", "build"]);
if (vite.status !== 0) {
  const resolutionHints = [
    "Could not resolve",
    "failed to resolve import",
    "is not exported by",
    "does not provide an export named",
    "ENOENT",
    "Cannot find module",
  ];
  if (resolutionHints.some((hint) => vite.output.toLowerCase().includes(hint.toLowerCase()))) {
    console.log("LABSTAR_PROBE_VITE_RESOLUTION_MATCH");
    process.exit(0);
  }
  console.error("LABSTAR_PROBE_VITE_NOT_RESOLUTION");
  process.exit(41);
}

console.log("LABSTAR_PROBE_ALL_OK");
process.exit(0);
