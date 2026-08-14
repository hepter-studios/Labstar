import { Braces, Code2, FileDiff, Terminal, X } from "lucide-react";
import { useState, type KeyboardEvent, type RefObject } from "react";

const languages = [
  ["typescript", "TypeScript"], ["javascript", "JavaScript"], ["tsx", "React TSX"],
  ["jsx", "React JSX"], ["python", "Python"], ["rust", "Rust"], ["go", "Go"],
  ["sql", "SQL"], ["json", "JSON"], ["bash", "Bash"], ["powershell", "PowerShell"],
  ["java", "Java"], ["kotlin", "Kotlin"], ["csharp", "C#"], ["c", "C"],
  ["cpp", "C++"], ["php", "PHP"], ["ruby", "Ruby"], ["swift", "Swift"],
  ["dart", "Dart"], ["vue", "Vue"], ["svelte", "Svelte"], ["html", "HTML"],
  ["css", "CSS"], ["scss", "SCSS"], ["yaml", "YAML"], ["toml", "TOML"],
  ["dockerfile", "Dockerfile"], ["graphql", "GraphQL"], ["markdown", "Markdown"],
] as const;

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onClose?: () => void;
};

function replaceSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (value: string) => void,
  replacement: string,
  selectionOffset: number,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  onChange(next);
  window.requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + selectionOffset;
    textarea.setSelectionRange(cursor, cursor);
  });
}

export function handleDeveloperComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (value: string) => void,
) {
  const textarea = event.currentTarget;
  if (event.key === "Tab") {
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    if (event.shiftKey) {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const block = value.slice(lineStart, end);
      const unindented = block.replace(/^ {1,2}/gm, "");
      onChange(`${value.slice(0, lineStart)}${unindented}${value.slice(end)}`);
      window.requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart + unindented.length));
    } else if (selected.includes("\n")) {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const block = value.slice(lineStart, end);
      const indented = block.replace(/^/gm, "  ");
      onChange(`${value.slice(0, lineStart)}${indented}${value.slice(end)}`);
      window.requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart + indented.length));
    } else {
      replaceSelection(textarea, value, onChange, "  ", 2);
    }
    return true;
  }
  return false;
}

export function DeveloperComposerTools({ textareaRef, value, onChange, disabled = false, onClose }: Props) {
  const [language, setLanguage] = useState("typescript");

  function insertFence(kind = language) {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const selected = value.slice(textarea.selectionStart, textarea.selectionEnd);
    const replacement = `\`\`\`${kind}\n${selected}\n\`\`\``;
    replaceSelection(textarea, value, onChange, replacement, selected ? replacement.length : kind.length + 4);
  }

  function insertInlineCode() {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const selected = value.slice(textarea.selectionStart, textarea.selectionEnd);
    const replacement = `\`${selected}\``;
    replaceSelection(textarea, value, onChange, replacement, selected ? replacement.length : 1);
  }

  return (
    <div className="developer-composer-tools" aria-label="Ferramentas de código">
      <span><Braces size={13} /> Código</span>
      <select value={language} disabled={disabled} onChange={(event) => setLanguage(event.target.value)} aria-label="Linguagem do bloco de código">
        {languages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <button type="button" disabled={disabled} onClick={() => insertFence()} title="Inserir bloco de código"><Code2 size={13} /> Bloco</button>
      <button type="button" disabled={disabled} onClick={insertInlineCode} title="Marcar seleção como código em linha">` código `</button>
      <button type="button" disabled={disabled} onClick={() => insertFence("diff")} title="Inserir patch ou diff"><FileDiff size={13} /> Diff</button>
      <button type="button" disabled={disabled} onClick={() => insertFence("bash")} title="Inserir comando de terminal"><Terminal size={13} /> Terminal</button>
      <small>Tab indenta · Shift+Tab recua · Shift+Enter quebra linha</small>
      {onClose && <button className="developer-code-close" type="button" onClick={onClose} title="Fechar modo de código" aria-label="Fechar modo de código"><X size={14} /></button>}
    </div>
  );
}
