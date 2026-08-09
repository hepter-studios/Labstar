import { Check, ChevronDown, Copy, Download, FileArchive, FileCode2, FileText, LoaderCircle, WrapText, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import "../programmer-chat.css";
import { MAX_INLINE_PREVIEW_BYTES, describeDeveloperFile, formatChatBytes, inferProgrammingLanguage } from "../lib/programmer-files";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function FileKindIcon({ kind }: { kind: ReturnType<typeof describeDeveloperFile>["kind"] }) {
  if (kind === "code" || kind === "data") return <FileCode2 size={17} />;
  if (kind === "archive") return <FileArchive size={17} />;
  return <FileText size={17} />;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const detectedLanguage = language || inferProgrammingLanguage(code);
  const extension = ({ typescript: "ts", javascript: "js", python: "py", shell: "sh", terminal: "sh" } as Record<string, string>)[detectedLanguage.toLowerCase()] || detectedLanguage || "txt";
  const normalizedCode = code.replace(/\n$/, "");
  async function copy() {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function download() {
    const descriptor = describeDeveloperFile(`snippet.${extension}`);
    const blob = new Blob([normalizedCode], { type: descriptor.mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `snippet-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section className="developer-code-block">
      <header>
        <span>{detectedLanguage || "código"}</span>
        <div>
          <button type="button" className={wrap ? "active" : ""} onClick={() => setWrap((value) => !value)} title="Alternar quebra de linha"><WrapText size={12} /> Quebrar</button>
          <button type="button" onClick={download} title="Baixar snippet"><Download size={12} /> Baixar</button>
          <button type="button" onClick={() => void copy()}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copiado" : "Copiar"}</button>
        </div>
      </header>
      <pre className={wrap ? "wrap" : ""}><code>{normalizedCode.split("\n").map((line, index) => <span className="developer-code-line" data-line={index + 1} key={`${index}-${line}`}>{line || " "}</span>)}</code></pre>
    </section>
  );
}

export function DeveloperMessageBody({ body }: { body: string }) {
  const parts: Array<{ type: "text" | "code"; value: string; language?: string }> = [];
  const fenced = /```([\w#+.-]*)\s*\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = fenced.exec(body))) {
    if (match.index > cursor) parts.push({ type: "text", value: body.slice(cursor, match.index) });
    parts.push({ type: "code", language: match[1], value: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) parts.push({ type: "text", value: body.slice(cursor) });
  if (!parts.length) parts.push({ type: "text", value: body });
  return (
    <div className="developer-message-body">
      {parts.map((part, index) => part.type === "code"
        ? <CodeBlock key={`code-${index}`} language={part.language ?? ""} code={part.value} />
        : part.value && <p key={`text-${index}`}>{part.value}</p>)}
    </div>
  );
}

export function DeveloperAttachmentCard({ fileName, mimeType, sizeBytes, url }: { fileName: string; mimeType: string; sizeBytes: number; url: string }) {
  const descriptor = describeDeveloperFile(fileName, mimeType);
  const canPreview = descriptor.previewable && sizeBytes <= MAX_INLINE_PREVIEW_BYTES;
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [copied, setCopied] = useState(false);

  async function togglePreview() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (content !== null || !canPreview) return;
    setLoading(true);
    setPreviewError("");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("preview_failed");
      setContent((await response.text()).slice(0, 24_000));
    } catch {
      setPreviewError("Preview indisponível. O download continua disponível.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPreview() {
    if (content === null) return;
    await copyText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const style = { "--developer-file-color": descriptor.color } as CSSProperties;
  return (
    <article className={`developer-attachment kind-${descriptor.kind}`} style={style}>
      <div className="developer-attachment-main">
        <span className="developer-file-mark"><b>{descriptor.mark}</b><FileKindIcon kind={descriptor.kind} /></span>
        <div><strong>{fileName}</strong><small>{descriptor.language} · {formatChatBytes(sizeBytes)}</small></div>
        <div className="developer-attachment-actions">
          {canPreview && <button type="button" className={expanded ? "active" : ""} onClick={() => void togglePreview()} title="Visualizar conteúdo"><ChevronDown size={14} /></button>}
          <a href={url} target="_blank" rel="noreferrer" download={fileName} title="Baixar arquivo"><Download size={14} /></a>
        </div>
      </div>
      {expanded && canPreview && (
        <div className="developer-attachment-preview">
          <header><span>{descriptor.language}</span>{content !== null && <button type="button" onClick={() => void copyPreview()}>{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? "Copiado" : "Copiar"}</button>}</header>
          {loading ? <p><LoaderCircle className="spin" size={14} /> Carregando preview…</p> : previewError ? <p>{previewError}</p> : <pre><code>{content}</code></pre>}
        </div>
      )}
    </article>
  );
}

export function DeveloperFileQueue({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  return (
    <div className="developer-file-queue" aria-label="Arquivos preparados para envio">
      {files.map((file, index) => {
        const descriptor = describeDeveloperFile(file.name, file.type);
        return (
          <span key={`${file.name}-${file.size}-${file.lastModified}`} style={{ "--developer-file-color": descriptor.color } as CSSProperties}>
            <i>{descriptor.mark}</i><b>{file.name}</b><small>{formatChatBytes(file.size)}</small>
            <button type="button" onClick={() => onRemove(index)} aria-label={`Remover ${file.name}`}><X size={12} /></button>
          </span>
        );
      })}
    </div>
  );
}
