import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileCode2,
  FileText,
  Github,
  Link2,
  LoaderCircle,
  WrapText,
  X,
} from "lucide-react";
import { Children, isValidElement, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import "../programmer-chat.css";
import { MAX_INLINE_PREVIEW_BYTES, describeDeveloperFile, formatChatBytes, inferProgrammingLanguage } from "../lib/programmer-files";

export type MarkdownAttachment = { fileName: string; url: string; mimeType?: string };

export function markdownAttachmentReference(fileName: string) {
  return `labstar-attachment:${encodeURIComponent(fileName)}`;
}

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

function codeFromPre(children: ReactNode) {
  const child = Children.count(children) === 1 ? Children.only(children) : null;
  if (!isValidElement(child)) return { language: "", code: String(children ?? "") };
  const element = child as ReactElement<{ className?: string; children?: ReactNode }>;
  return {
    language: /language-([\w#+.-]+)/.exec(element.props.className ?? "")?.[1] ?? "",
    code: String(element.props.children ?? ""),
  };
}

function extractLinks(body: string) {
  const withoutMarkdownImages = body.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  const urls = withoutMarkdownImages.match(/https?:\/\/[^\s)\]}>"']+/gi) ?? [];
  return [...new Set(urls)].slice(0, 3);
}

function DeveloperLinkCard({ url }: { url: string }) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const github = parsed.hostname === "github.com" || parsed.hostname.endsWith(".github.com");
  const segments = parsed.pathname.split("/").filter(Boolean);
  const title = github && segments.length >= 2 ? `${segments[0]} / ${segments[1]}` : parsed.hostname;
  const detail = github
    ? segments.includes("pull") ? `Pull request #${segments[segments.indexOf("pull") + 1] ?? ""}`
      : segments.includes("issues") ? `Issue #${segments[segments.indexOf("issues") + 1] ?? ""}`
      : segments.includes("commit") ? `Commit ${segments[segments.indexOf("commit") + 1]?.slice(0, 7) ?? ""}`
      : "Repositório ou arquivo no GitHub"
    : parsed.pathname === "/" ? "Link externo" : decodeURIComponent(parsed.pathname).slice(0, 90);
  return (
    <a className={`developer-link-card ${github ? "github" : ""}`} href={url} target="_blank" rel="noreferrer noopener">
      <span>{github ? <Github size={18} /> : <Link2 size={18} />}</span>
      <div><small>{github ? "GITHUB" : parsed.hostname.toUpperCase()}</small><strong>{title}</strong><p>{detail}</p></div>
      <ExternalLink size={15} />
    </a>
  );
}

export function DeveloperMessageBody({ body, attachments = [] }: { body: string; attachments?: MarkdownAttachment[] }) {
  const attachmentUrls = useMemo(() => new Map(attachments.map((item) => [item.fileName, item.url])), [attachments]);
  const links = useMemo(() => extractLinks(body), [body]);
  const transformUrl = (url: string) => {
    if (url.startsWith("labstar-attachment:")) {
      const name = decodeURIComponent(url.slice("labstar-attachment:".length));
      return attachmentUrls.get(name) ?? "";
    }
    return defaultUrlTransform(url);
  };

  return (
    <div className="developer-message-body markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={transformUrl}
        components={{
          pre({ children }) {
            const block = codeFromPre(children);
            return <CodeBlock language={block.language} code={block.code} />;
          },
          code({ children, className }) {
            return <code className={className}>{children}</code>;
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noreferrer noopener">{children}<ExternalLink size={11} /></a>;
          },
          img({ src, alt }) {
            return src ? <a className="markdown-image" href={src} target="_blank" rel="noreferrer"><img src={src} alt={alt || "Imagem do documento"} loading="lazy" referrerPolicy="no-referrer" /><span>{alt || "Abrir imagem"}</span></a> : <span className="markdown-image-missing">Imagem ainda não enviada</span>;
          },
          input({ type, checked }) {
            return type === "checkbox" ? <input type="checkbox" checked={Boolean(checked)} readOnly aria-label={checked ? "Concluído" : "Pendente"} /> : null;
          },
        }}
      >{body}</ReactMarkdown>
      {!!links.length && <div className="developer-link-grid">{links.map((url) => <DeveloperLinkCard key={url} url={url} />)}</div>}
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
          {loading ? <p><LoaderCircle className="spin" size={14} /> Carregando preview…</p> : previewError ? <p>{previewError}</p> : mimeType === "text/markdown" && content !== null ? <DeveloperMessageBody body={content} /> : <pre><code>{content}</code></pre>}
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
