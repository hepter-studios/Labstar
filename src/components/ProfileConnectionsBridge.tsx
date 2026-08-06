import {
  CheckCircle2,
  ExternalLink,
  Github,
  Instagram,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Save,
  Unlink,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  connectGithubIdentity,
  disconnectGithubIdentity,
  getCurrentProfileConnections,
  listMemberProfileConnections,
  saveInstagramConnection,
  syncConnectedGithubProfile,
  takePendingProfileConnection,
  type GithubPublicProfile,
  type PublicProfileConnections,
} from "../lib/profile-connections";

const emptyConnections: PublicProfileConnections = { github: null, instagramUsername: "" };

function githubLabel(profile: GithubPublicProfile) {
  return profile.name || `@${profile.username}`;
}

function ConnectionLinks({ connections, compact = false }: { connections: PublicProfileConnections; compact?: boolean }) {
  if (!connections.github && !connections.instagramUsername) return null;
  return (
    <div className={`public-connections ${compact ? "compact" : ""}`}>
      {connections.github && (
        <a href={connections.github.profileUrl} target="_blank" rel="noreferrer" title="Abrir perfil verificado no GitHub">
          <Github size={compact ? 13 : 15} />
          <span>{compact ? `@${connections.github.username}` : githubLabel(connections.github)}</span>
          {connections.github.verified && <CheckCircle2 size={11} />}
        </a>
      )}
      {connections.instagramUsername && (
        <a href={`https://www.instagram.com/${connections.instagramUsername}/`} target="_blank" rel="noreferrer" title="Abrir Instagram">
          <Instagram size={compact ? 13 : 15} />
          <span>@{connections.instagramUsername}</span>
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function MemberDirectoryConnections() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [connections, setConnections] = useState(emptyConnections);
  const directoryRef = useRef<Awaited<ReturnType<typeof listMemberProfileConnections>>>([]);

  useEffect(() => {
    let cancelled = false;
    void listMemberProfileConnections().then((items) => {
      if (!cancelled) directoryRef.current = items;
    });

    const findTarget = () => {
      const profile = document.querySelector<HTMLElement>(".member-editor .member-profile");
      if (!profile) {
        setTarget(null);
        return;
      }
      let mount = profile.parentElement?.querySelector<HTMLElement>(":scope > .member-directory-connections-mount") ?? null;
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "member-directory-connections-mount";
        profile.insertAdjacentElement("afterend", mount);
      }
      const email = profile.querySelector("small")?.textContent?.trim().toLowerCase() ?? "";
      const match = directoryRef.current.find((entry) => entry.email === email);
      setConnections(match ? { github: match.github, instagramUsername: match.instagramUsername } : emptyConnections);
      setTarget(mount);
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  if (!target || (!connections.github && !connections.instagramUsername)) return null;
  return createPortal(
    <section className="member-directory-connections">
      <small>CONTAS CONECTADAS</small>
      <ConnectionLinks connections={connections} compact />
    </section>,
    target,
  );
}

export function ProfileConnectionsBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [connections, setConnections] = useState(emptyConnections);
  const [githubLinked, setGithubLinked] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const oauthSyncRef = useRef(false);

  useEffect(() => {
    const pending = takePendingProfileConnection() === "github";
    const linkedByQuery = new URLSearchParams(window.location.search).get("linked") === "github";
    oauthSyncRef.current = pending || linkedByQuery;

    const findProfilePanel = () => {
      const panel = document.querySelector<HTMLElement>(".quick-panel.profile");
      if (!panel) {
        setTarget(null);
        if (oauthSyncRef.current) document.querySelector<HTMLButtonElement>(".avatar-button")?.click();
        return;
      }
      let mount = panel.querySelector<HTMLElement>(":scope > .profile-connections-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "profile-connections-mount";
        const signOut = panel.querySelector(".sign-out");
        if (signOut) panel.insertBefore(mount, signOut);
        else panel.appendChild(mount);
      }
      setTarget(mount);
    };

    findProfilePanel();
    const observer = new MutationObserver(findProfilePanel);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function loadConnections(syncGithub = false) {
    setLoading(true);
    setMessage(syncGithub ? "Confirmando o perfil do GitHub..." : "");
    try {
      if (syncGithub) await syncConnectedGithubProfile();
      const current = await getCurrentProfileConnections();
      setConnections({ github: current.github, instagramUsername: current.instagramUsername });
      setGithubLinked(current.githubIdentityLinked);
      setInstagram(current.instagramUsername);
      if (syncGithub) setMessage("GitHub conectado e perfil verificado.");
      if (syncGithub) {
        const url = new URL(window.location.href);
        url.searchParams.delete("linked");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "connection_failed";
      setMessage(code.includes("manual")
        ? "A conexão manual de identidades precisa estar ativa no Supabase."
        : syncGithub
          ? "O GitHub autorizou a conta, mas não foi possível sincronizar o perfil. Tente atualizar."
          : "Não foi possível carregar as contas conectadas agora.");
    } finally {
      setLoading(false);
      oauthSyncRef.current = false;
    }
  }

  useEffect(() => {
    if (!target) return;
    void loadConnections(oauthSyncRef.current);
  }, [target]);

  async function connectGithub() {
    setLoading(true);
    setMessage("Abrindo a autorização segura do GitHub...");
    try {
      await connectGithubIdentity();
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setMessage(text.toLocaleLowerCase().includes("manual")
        ? "Ative Manual Linking nas configurações de autenticação do Supabase."
        : "Não foi possível iniciar a conexão com o GitHub.");
      setLoading(false);
    }
  }

  async function refreshGithub() {
    setLoading(true);
    setMessage("Atualizando dados públicos do GitHub...");
    try {
      const github = await syncConnectedGithubProfile();
      setConnections((current) => ({ ...current, github }));
      setGithubLinked(true);
      setMessage("Perfil do GitHub atualizado.");
    } catch {
      setMessage("Não foi possível atualizar o GitHub. Reconecte a conta se necessário.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnectGithub() {
    setLoading(true);
    setMessage("Desconectando GitHub...");
    try {
      await disconnectGithubIdentity();
      setConnections((current) => ({ ...current, github: null }));
      setGithubLinked(false);
      setMessage("GitHub desconectado do perfil público.");
    } catch {
      setMessage("Não foi possível desconectar. A conta precisa manter pelo menos uma forma de entrada.");
    } finally {
      setLoading(false);
    }
  }

  async function saveInstagram() {
    setLoading(true);
    setMessage("Salvando Instagram...");
    try {
      const normalized = await saveInstagramConnection(instagram);
      setInstagram(normalized);
      setConnections((current) => ({ ...current, instagramUsername: normalized }));
      setMessage(normalized ? "Instagram adicionado ao perfil público." : "Instagram removido do perfil.");
    } catch {
      setMessage("Use apenas o @usuário ou um link válido do Instagram.");
    } finally {
      setLoading(false);
    }
  }

  const hasPublicConnections = useMemo(
    () => Boolean(connections.github || connections.instagramUsername),
    [connections],
  );

  const portal = target ? createPortal(
    <section className="profile-connections" aria-label="Contas conectadas">
      <div className="profile-connections-head">
        <div><strong>Contas conectadas</strong><small>Perfis públicos exibidos para a equipe.</small></div>
        {loading && <LoaderCircle className="spin" size={15} />}
      </div>

      <article className={`connection-card github ${githubLinked ? "connected" : ""}`}>
        <span className="connection-icon"><Github size={18} /></span>
        <div className="connection-copy">
          <b>GitHub {githubLinked && <em><CheckCircle2 size={10} /> Verificado</em>}</b>
          {connections.github ? (
            <>
              <a href={connections.github.profileUrl} target="_blank" rel="noreferrer">@{connections.github.username}<ExternalLink size={10} /></a>
              {connections.github.bio && <p>{connections.github.bio}</p>}
              <div className="github-profile-meta">
                <span><strong>{connections.github.publicRepos}</strong> repositórios</span>
                <span><strong>{connections.github.followers}</strong> seguidores</span>
                {connections.github.location && <span><MapPin size={10} />{connections.github.location}</span>}
              </div>
            </>
          ) : <small>Conecte sua conta para trazer o perfil de desenvolvedor ao Labstar.</small>}
        </div>
        <div className="connection-actions">
          {!githubLinked ? (
            <button type="button" disabled={loading} onClick={() => void connectGithub()}><Github size={13} /> Conectar</button>
          ) : (
            <>
              <button type="button" disabled={loading} onClick={() => void refreshGithub()} title="Atualizar perfil"><RefreshCw size={12} /></button>
              <button className="danger" type="button" disabled={loading} onClick={() => void disconnectGithub()} title="Desconectar GitHub"><Unlink size={12} /></button>
            </>
          )}
        </div>
      </article>

      <article className={`connection-card instagram ${connections.instagramUsername ? "connected" : ""}`}>
        <span className="connection-icon"><Instagram size={18} /></span>
        <div className="connection-copy">
          <b>Instagram</b>
          <label><span>@</span><input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="seu.usuario" maxLength={80} /></label>
        </div>
        <div className="connection-actions"><button type="button" disabled={loading} onClick={() => void saveInstagram()}><Save size={12} /> Salvar</button></div>
      </article>

      {hasPublicConnections && <div className="connection-preview"><small>VISÍVEL NO SEU PERFIL</small><ConnectionLinks connections={connections} /></div>}
      {message && <p className="connection-message">{message}</p>}
    </section>,
    target,
  ) : null;

  return <>{portal}<MemberDirectoryConnections /></>;
}
