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
  console.error(appTypecheck.output);
  process.exit(appTypecheck.status);
}

console.log("LABSTAR_APP_TYPECHECK_OK");
const vite = run(["node_modules/vite/bin/vite.js", "build"]);
process.stdout.write(vite.output);
process.exit(vite.status);
