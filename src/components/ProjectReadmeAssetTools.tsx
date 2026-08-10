import { Download, File, ImagePlus, LoaderCircle, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { formatChatBytes } from "../lib/programmer-files";
import {
  MAX_PROJECT_DOCUMENT_ASSET_BYTES,
  listProjectDocumentAssets,
  projectAssetMarkdownReference,
  removeProjectDocumentAsset,
  uploadProjectDocumentAsset,
  type ProjectDocumentAsset,
} from "../lib/project-document-assets";

type Selection = { start: number; end: number };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertAssetValue(value: string, asset: ProjectDocumentAsset, selection: Selection) {
  const reference = projectAssetMarkdownReference(asset);
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  const prefix = before.length && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after.length && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const insertion = `${prefix}${reference}${suffix}`;
  return {
    value: `${before}${insertion}${after}`,
    cursor: selection.start + insertion.length,
  };
}

function removeAssetReference(value: string, asset: ProjectDocumentAsset) {
  const token = `labstar-attachment:${encodeURIComponent(asset.id)}`;
  const markdown = new RegExp(`!?\\[[^\\]]*\\]\\(${escapeRegex(token)}\\)`, "g");
  return value.replace(markdown, "").replace(/\n{3,}/g, "\n\n");
}

function assetErrorMessage(reason: unknown) {
  const error = reason as { code?: string; message?: string } | null;
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLocaleLowerCase();
  if (text.includes("file_too_large")) return "O arquivo deve ter no máximo 25 MB.";
  if (text.includes("empty_file")) return "Esse arquivo está vazio.";
  if (/42501|permission|denied|row-level/.test(text)) return "Sua conta não tem permissão para anexar arquivos a este projeto.";
  if (/42p01|pgrst205|project_document_assets|schema cache/.test(text)) return "A atualização de anexos do README ainda não está ativa no banco publicado.";
  return "Não foi possível acessar os arquivos deste README agora.";
}

export function ProjectReadmeAssetTools({
  nodeId,
  value,
  onChange,
  textareaRef,
}: {
  nodeId: string;
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [assets, setAssets] = useState<ProjectDocumentAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    setHasError(false);
    void listProjectDocumentAssets(nodeId)
      .then((items) => { if (active) setAssets(items); })
      .catch((reason) => {
        if (!active) return;
        setAssets([]);
        setHasError(true);
        setMessage(assetErrorMessage(reason));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [nodeId]);

  function restoreCursor(cursor: number) {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function insertExisting(asset: ProjectDocumentAsset) {
    const textarea = textareaRef.current;
    const selection = {
      start: textarea?.selectionStart ?? value.length,
      end: textarea?.selectionEnd ?? value.length,
    };
    const next = insertAssetValue(value, asset, selection);
    onChange(next.value);
    restoreCursor(next.cursor);
  }

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setMessage("");
    setHasError(false);
    try {
      const accepted = files.slice(0, 8);
      const textarea = textareaRef.current;
      let nextValue = value;
      let selection: Selection = {
        start: textarea?.selectionStart ?? value.length,
        end: textarea?.selectionEnd ?? value.length,
      };
      const uploaded: ProjectDocumentAsset[] = [];
      for (const file of accepted) {
        if (file.size > MAX_PROJECT_DOCUMENT_ASSET_BYTES) throw new Error("file_too_large");
        if (file.size === 0) throw new Error("empty_file");
        const asset = await uploadProjectDocumentAsset(nodeId, file);
        uploaded.push(asset);
        const next = insertAssetValue(nextValue, asset, selection);
        nextValue = next.value;
        selection = { start: next.cursor, end: next.cursor };
      }
      setAssets((current) => [...current, ...uploaded]);
      onChange(nextValue);
      restoreCursor(selection.start);
      setMessage(accepted.length === 1 ? "Arquivo inserido no documento." : `${accepted.length} arquivos inseridos no documento.`);
    } catch (reason) {
      setHasError(true);
      setMessage(assetErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: ProjectDocumentAsset) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setHasError(false);
    try {
      await removeProjectDocumentAsset(asset);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      onChange(removeAssetReference(value, asset));
      setMessage("Arquivo removido do documento e do projeto.");
    } catch (reason) {
      setHasError(true);
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
        <div><strong>Imagens e arquivos</strong><span>O item entra na posição atual do cursor e aparece imediatamente na prévia.</span></div>
        <div>
          <button type="button" disabled={busy || loading} onClick={() => imageInput.current?.click()}><ImagePlus size={14} /> Imagem</button>
          <button type="button" disabled={busy || loading} onClick={() => fileInput.current?.click()}><Paperclip size={14} /> Arquivo</button>
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
      {!loading && message && <div className={`project-readme-assets-status${hasError ? " error" : ""}`} role={hasError ? "alert" : "status"}>{message}</div>}

      {!!assets.length && (
        <div className="project-readme-assets-list">
          {assets.map((asset) => (
            <article key={asset.id}>
              <span className="project-readme-asset-preview">
                {asset.mimeType.startsWith("image/") ? <img src={asset.url} alt="" /> : <File size={16} />}
              </span>
              <div><strong>{asset.fileName}</strong><small>{formatChatBytes(asset.sizeBytes)}</small></div>
              <button type="button" disabled={busy} title="Inserir na posição atual do cursor" onClick={() => insertExisting(asset)}><Plus size={13} /></button>
              <a href={asset.url} target="_blank" rel="noreferrer" download={asset.fileName} title="Abrir ou baixar"><Download size={13} /></a>
              <button className="danger" type="button" disabled={busy} title="Remover arquivo" onClick={() => void remove(asset)}><Trash2 size={13} /></button>
            </article>
          ))}
        </div>
      )}
      <small className="project-readme-assets-hint">Você também pode arrastar imagens ou arquivos para esta área. Limite: 25 MB por arquivo.</small>
    </div>
  );
}
