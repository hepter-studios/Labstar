import {
  Bold,
  Braces,
  CheckSquare,
  Code2,
  Download,
  Eye,
  FileCode2,
  FilePlus2,
  GitPullRequest,
  Heading1,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  LoaderCircle,
  Minus,
  PanelLeft,
  Plus,
  Quote,
  Table2,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeveloperMessageBody, type MarkdownAttachment } from "./DeveloperChatContent";

export const README_TEMPLATE = `# Nome do projeto

> Uma descrição curta e forte do que este projeto resolve.

![Demonstração](https://placehold.co/1200x630/080b12/dbe7ff?text=Preview+do+projeto)

## ✨ Recursos

- [x] Estrutura inicial
- [ ] Documentação da API
- [ ] Testes automatizados

## 🚀 Começando

\`\`\`bash
npm install
npm run dev
\`\`\`

## 🧩 Exemplo

\`\`\`typescript
export function hello(name: string) {
  return \`Olá, \${name}!\`;
}
\`\`\`

## 📋 Status

| Área | Estado |
| --- | --- |
| Interface | Em desenvolvimento |
| API | Planejada |

## 🤝 Contribuindo

Descreva aqui o fluxo de contribuição e os padrões do projeto.
`;

type StudioProps = {
  value: string;
  files: File[];
  attachments?: MarkdownAttachment[];
  mode: "compose" | "edit";
  busy?: boolean;
  onChange: (value: string) => void;
  onRequestImage: () => void;
  onCancel: () => void;
  onConfirm: (attachReadme: boolean) => void;
};

function wrapSelection(textarea: HTMLTextAreaElement, value: string, before: string, after: string, fallback: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || fallback;
  return {
    value: `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`,
    start: start + before.length,
    end: start + before.length + selected.length,
  };
}

export function DeveloperMarkdownStudio({ value, files, attachments = [], mode, busy = false, onChange, onRequestImage, onCancel, onConfirm }: StudioProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<"split" | "write" | "preview">("split");
  const [localAttachments, setLocalAttachments] = useState<MarkdownAttachment[]>([]);

  useEffect(() => {
    const previews = files.filter((file) => file.type.startsWith("image/")).map((file) => ({
      fileName: file.name,
      mimeType: file.type,
      url: URL.createObjectURL(file),
    }));
    setLocalAttachments(previews);
    return () => previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  const statistics = useMemo(() => ({
    words: value.trim() ? value.trim().split(/\s+/).length : 0,
    lines: value ? value.split(/\r?\n/).length : 1,
  }), [value]);

  function insert(before: string, after = "", fallback = "texto") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = wrapSelection(textarea, value, before, after, fallback);
    onChange(next.value);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.start, next.end);
    });
  }

  function downloadMarkdown() {
    const blob = new Blob([value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "README.md";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="markdown-studio-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="markdown-studio" role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Editar mensagem Markdown" : "Criar documento Markdown"} onMouseDown={(event) => event.stopPropagation()}>
        <header className="markdown-studio-head">
          <div className="markdown-studio-title"><span>★</span><div><small>LABSTAR DEVELOPER STUDIO</small><strong>{mode === "edit" ? "Editar mensagem" : "README & Markdown"}</strong></div></div>
          <div className="markdown-studio-view">
            <button type="button" className={view === "write" ? "active" : ""} onClick={() => setView("write")} title="Somente editor"><PanelLeft size={15} /></button>
            <button type="button" className={view === "split" ? "active" : ""} onClick={() => setView("split")} title="Editor e prévia"><Braces size={15} /></button>
            <button type="button" className={view === "preview" ? "active" : ""} onClick={() => setView("preview")} title="Somente prévia"><Eye size={15} /></button>
          </div>
          <button className="markdown-studio-close" type="button" onClick={onCancel} aria-label="Fechar editor"><X size={18} /></button>
        </header>

        <div className="markdown-studio-toolbar" aria-label="Formatação Markdown">
          <button type="button" onClick={() => insert("# ", "", "Título")} title="Título"><Heading1 size={15} /></button>
          <button type="button" onClick={() => insert("**", "**", "negrito")} title="Negrito"><Bold size={15} /></button>
          <button type="button" onClick={() => insert("_", "_", "itálico")} title="Itálico"><Italic size={15} /></button>
          <i />
          <button type="button" onClick={() => insert("- ", "", "item")} title="Lista"><List size={15} /></button>
          <button type="button" onClick={() => insert("- [ ] ", "", "tarefa")} title="Tarefa"><CheckSquare size={15} /></button>
          <button type="button" onClick={() => insert("> ", "", "citação")} title="Citação"><Quote size={15} /></button>
          <button type="button" onClick={() => insert("\n---\n", "", "")} title="Separador"><Minus size={15} /></button>
          <i />
          <button type="button" onClick={() => insert("[", "](https://exemplo.com)", "link")} title="Link"><Link2 size={15} /></button>
          <button type="button" onClick={onRequestImage} title="Imagem no documento"><ImagePlus size={15} /></button>
          <button type="button" onClick={() => insert("\n| Coluna | Valor |\n| --- | --- |\n| Item | Conteúdo |\n", "", "")} title="Tabela"><Table2 size={15} /></button>
          <button type="button" onClick={() => insert("\n```typescript\n", "\n```\n", "const exemplo = true;")} title="Bloco de código"><Code2 size={15} /></button>
          <button type="button" onClick={downloadMarkdown} title="Baixar README.md"><Download size={15} /></button>
        </div>

        <div className={`markdown-studio-workspace view-${view}`}>
          {view !== "preview" && (
            <label className="markdown-studio-editor">
              <span><FileCode2 size={13} /> README.md <small>{statistics.lines} linhas · {statistics.words} palavras</small></span>
              <textarea ref={textareaRef} value={value} spellCheck onChange={(event) => onChange(event.target.value)} placeholder="# Escreva seu README aqui…" />
            </label>
          )}
          {view !== "write" && (
            <div className="markdown-studio-preview">
              <header><Eye size={13} /> PRÉVIA GITHUB FLAVORED MARKDOWN</header>
              <article>{value.trim() ? <DeveloperMessageBody body={value} attachments={[...attachments, ...localAttachments]} /> : <div className="markdown-studio-empty"><FilePlus2 size={26} /><strong>Comece a escrever</strong><span>A prévia aparece aqui em tempo real.</span></div>}</article>
            </div>
          )}
        </div>

        <footer className="markdown-studio-footer">
          <span>GFM · tabelas · tarefas · links · imagens · código</span>
          <div>
            <button type="button" onClick={onCancel}>Cancelar</button>
            {mode === "compose" && <button type="button" disabled={!value.trim() || busy} onClick={() => onConfirm(true)}><FilePlus2 size={14} /> Anexar README.md</button>}
            <button className="primary" type="button" disabled={!value.trim() || busy} onClick={() => onConfirm(false)}>{busy ? <LoaderCircle className="spin" size={14} /> : <CheckSquare size={14} />}{mode === "edit" ? "Salvar edição" : "Usar no chat"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

type CreateMenuProps = {
  onUpload: () => void;
  onImage: () => void;
  onCode: () => void;
  onMarkdown: () => void;
  onTemplate: (value: string) => void;
  onClose: () => void;
};

export function DeveloperCreateMenu({ onUpload, onImage, onCode, onMarkdown, onTemplate, onClose }: CreateMenuProps) {
  const action = (callback: () => void) => { callback(); onClose(); };
  return (
    <aside className="developer-create-menu" role="menu" aria-label="Criar no chat">
      <header><span><Plus size={14} /> Criar e enviar</span><button type="button" onClick={onClose} aria-label="Fechar menu"><X size={13} /></button></header>
      <button type="button" role="menuitem" onClick={() => action(onUpload)}><Upload size={18} /><span><strong>Enviar arquivos</strong><small>Código, documentos, patches ou ZIPs</small></span></button>
      <button type="button" role="menuitem" onClick={() => action(onImage)}><ImagePlus size={18} /><span><strong>Imagem no Markdown</strong><small>Anexa e insere no ponto certo</small></span></button>
      <button type="button" role="menuitem" onClick={() => action(onCode)}><Code2 size={18} /><span><strong>Código</strong><small>Linguagens, bloco, Diff e Terminal</small></span></button>
      <button type="button" role="menuitem" onClick={() => action(onMarkdown)}><FileCode2 size={18} /><span><strong>Criar README</strong><small>Editor completo com prévia ao vivo</small></span></button>
      <i />
      <button type="button" role="menuitem" onClick={() => action(() => onTemplate("\n## Tópico\n\n**Contexto:** descreva o problema.\n\n**Decisão:**\n\n- [ ] Próxima ação\n"))}><ListChecks size={18} /><span><strong>Criar tópico técnico</strong><small>Contexto, decisão e checklist</small></span></button>
      <button type="button" role="menuitem" onClick={() => action(() => onTemplate("\n## Revisão de PR\n\n**Link:** https://github.com/empresa/repositorio/pull/123\n\n### Checklist\n- [ ] Código revisado\n- [ ] Testes passaram\n- [ ] Documentação atualizada\n"))}><GitPullRequest size={18} /><span><strong>Revisão de Pull Request</strong><small>Link reconhecido e checklist</small></span></button>
      <button type="button" role="menuitem" onClick={() => action(() => onTemplate("\n```bash\n# Cole o comando e a saída aqui\n\n```\n"))}><Terminal size={18} /><span><strong>Terminal ou log</strong><small>Bloco pronto para diagnóstico</small></span></button>
    </aside>
  );
}
