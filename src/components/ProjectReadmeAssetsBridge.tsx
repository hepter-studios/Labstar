import { File, ImagePlus, LoaderCircle, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatChatBytes } from "../lib/programmer-files";
import {
  MAX_PROJECT_DOCUMENT_ASSET_BYTES,
  listProjectDocumentAssets,
  projectAssetMarkdownReference,
  removeProjectDocumentAsset,
  uploadProjectDocumentAsset,
  type ProjectDocumentAsset,
} from "../lib/project-document-assets";

const WORKSPACE_KEY = "labstar-workspace-v1";
const PROJECT_ASSET_REFRESH_EVENT = "labstar:project-readme-assets-changed";

type Selection = { start: number; end: number };

function currentSelection(textarea: HTMLTextAreaElement): Selection {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  return { start, end };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string, cursor: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

function insertAsset(textarea: HTMLTextAreaElement, asset: ProjectDocumentAsset, selection: Selection) {
  const reference = projectAssetMarkdownReference(asset);
  const before = textarea.value.slice(0, selection.start);
  const after = textarea.value.slice(selection.end);
  const prefix = before.length && !before.endsWith("\n") ? "\n" : "";
  const suffix = after.length && !after.startsWith("\n") ? "\n" : "";
  const insertion = `${prefix}${reference}${suffix}`;
  const nextValue = `${before}${insertion}${after}`;
  const cursor = selection.start + insertion.length;
  setTextareaValue(textarea, nextValue, cursor);
  return cursor;
}

function readWorkspaceNodeIdByName(name: string) {
  if (!name) return "";
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return "";
    const normalized = name.trim().toLocaleLowerCase();
    const match = parsed.find((value) => {
      if (!value || typeof value !== "object") return false;
      const candidate = value as { id?: unknown; name?: unknown };
      return typeof candidate.name === "string"
        && candidate.name.trim().toLocaleLowerCase() === normalized;
    }) as { id?: unknown } | undefined;
    return typeof match?.id === "string" ? match.id : "";
  } catch {
    return "";
  }
}

function resolveProjectNodeId() {
  const selectedCard = document.querySelector<HTMLElement>(".node-card.selected[data-project-node-id]");
  if (selectedCard?.dataset.projectNodeId) return selectedCard.dataset.projectNodeId;

  const modal = document.querySelector<HTMLElement>(".project-details-modal");
  if (!modal) return "";
  const ariaLabel = modal.getAttribute("aria-label") ?? "";
  const ariaName = ariaLabel.replace(/^Detalhes de\s+/i, "").trim();
  const headerName = modal.querySelector<HTMLElement>("header strong")?.textContent?.trim() ?? "";
  return readWorkspaceNodeIdByName(ariaName || headerName);
}

function assetErrorMessage(reason: unknown) {
  const error = reason as { code?: string; message?: string } | null;
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLocaleLowerCase();
  if (text.includes("file_too_large")) return "Máximo de 25 MB por arquivo.";
  if (text.includes("empty_file")) return "Esse arquivo está vazio.";
  if (/42501|permission|denied|row-level/.test(text)) return "Sem permissão para anexar neste projeto.";
  if (/42p01|pgrst205|project_document_assets|schema cache/.test(text)) return "A atualização de anexos ainda não está ativa no banco.";
  return "Não foi possível inserir esse arquivo agora.";
}

function QuickInsertTools({ textarea }: { textarea: HTMLTextAreaElement }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Selection>(currentSelection(textarea));
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const remember = () => { selectionRef.current = currentSelection(textarea); };
    textarea.addEventListener("keyup", remember);
    textarea.addEventListener("mouseup", remember);
    textarea.addEventListener("input", remember);
    return () => {
      textarea.removeEventListener("keyup", remember);
      textarea.removeEventListener("mouseup", remember);
      textarea.removeEventListener("input", remember);
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    };
  }, [textarea]);

  function rememberSelection() {
    selectionRef.current = currentSelection(textarea);
  }

  function flash(text: string) {
    setMessage(text);
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => setMessage(""), 3000);
  }

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    const nodeId = resolveProjectNodeId();
    if (!nodeId) {
      flash("Não consegui identificar este projeto. Feche e abra os detalhes novamente.");
      return;
    }

    setBusy(true);
    try {
      let selection = selectionRef.current;
      for (const file of files.slice(0, 8)) {
        if (file.size > MAX_PROJECT_DOCUMENT_ASSET_BYTES) throw new Error("file_too_large");
        if (file.size === 0) throw new Error("empty_file");
        const asset = await uploadProjectDocumentAsset(nodeId, file);
        const cursor = insertAsset(textarea, asset, selection);
        selection = { start: cursor, end: cursor };
      }
      selectionRef.current = selection;
      window.dispatchEvent(new CustomEvent(PROJECT_ASSET_REFRESH_EVENT, { detail: { nodeId } }));
      flash(files.length === 1 ? "Inserido no README." : "Arquivos inseridos no README.");
    } catch (reason) {
      flash(assetErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-readme-gutter-tools" aria-label="Inserir no README">
      <button
        type="button"
        className="image"
        disabled={busy}
        title="Inserir imagem na posição atual do cursor"
        aria-label="Inserir imagem"
        onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }}
        onClick={() => imageInput.current?.click()}
      >{busy ? <LoaderCircle className="spin" size={13} /> : <ImagePlus size={13} />}</button>
      <button
        type="button"
        disabled={busy}
        title="Inserir arquivo na posição atual do cursor"
        aria-label="Inserir arquivo"
        onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }}
        onClick={() => fileInput.current?.click()}
      ><Paperclip size={13} /></button>
      <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => {
        void upload(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = "";
      }} />
      <input ref={fileInput} hidden type="file" multiple onChange={(event) => {
        void upload(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = "";
      }} />
      {message && <span className="project-readme-gutter-message" role="status">{message}</span>}
    </div>
  );
}

function AssetList({ nodeId, textarea }: { nodeId: string; textarea: HTMLTextAreaElement }) {
  const [assets, setAssets] = useState<ProjectDocumentAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      setAssets(await listProjectDocumentAssets(nodeId));
    } catch (reason) {
      setMessage(assetErrorMessage(reason));
    }
  }

  useEffect(() => { void refresh(); }, [nodeId]);
  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === nodeId) void refresh();
    };
    window.addEventListener(PROJECT_ASSET_REFRESH_EVENT, onChanged);
    return () => window.removeEventListener(PROJECT_ASSET_REFRESH_EVENT, onChanged);
  }, [nodeId]);

  async function remove(asset: ProjectDocumentAsset) {
    if (busy) return;
    setBusy(true);
    try {
      await removeProjectDocumentAsset(asset);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setMessage("Arquivo removido do projeto.");
    } catch (reason) {
      setMessage(assetErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!assets.length && !message) return null;
  return (
    <div className="project-readme-assets">
      <div className="project-readme-assets-head"><div><strong>Arquivos do README</strong><span>Itens já enviados para este projeto.</span></div></div>
      {message && <div className="project-readme-assets-status">{message}</div>}
      {!!assets.length && <div className="project-readme-assets-list">
        {assets.map((asset) => (
          <article key={asset.id}>
            <span className="project-readme-asset-preview">{asset.mimeType.startsWith("image/") ? <img src={asset.url} alt="" /> : <File size={16} />}</span>
            <div><strong>{asset.fileName}</strong><small>{formatChatBytes(asset.sizeBytes)}</small></div>
            <button type="button" disabled={busy} title="Inserir no cursor" onMouseDown={(event) => event.preventDefault()} onClick={() => insertAsset(textarea, asset, currentSelection(textarea))}><Plus size={13} /></button>
            <a href={asset.url} target="_blank" rel="noreferrer" title="Abrir arquivo">↗</a>
            <button className="danger" type="button" disabled={busy} title="Remover arquivo" onClick={() => void remove(asset)}><Trash2 size={13} /></button>
          </article>
        ))}
      </div>}
    </div>
  );
}

export function ProjectReadmeAssetsBridge() {
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [gutterHost, setGutterHost] = useState<HTMLElement | null>(null);
  const [assetHost, setAssetHost] = useState<HTMLElement | null>(null);
  const [nodeId, setNodeId] = useState("");

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextTextarea = document.querySelector<HTMLTextAreaElement>(".project-details-modal .project-markdown-input");
        if (!nextTextarea) {
          setTextarea(null);
          setGutterHost(null);
          setAssetHost(null);
          setNodeId("");
          return;
        }

        const label = nextTextarea.closest("label");
        const parent = label?.parentElement;
        if (!label || !parent) return;

        label.classList.add("project-readme-with-gutter");
        let nextGutterHost = label.querySelector<HTMLElement>(":scope > .project-readme-gutter-host");
        if (!nextGutterHost) {
          nextGutterHost = document.createElement("div");
          nextGutterHost.className = "project-readme-gutter-host";
          nextTextarea.insertAdjacentElement("afterend", nextGutterHost);
        }
        nextGutterHost.style.top = `${nextTextarea.offsetTop + 8}px`;

        let nextAssetHost = parent.querySelector<HTMLElement>(":scope > .project-readme-assets-host");
        if (!nextAssetHost) {
          nextAssetHost = document.createElement("div");
          nextAssetHost.className = "project-readme-assets-host";
          label.insertAdjacentElement("afterend", nextAssetHost);
        }

        setTextarea((current) => current === nextTextarea ? current : nextTextarea);
        setGutterHost((current) => current === nextGutterHost ? current : nextGutterHost);
        setAssetHost((current) => current === nextAssetHost ? current : nextAssetHost);
        const nextNodeId = resolveProjectNodeId();
        setNodeId((current) => current === nextNodeId ? current : nextNodeId);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-label", "data-project-node-id"] });
    const interval = window.setInterval(sync, 500);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      observer.disconnect();
      document.querySelectorAll(".project-readme-with-gutter").forEach((node) => node.classList.remove("project-readme-with-gutter"));
      document.querySelectorAll(".project-readme-gutter-host,.project-readme-assets-host").forEach((node) => node.remove());
    };
  }, []);

  if (!textarea || !gutterHost) return null;
  return (
    <>
      {createPortal(<QuickInsertTools textarea={textarea} />, gutterHost)}
      {nodeId && assetHost ? createPortal(<AssetList key={nodeId} nodeId={nodeId} textarea={textarea} />, assetHost) : null}
    </>
  );
}
