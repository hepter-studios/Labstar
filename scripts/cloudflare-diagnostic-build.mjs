import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  return { label, status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
function publishProbe(label) {
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.html", `<!doctype html><meta charset="utf-8"><title>${label}</title><body>${label}</body>`, "utf8");
}
const typecheck = run("typescript", ["node_modules/typescript/bin/tsc", "-b"]);
if (typecheck.status !== 0) {
  const output = `${typecheck.stdout}\n${typecheck.stderr}`;
  const groupA1 = [
    "DirectMessagesHubV3.tsx",
    "DirectMessagesHubV4.tsx",
    "DirectMessagesHubV5.tsx",
    "GlobalSettings.tsx",
    "GlobalSettingsPortal.tsx"
  ];
  if (groupA1.some((name) => output.includes(name))) {
    publishProbe("LABSTAR_DIAGNOSTIC_GROUP_A1");
    process.exit(0);
  }
  process.stderr.write(output);
  process.exit(1);
}
const vite = run("vite", ["node_modules/vite/bin/vite.js", "build"]);
process.stdout.write(vite.stdout);
process.stderr.write(vite.stderr);
process.exit(vite.status ?? 1);
