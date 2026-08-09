import { Download, File, ImagePlus, LoaderCircle, Paperclip, Plus, Trash2 } from "lucide-react";
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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string, selection?: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  window.requestAnimationFrame(() => {
    textarea.focus();
    if (selection !== undefined) textarea.setSelectionRange(selection, selection);
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentSelection(textarea: HTMLTextAreaElement): Selection {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  return { start, end };
}

function insertAsset(textarea: HTMLTextAreaElement, asset: ProjectDocumentAsset, selection = currentSelection(textarea)) {
  const reference = projectAssetMarkdownReference(asset);
  const before = textarea.value.slice(0, selection.start);
  const after = textarea.value.slice(selection.end);
  const prefix = before.length && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after.length && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const insertion = `${prefix}${reference}${suffix}`;
  const cursor = selection.start + insertion.length;
  setTextareaValue(textarea, `${before}${insertion}${after}`, cursor);
  return cursor;
}

function removeAssetReference(textarea: HTMLTextAreaElement, asset: ProjectDocumentAsset) {
  const token = `labstar-attachment:${encodeURIComponent(asset.id)}`;
  const markdown = new RegExp(`!?\\[[^\\]]*\\]\\(${escapeRegex(token)}\\)`, "g");
  const next = textarea.value.replace(markdown, "").replace(/\n{3,}/g, "\n\n").trim();
  setTextareaValue(textarea, next);
}

function assetErrorMessage(reason: unknown) {
  const error = reason as { code?: string; message?: string } | null;
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLocaleLowerCase();
  if (text.includes("file_too_large")) return "O arquivo deve ter no máximo 25 MB.";
  if (text.includes("empty_file")) return "Esse arquivo está vazio.";
  if (/42501|permission|denied|row-level/.test(text)) return "Sua conta não tem permissão para anexar arquivos a este projeto.";
  if (/42p01|pgrst205|project_document_assets|schema cache/.test(text)) return "A atualização de anexos do README ainda não está ativa no banco publicado.";
  return "Não foi possível enviar esse arquivo agora.";
}

function readWorkspaceNodeIdByName(name: string) {
  if (!name) return "";
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return "";
    const normalized = name.trim().toLocaleLowerCase();
    const match = parsed.find((value) => {
      if (!value || typeof value !== "object") return false;
      const candidate = value as { name?: unknown };
      return typeof candidate.name === "string" && candidate.name.trim().toLocaleLowerCase() === normalized;
    }) as { id?: unknown } | undefined;
    return typeof match?.id === "string" ? match.id : "";
  } catch {
    return "";
  }
}

function resolveProjectNodeId(modal: HTMLElement) {
  const selectedCard = document.querySelector<HTMLElement>(".node-card.selected[data-project-node-id]");
  if (selectedCard?.dataset.projectNodeId) return selectedCard.dataset.projectNodeId;

  const ariaLabel = modal.getAttribute("aria-label") ?? "";
  const ariaName = ariaLabel.replace(/^Detalhes de\s+/i, "").trim();
  const headerName = modal.querySelector<HTMLElement>("header strong")?.textContent?.trim() ?? "";
  return readWorkspaceNodeIdByName(ariaName || headerName);
}

function notifyAssetsChanged(nodeId: string) {
  window.dispatchEvent(new CustomEvent(PROJECT_ASSET_REFRESH_EVENT, { detail: { nodeId } }));
}

function QuickInsertTools({ nodeId, textarea }: { nodeId: string; textarea: HTMLTextAreaElement }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Selection>(currentSelection(textarea));
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
  }, []);

  function rememberSelection() {
    selectionRef.current = currentSelection(textarea);
  }

  function flash(text: string) {
    setMessage(text);
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => setMessage(""), 2600);
  }

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      const accepted = files.slice(0, 8);
      let selection = selectionRef.current;
      for (const file of accepted) {
        if (file.size > MAX_PROJECT_DOCUMENT_ASSET_BYTES) throw new Error("file_too_large");
        if (file.size === 0) throw new Error("empty_file");
        const asset = await uploadProjectDocumentAsset(nodeId, file);
        const cursor = insertAsset(textarea, asset, selection);
        selection = { start: cursor, end: cursor };
      }
      selectionRef.current = selection;
      notifyAssetsChanged(nodeId);
      flash(accepted.length === 1 ? "Inserido na linha atual." : `${accepted.length} itens inseridos.`);
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
        aria-label="Inserir imagem na posição atual do cursor"
        onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }}
        onClick={() => imageInput.current?.click()}
      >{busy ? <LoaderCircle className="spin" size={13} /> : <ImagePlus size={13} />}</button>
      <button
        type="button"
        disabled={busy}
        title="Inserir arquivo na posição atual do cursor"
        aria-label="Inserir arquivo na posição atual do cursor"
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

function ReadmeAssetTools({ nodeId, textarea }: { nodeId: string; textarea: HTMLTextAreaElement }) {
  const [assets, setAssets] = useState<ProjectDocumentAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Selection>(currentSelection(textarea));

  async function refresh() {
    setLoading(true);
    try {
      setAssets(await listProjectDocumentAssets(nodeId));
      setMessage("");
    } catch (reason) {
      setAssets([]);
      setMessage(assetErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [nodeId]);
  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === nodeId) void refresh();
    };
    window.addEventListener(PROJECT_ASSET_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(PROJECT_ASSET_REFRESH_EVENT, handleRefresh);
  }, [nodeId]);

  function rememberSelection() {
    selectionRef.current = currentSelection(textarea);
  }

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const accepted = files.slice(0, 8);
      let selection = selectionRef.current;
      for (const file of accepted) {
        if (file.size > MAX_PROJECT_DOCUMENT_ASSET_BYTES) throw new Error("file_too_large");
        if (file.size === 0) throw new Error("empty_file");
        const asset = await uploadProjectDocumentAsset(nodeId, file);
        setAssets((current) => [...current, asset]);
        const cursor = insertAsset(textarea, asset, selection);
        selection = { start: cursor, end: cursor };
      }
      selectionRef.current = selection;
      setMessage(accepted.length === 1 ? "Arquivo inserido na linha atual do documento." : `${accepted.length} arquivos inseridos a partir da linha atual.`);
    } catch (reason) {
      setMessage(assetErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: ProjectDocumentAsset) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await removeProjectDocumentAsset(asset);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      removeAssetReference(textarea, asset);
      setMessage("Arquivo removido do documento e do projeto.");
    } catch (reason) {
      setMessage(assetErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="project-readme-assets"
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={(event) => {
        event.preventDefault();
        rememberSelection();
        void upload(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="project-readme-assets-head">
        <div><strong>Imagens e arquivos</strong><span>Os dois ícones dentro do editor inserem diretamente na posição atual do cursor. Aqui você também pode gerenciar os anexos.</span></div>
        <div>
          <button type="button" disabled={busy || loading} onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }} onClick={() => imageInput.current?.click()}><ImagePlus size={14} /> Imagem</button>
          <button type="button" disabled={busy || loading} onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }} onClick={() => fileInput.current?.click()}><Paperclip size={14} /> Arquivo</button>
        </div>
      </div>

      <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => {
        void upload(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = "";
      }} />
      <input ref={fileInput} hidden type="file" multiple onChange={(event) => {
        void upload(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = "";
      }} />

      {loading && <div className="project-readme-assets-status"><LoaderCircle className="spin" size={14} /> Carregando arquivos…</div>}
      {!loading && message && <div className="project-readme-assets-status">{message}</div>}

      {!!assets.length && (
        <div className="project-readme-assets-list">
          {assets.map((asset) => (
            <article key={asset.id}>
              <span className="project-readme-asset-preview">
                {asset.mimeType.startsWith("image/") ? <img src={asset.url} alt="" /> : <File size={16} />}
              </span>
              <div><strong>{asset.fileName}</strong><small>{formatChatBytes(asset.sizeBytes)}</small></div>
              <button type="button" disabled={busy} title="Inserir na linha atual do Markdown" onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }} onClick={() => insertAsset(textarea, asset, selectionRef.current)}><Plus size={13} /></button>
              <a href={asset.url} target="_blank" rel="noreferrer" download={asset.fileName} title="Abrir ou baixar"><Download size={13} /></a>
              <button className="danger" type="button" disabled={busy} title="Remover arquivo" onClick={() => void remove(asset)}><Trash2 size={13} /></button>
            </article>
          ))}
        </div>
      )}
      <small className="project-readme-assets-hint">Também aceita arrastar e soltar. Limite: 25 MB por arquivo.</small>
    </div>
  );
}

export function ProjectReadmeAssetsBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [gutterHost, setGutterHost] = useState<HTMLElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [nodeId, setNodeId] = useState("");

  useEffect(() => {
    void listProjectDocumentAssets().catch(() => undefined);

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const modal = document.querySelector<HTMLElement>(".project-details-modal");
        const nextTextarea = modal?.querySelector<HTMLTextAreaElement>(".project-markdown-input") ?? null;
        if (!modal || !nextTextarea) {
          setHost(null);
          setGutterHost(null);
          setTextarea(null);
          setNodeId("");
          return;
        }

        const nextNodeId = resolveProjectNodeId(modal);
        if (!nextNodeId) {
          setHost(null);
          setGutterHost(null);
          setTextarea(null);
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

        let nextHost = parent.querySelector<HTMLElement>(":scope > .project-readme-assets-host");
        if (!nextHost) {
          nextHost = document.createElement("div");
          nextHost.className = "project-readme-assets-host";
          label.insertAdjacentElement("afterend", nextHost);
        }
        setHost((current) => current === nextHost ? current : nextHost);
        setGutterHost((current) => current === nextGutterHost ? current : nextGutterHost);
        setTextarea((current) => current === nextTextarea ? current : nextTextarea);
        setNodeId((current) => current === nextNodeId ? current : nextNodeId);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-label", "data-project-node-id"] });
    const interval = window.setInterval(sync, 700);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      observer.disconnect();
      document.querySelectorAll(".project-readme-with-gutter").forEach((node) => node.classList.remove("project-readme-with-gutter"));
      document.querySelectorAll(".project-readme-gutter-host,.project-readme-assets-host").forEach((node) => node.remove());
    };
  }, []);

  if (!host || !gutterHost || !textarea || !nodeId) return null;
  return (
    <>
      {createPortal(<QuickInsertTools key={`quick-${nodeId}`} nodeId={nodeId} textarea={textarea} />, gutterHost)}
      {createPortal(<ReadmeAssetTools key={nodeId} nodeId={nodeId} textarea={textarea} />, host)}
    </>
  );
}
