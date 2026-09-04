import fs from "node:fs";

const replacements = [
  ["src/lib/supabase.ts", [
    ["export async function listMessages(channelId: string) {", "export async function listMessages(channelId: string, limit = 60) {"],
    ["    .limit(200);", "    .limit(Math.max(1, Math.min(limit, 100)));"],
  ]],
  ["src/components/CommunicationHome.tsx", [
    ["listMessages(channel.id),", "listMessages(channel.id, 20),"],
  ]],
  ["src/components/WorkHome.tsx", [
    ["readableChannels.map((channel) => listMessages(channel.id))", "readableChannels.map((channel) => listMessages(channel.id, 20))"],
  ]],
  ["src/components/GlobalSearchBridge.tsx", [
    [".slice(0, 30).map((channel) => listMessages(channel.id))", ".slice(0, 30).map((channel) => listMessages(channel.id, 40))"],
  ]],
  ["src/components/WorkspaceIntelligence.tsx", [
    ["searchableChannels.map((channel) => listMessages(channel.id))", "searchableChannels.map((channel) => listMessages(channel.id, 40))"],
  ]],
];

for (const [file, pairs] of replacements) {
  let text = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (!text.includes(from)) throw new Error(`Pattern not found in ${file}: ${from}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(file, text);
}
