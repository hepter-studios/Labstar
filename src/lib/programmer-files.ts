export const MAX_CHAT_FILES = 8;
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_TOTAL_BYTES = 60 * 1024 * 1024;
export const LARGE_PASTE_CHARACTERS = 4_000;
export const MAX_INLINE_PREVIEW_BYTES = 512 * 1024;

export type DeveloperFileKind = "image" | "code" | "text" | "archive" | "data" | "document" | "binary";
export type DeveloperFileDescriptor = {
  kind: DeveloperFileKind;
  language: string;
  mark: string;
  color: string;
  mimeType: string;
  previewable: boolean;
};

type LanguageDescriptor = Omit<DeveloperFileDescriptor, "kind" | "previewable">;

const LANGUAGE_ROWS: Record<string, [string, string, string, string]> = {
  ts: ["TypeScript", "TS", "#3178c6", "text/typescript"],
  tsx: ["React TSX", "TSX", "#4aa3df", "text/tsx"],
  js: ["JavaScript", "JS", "#e8cf54", "text/javascript"],
  jsx: ["React JSX", "JSX", "#61dafb", "text/jsx"],
  py: ["Python", "PY", "#4b8bbe", "text/x-python"],
  rs: ["Rust", "RS", "#dea584", "text/x-rust"],
  go: ["Go", "GO", "#00add8", "text/x-go"],
  java: ["Java", "JV", "#e76f00", "text/x-java-source"],
  kt: ["Kotlin", "KT", "#a97bff", "text/x-kotlin"],
  cs: ["C#", "C#", "#9b4f96", "text/x-csharp"],
  c: ["C", "C", "#6d8fc7", "text/x-c"],
  h: ["C/C++ Header", "H", "#8796ad", "text/x-c"],
  cpp: ["C++", "C++", "#659ad2", "text/x-c++"],
  hpp: ["C++ Header", "H++", "#659ad2", "text/x-c++"],
  php: ["PHP", "PHP", "#777bb4", "text/x-php"],
  rb: ["Ruby", "RB", "#cc342d", "text/x-ruby"],
  swift: ["Swift", "SW", "#f05138", "text/x-swift"],
  dart: ["Dart", "DT", "#0175c2", "text/x-dart"],
  vue: ["Vue", "VUE", "#42b883", "text/x-vue"],
  svelte: ["Svelte", "SV", "#ff3e00", "text/x-svelte"],
  html: ["HTML", "HTML", "#e34f26", "text/html"],
  htm: ["HTML", "HTML", "#e34f26", "text/html"],
  css: ["CSS", "CSS", "#1572b6", "text/css"],
  scss: ["SCSS", "SCSS", "#cc6699", "text/x-scss"],
  less: ["Less", "LESS", "#1d365d", "text/x-less"],
  json: ["JSON", "{}", "#d6b84b", "application/json"],
  jsonc: ["JSON com comentários", "{}", "#d6b84b", "application/json"],
  yaml: ["YAML", "YML", "#cb171e", "text/yaml"],
  yml: ["YAML", "YML", "#cb171e", "text/yaml"],
  toml: ["TOML", "TOML", "#9c4221", "text/plain"],
  xml: ["XML", "XML", "#e37933", "application/xml"],
  sql: ["SQL", "SQL", "#4f8cc9", "text/x-sql"],
  sh: ["Shell", "SH", "#89e051", "text/x-shellscript"],
  bash: ["Bash", "SH", "#89e051", "text/x-shellscript"],
  zsh: ["Zsh", "ZSH", "#89e051", "text/x-shellscript"],
  ps1: ["PowerShell", "PS", "#5391fe", "text/x-powershell"],
  md: ["Markdown", "MD", "#8ca3c7", "text/markdown"],
  mdx: ["MDX", "MDX", "#f9ac00", "text/markdown"],
  graphql: ["GraphQL", "GQL", "#e10098", "text/plain"],
  gql: ["GraphQL", "GQL", "#e10098", "text/plain"],
  proto: ["Protocol Buffers", "PB", "#6f87a6", "text/plain"],
  env: ["Variáveis de ambiente", "ENV", "#ecd53f", "text/plain"],
};
const LANGUAGES = Object.fromEntries(
  Object.entries(LANGUAGE_ROWS).map(([extension, [language, mark, color, mimeType]]) => [
    extension,
    { language, mark, color, mimeType },
  ]),
) as Record<string, LanguageDescriptor>;

const SPECIAL_FILES: Record<string, LanguageDescriptor> = {
  dockerfile: { language: "Dockerfile", mark: "DKR", color: "#2496ed", mimeType: "text/plain" },
  makefile: { language: "Makefile", mark: "MK", color: "#6d8b74", mimeType: "text/plain" },
  "cargo.toml": { language: "TOML", mark: "TOML", color: "#9c4221", mimeType: "text/plain" },
  "package.json": { language: "JSON", mark: "{}", color: "#d6b84b", mimeType: "application/json" },
  "package-lock.json": { language: "JSON", mark: "{}", color: "#d6b84b", mimeType: "application/json" },
};
const ARCHIVES = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"]);
const DATA = new Set(["csv", "tsv", "parquet", "sqlite", "db"]);
const DOCUMENTS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

function extensionOf(fileName: string) {
  const clean = fileName.trim().toLocaleLowerCase();
  if (clean === ".env" || clean.startsWith(".env.")) {
    return {
      extension: "env",
      special: { language: "Variáveis de ambiente", mark: "ENV", color: "#ecd53f", mimeType: "text/plain" },
    };
  }
  if (clean === "dockerfile" || clean.startsWith("dockerfile.")) {
    return {
      extension: "",
      special: { language: "Dockerfile", mark: "DKR", color: "#2496ed", mimeType: "text/plain" },
    };
  }
  const dot = clean.lastIndexOf(".");
  return { extension: dot >= 0 ? clean.slice(dot + 1) : "", special: SPECIAL_FILES[clean] };
}

export function describeDeveloperFile(fileName: string, mimeType = ""): DeveloperFileDescriptor {
  if (mimeType.startsWith("image/")) return { kind: "image", language: "Imagem", mark: "IMG", color: "#7f8da8", mimeType, previewable: false };
  const { extension, special } = extensionOf(fileName);
  const language = special ?? LANGUAGES[extension];
  if (language) return { ...language, kind: "code", previewable: true };
  if (mimeType.startsWith("text/") || ["log", "txt", "diff", "patch"].includes(extension)) {
    const diff = extension === "diff" || extension === "patch";
    return { kind: "text", language: diff ? "Diff" : "Texto", mark: diff ? "DIFF" : "TXT", color: "#8b98ad", mimeType: mimeType || "text/plain", previewable: true };
  }
  if (ARCHIVES.has(extension)) return { kind: "archive", language: "Arquivo compactado", mark: "ZIP", color: "#b8914f", mimeType: mimeType || "application/octet-stream", previewable: false };
  if (DATA.has(extension)) return { kind: "data", language: "Dados", mark: "DATA", color: "#52a87b", mimeType: mimeType || "application/octet-stream", previewable: extension === "csv" || extension === "tsv" };
  if (DOCUMENTS.has(extension)) return { kind: "document", language: "Documento", mark: extension.toUpperCase().slice(0, 4), color: "#9d7fd1", mimeType: mimeType || "application/octet-stream", previewable: false };
  return { kind: "binary", language: "Arquivo", mark: extension.toUpperCase().slice(0, 4) || "FILE", color: "#74829a", mimeType: mimeType || "application/octet-stream", previewable: false };
}

export class ChatFileValidationError extends Error {
  constructor(public code: "too_many_files" | "file_too_large" | "total_too_large", public fileName = "") {
    super(code);
    this.name = "ChatFileValidationError";
  }
}

export function formatChatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeDeveloperFile(file: File) {
  if (file.type) return file;
  const type = describeDeveloperFile(file.name).mimeType;
  return type && type !== "application/octet-stream"
    ? new File([file], file.name, { type, lastModified: file.lastModified })
    : file;
}

export function validateChatFiles(files: File[]) {
  if (files.length > MAX_CHAT_FILES) throw new ChatFileValidationError("too_many_files");
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_CHAT_FILE_BYTES) throw new ChatFileValidationError("file_too_large", file.name);
    total += file.size;
  }
  if (total > MAX_CHAT_TOTAL_BYTES) throw new ChatFileValidationError("total_too_large");
  return files;
}

export function mergeChatFiles(current: File[], incoming: Iterable<File>) {
  const next = [...current];
  for (const rawFile of incoming) {
    const file = normalizeDeveloperFile(rawFile);
    const duplicate = next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
    if (!duplicate) next.push(file);
  }
  return validateChatFiles(next);
}

function inferredPasteExtension(text: string) {
  const trimmed = text.trim();
  try { JSON.parse(trimmed); return "json"; } catch { /* não é JSON */ }
  if (/^\s*(import\s.+from\s+|export\s+|interface\s+|type\s+\w+\s*=)/m.test(text)) return "ts";
  if (/^\s*(const|let|var)\s+\w+|=>|console\.(log|error)/m.test(text)) return "js";
  if (/^\s*(def\s+\w+\s*\(|from\s+\w+\s+import\s+|import\s+\w+)/m.test(text)) return "py";
  if (/\bfn\s+main\s*\(|\blet\s+mut\b|impl\s+\w+/m.test(text)) return "rs";
  if (/^\s*package\s+main\b|\bfunc\s+\w+\s*\(/m.test(text)) return "go";
  if (/<!doctype\s+html|<html[\s>]|<div[\s>]/i.test(text)) return "html";
  if (/^\s*(select|insert|update|delete|create\s+table)\b/im.test(text)) return "sql";
  if (/^\s*diff\s+--git|^@@\s+-\d+/m.test(text)) return "diff";
  return "txt";
}

export function createLargePasteAttachment(text: string) {
  if (text.length < LARGE_PASTE_CHARACTERS && text.split(/\r?\n/).length < 120) return null;
  const extension = inferredPasteExtension(text);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([text], `colagem-${stamp}.${extension}`, {
    type: describeDeveloperFile(`colagem.${extension}`).mimeType || "text/plain",
    lastModified: Date.now(),
  });
}

export function chatFileErrorMessage(error: unknown) {
  if (error instanceof ChatFileValidationError) {
    if (error.code === "too_many_files") return `Envie no máximo ${MAX_CHAT_FILES} arquivos por mensagem.`;
    if (error.code === "file_too_large") return `${error.fileName || "Este arquivo"} ultrapassa o limite de ${formatChatBytes(MAX_CHAT_FILE_BYTES)}.`;
    return `O conjunto de arquivos ultrapassa ${formatChatBytes(MAX_CHAT_TOTAL_BYTES)}.`;
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("file_too_large") || message.includes("413")) return `Um dos arquivos ultrapassa o limite de ${formatChatBytes(MAX_CHAT_FILE_BYTES)}.`;
  if (message.includes("storage") || message.includes("upload")) return "O upload falhou. Seus arquivos continuam no compositor para você tentar novamente.";
  return "Não foi possível enviar. Seus arquivos e texto foram preservados para uma nova tentativa.";
}

export function uploadContentType(file: File) {
  return file.type || describeDeveloperFile(file.name).mimeType || "application/octet-stream";
}

export function defaultAttachmentMessage(files: File[]) {
  const codeCount = files.filter((file) => describeDeveloperFile(file.name, file.type).kind === "code").length;
  if (codeCount === files.length && files.length === 1) return "Compartilhou um arquivo de código";
  if (codeCount === files.length && files.length > 1) return `Compartilhou ${files.length} arquivos de código`;
  if (files.some((file) => file.type.startsWith("image/"))) return files.length === 1 ? "Enviou uma imagem" : `Compartilhou ${files.length} arquivos`;
  return `Compartilhou ${files.length} arquivo${files.length === 1 ? "" : "s"}`;
}
