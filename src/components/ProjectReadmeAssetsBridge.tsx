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

function insertAsset(textarea: HTMLTextAreaElement, asset: ProjectDocumentAsset) {
  const reference = projectAssetMarkdownReference(asset);
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before.length && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after.length && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const insertion = `${prefix}${reference}${suffix}`;
  setTextareaValue(textarea, `${before}${insertion}${after}`, start + insertion.length);
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
  if (/42p01|pgrst205|project_document_assets|schema cache/.test(text)) return "A atualização de anexos do README ainda está sendo aplicada no banco.";
  return "Não foi possível enviar esse arquivo agora.";
}

function ReadmeAssetTools({ nodeId, textarea }: { nodeId: string; textarea: HTMLTextAreaElement }) {
  const [assets, setAssets] = useState<ProjectDocumentAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setAssets(await listProjectDocumentAssets(nodeId));
    } catch {
      setAssets([]);
    }
  }

  useEffect(() => { void refresh(); }, [nodeId]);

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const accepted = files.slice(0, 8);
      for (const file of accepted) {
        if (file.size > MAX_PROJECT_DOCUMENT_ASSET_BYTES) throw new Error("file_too_large");
        const asset = await uploadProjectDocumentAsset(nodeId, file);
        setAssets((current) => [...current, asset]);
        insertAsset(textarea, asset);
      }
      setMessage(accepted.length === 1 ? "Arquivo inserido no documento." : `${accepted.length} arquivos inseridos no documento.`);
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
        void upload(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="project-readme-assets-head">
        <div><strong>Imagens e arquivos</strong><span>Envie e o Labstar insere a referência no ponto atual do Markdown.</span></div>
        <div>
          <button type="button" disabled={busy} onClick={() => imageInput.current?.click()}><ImagePlus size={14} /> Imagem</button>
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Paperclip size={14} /> Arquivo</button>
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

      {busy && <div className="project-readme-assets-status"><LoaderCircle className="spin" size={14} /> Enviando arquivo…</div>}
      {!busy && message && <div className="project-readme-assets-status">{message}</div>}

      {!!assets.length && (
        <div className="project-readme-assets-list">
          {assets.map((asset) => (
            <article key={asset.id}>
              <span className="project-readme-asset-preview">
                {asset.mimeType.startsWith("image/") ? <img src={asset.url} alt="" /> : <File size={16} />}
              </span>
              <div><strong>{asset.fileName}</strong><small>{formatChatBytes(asset.sizeBytes)}</small></div>
              <button type="button" title="Inserir novamente no Markdown" onClick={() => insertAsset(textarea, asset)}><Plus size={13} /></button>
              <a href={asset.url} target="_blank" rel="noreferrer" download={asset.fileName} title="Abrir ou baixar"><Download size={13} /></a>
              <button className="danger" type="button" title="Remover arquivo" onClick={() => void remove(asset)}><Trash2 size={13} /></button>
            </article>
          ))}
        </div>
      )}
      <small className="project-readme-assets-hint">Você também pode arrastar imagens ou arquivos para esta área. Limite: 25 MB por arquivo.</small>
    </div>
  );
}

export function ProjectReadmeAssetsBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [nodeId, setNodeId] = useState("");

  useEffect(() => {
    // Pré-carrega o registro de URLs assinadas para imagens/links renderizados no README.
    void listProjectDocumentAssets().catch(() => undefined);

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextTextarea = document.querySelector<HTMLTextAreaElement>(".project-details-modal .project-markdown-input");
        const selectedCard = document.querySelector<HTMLElement>(".node-card.selected[data-project-node-id]");
        const nextNodeId = selectedCard?.dataset.projectNodeId ?? "";
        if (!nextTextarea || !nextNodeId) {
          setHost(null);
          setTextarea(null);
          setNodeId("");
          return;
        }

        const label = nextTextarea.closest("label");
        const parent = label?.parentElement;
        if (!label || !parent) return;
        let nextHost = parent.querySelector<HTMLElement>(":scope > .project-readme-assets-host");
        if (!nextHost) {
          nextHost = document.createElement("div");
          nextHost.className = "project-readme-assets-host";
          label.insertAdjacentElement("afterend", nextHost);
        }
        setHost(nextHost);
        setTextarea(nextTextarea);
        setNodeId(nextNodeId);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.querySelectorAll(".project-readme-assets-host").forEach((node) => node.remove());
    };
  }, []);

  if (!host || !textarea || !nodeId) return null;
  return createPortal(<ReadmeAssetTools nodeId={nodeId} textarea={textarea} />, host);
}
