import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    label,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function publish(result) {
  mkdirSync("dist", { recursive: true });
  const output = [
    "LABSTAR_BUILD_DIAGNOSTIC",
    `stage=${result.label}`,
    `status=${result.status}`,
    `commit=${process.env.CF_PAGES_COMMIT_SHA ?? "unknown"}`,
    "--- stdout ---",
    result.stdout,
    "--- stderr ---",
    result.stderr,
  ].join("\n");
  writeFileSync("dist/build-diagnostic.txt", output, "utf8");
  writeFileSync("dist/index.html", '<!doctype html><meta charset="utf-8"><title>Labstar diagnostic</title><body>Temporary build diagnostic. See /build-diagnostic.txt</body>', "utf8");
}

const typecheck = run("typescript", ["node_modules/typescript/bin/tsc", "-b"]);
if (typecheck.status !== 0) {
  publish(typecheck);
  process.exit(0);
}

const vite = run("vite", ["node_modules/vite/bin/vite.js", "build"]);
if (vite.status !== 0) {
  publish(vite);
  process.exit(0);
}

process.stdout.write(vite.stdout);
process.stderr.write(vite.stderr);
process.exit(0);
