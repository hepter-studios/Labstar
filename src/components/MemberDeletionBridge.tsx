import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentAccessIdentity } from "../lib/access";
import { deleteLabstarMember } from "../lib/member-admin";
import { listMembers, type Member } from "../lib/supabase";

type Selection = { target: Element; member: Member };

export function MemberDeletionBridge() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [currentId, setCurrentId] = useState("");
  const [canDelete, setCanDelete] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const identity = await getCurrentAccessIdentity();
      if (disposed || !identity?.member) return;
      setCurrentId(identity.member.id);
      setCanDelete(identity.member.role === "owner" || identity.member.role === "admin");
    };
    void refresh().catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!canDelete) return;
    let disposed = false;
    let timer = 0;

    const locate = async () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const editor = document.querySelector(".member-editor");
        const profile = editor?.querySelector(".member-profile");
        const email = profile?.querySelector("small")?.textContent?.trim().toLocaleLowerCase() ?? "";
        if (!editor || !profile || !email) {
          if (!disposed) setSelection(null);
          return;
        }
        try {
          const team = await listMembers();
          const member = team.members.find((item) => item.email.trim().toLocaleLowerCase() === email);
          if (!member || member.id === currentId || member.role === "owner") {
            if (!disposed) setSelection(null);
            return;
          }
          let mount = editor.querySelector(".member-delete-bridge-mount");
          if (!mount) {
            mount = document.createElement("div");
            mount.className = "member-delete-bridge-mount";
            editor.appendChild(mount);
          }
          if (!disposed) setSelection({ target: mount, member });
        } catch {
          if (!disposed) setSelection(null);
        }
      }, 120);
    };

    const observer = new MutationObserver(() => void locate());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    void locate();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [canDelete, currentId]);

  const expected = useMemo(() => selection?.member.email ?? "", [selection]);

  async function remove() {
    if (!selection || typed.trim().toLocaleLowerCase() !== expected.toLocaleLowerCase()) return;
    setBusy(true);
    setError("");
    try {
      await deleteLabstarMember(selection.member.id);
      setConfirming(false);
      window.setTimeout(() => window.location.reload(), 120);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "delete_failed";
      setError(message === "cannot_delete_self"
        ? "Sua própria conta não pode ser excluída por aqui."
        : message === "cannot_delete_owner"
          ? "A conta proprietária não pode ser excluída."
          : message === "not_allowed"
            ? "Somente owner ou administrador pode excluir usuários."
            : "O banco preservou este usuário porque ainda existem dados vinculados. Suspenda o acesso ou revise os vínculos antes de excluir.");
    } finally {
      setBusy(false);
    }
  }

  if (!selection) return null;

  return <>
    {createPortal(
      <button className="member-delete-button" type="button" onClick={() => { setTyped(""); setError(""); setConfirming(true); }}>
        <Trash2 size={14} /> Excluir usuário
      </button>,
      selection.target,
    )}
    {confirming && createPortal(
      <div className="member-delete-backdrop" onMouseDown={() => !busy && setConfirming(false)}>
        <section className="member-delete-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <header><span><AlertTriangle size={18} /></span><div><strong>Excluir usuário do Labstar</strong><small>Esta ação remove o cadastro e o acesso desta pessoa.</small></div><button type="button" onClick={() => setConfirming(false)} disabled={busy}><X size={16} /></button></header>
          <p>Você está removendo <b>{selection.member.name}</b> ({selection.member.email}). O owner e sua própria conta são protegidos contra exclusão acidental.</p>
          <label>Digite o e-mail para confirmar<input autoFocus value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={selection.member.email} /></label>
          {error && <div className="member-delete-error"><AlertTriangle size={13} /> {error}</div>}
          <footer><button type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</button><button className="danger" type="button" disabled={busy || typed.trim().toLocaleLowerCase() !== expected.toLocaleLowerCase()} onClick={() => void remove()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Excluir definitivamente</button></footer>
        </section>
      </div>, document.body,
    )}
  </>;
}
