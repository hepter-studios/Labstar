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
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error) : "",
  };
}

function publishDiagnostic(result) {
  mkdirSync("dist", { recursive: true });
  const text = [
    `LABSTAR BUILD DIAGNOSTIC`,
    `stage=${result.label}`,
    `status=${String(result.status)}`,
    `signal=${String(result.signal ?? "")}`,
    result.error ? `error=${result.error}` : "",
    "--- STDOUT ---",
    result.stdout,
    "--- STDERR ---",
    result.stderr,
  ].filter(Boolean).join("\n");
  writeFileSync("dist/build-diagnostic.txt", text, "utf8");
  writeFileSync(
    "dist/index.html",
    "<!doctype html><meta charset=\"utf-8\"><title>Labstar build diagnostic</title><body style=\"background:#05070d;color:#dce5f4;font:16px system-ui;padding:32px\"><h1>Labstar — diagnóstico de build</h1><p>Arquivo temporário de diagnóstico. A interface normal será restaurada após a correção.</p></body>",
    "utf8",
  );
}

const typecheck = run("typescript", ["node_modules/typescript/bin/tsc", "-b"]);
if (typecheck.status !== 0) {
  publishDiagnostic(typecheck);
  process.exit(0);
}

const vite = run("vite", ["node_modules/vite/bin/vite.js", "build"]);
if (vite.status !== 0) {
  publishDiagnostic(vite);
  process.exit(0);
}

process.stdout.write(vite.stdout);
process.stderr.write(vite.stderr);
