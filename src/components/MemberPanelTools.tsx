import { Search, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "../profile-connections.css";
import { getCurrentAccessIdentity } from "../lib/access";
import { LabstarEnhancementStyles } from "./LabstarEnhancementStyles";
import { ProfileConnectionsBridge } from "./ProfileConnectionsBridge";

export function MemberPanelTools() {
  const [target, setTarget] = useState<Element | null>(null);
  const [query, setQuery] = useState("");
  const [canInvite, setCanInvite] = useState(false);

  useEffect(() => {
    const find = () => setTarget(document.querySelector(".channel-members"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getCurrentAccessIdentity().then((identity) => {
      if (cancelled || !identity?.member) return;
      setCanInvite(identity.member.role === "owner" || identity.member.role === "admin");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!target) return;
    const normalized = query.trim().toLocaleLowerCase();
    const rows = Array.from(target.querySelectorAll<HTMLElement>(".channel-member-row"));
    for (const row of rows) {
      const text = row.textContent?.toLocaleLowerCase() ?? "";
      row.hidden = Boolean(normalized) && !text.includes(normalized);
    }
    return () => rows.forEach((row) => { row.hidden = false; });
  }, [target, query]);

  function invite() {
    document.querySelector<HTMLButtonElement>('button[aria-label="Equipe"]')?.click();
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(".secure-invite-button")?.click();
    }, 120);
  }

  const tools = target ? createPortal(
    <div className="member-panel-tools">
      <label><Search size={13}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar membro"/>{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={11}/></button>}</label>
      {canInvite && <button className="member-panel-invite" type="button" onClick={invite} title="Convidar membro"><UserPlus size={14}/><span>Convidar</span></button>}
    </div>,
    target,
  ) : null;

  return <><LabstarEnhancementStyles />{tools}<ProfileConnectionsBridge /></>;
}
