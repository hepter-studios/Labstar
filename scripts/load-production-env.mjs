import { appendFile } from "node:fs/promises";

const output = process.env.GITHUB_ENV;
if (!output) throw new Error("GITHUB_ENV is unavailable");

const siteUrl = "https://labstar.pages.dev/";
const html = await fetch(siteUrl).then((response) => {
  if (!response.ok) throw new Error(`Labstar site returned ${response.status}`);
  return response.text();
});
const entryPath = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
if (!entryPath) throw new Error("Production entry script was not found");
const javascript = await fetch(new URL(entryPath, siteUrl)).then((response) => {
  if (!response.ok) throw new Error(`Labstar entry returned ${response.status}`);
  return response.text();
});
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  || javascript.match(/sb_publishable_[a-zA-Z0-9_-]+/)?.[0]
  || javascript.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)?.[0];
if (!publicKey) throw new Error("Public Supabase configuration was not found");
await appendFile(output, `VITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}\nVITE_SUPABASE_ANON_KEY=${publicKey}\n`);
