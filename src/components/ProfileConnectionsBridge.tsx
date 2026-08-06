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
  connectGithubProfile,
  disconnectGithubProfile,
  getCurrentProfileConnections,
  listMemberProfileConnections,
  refreshGithubProfile,
  saveInstagramConnection,
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
        <a href={connections.github.profileUrl} target="_blank" rel="noreferrer" title="Abrir perfil no GitHub">
          <Github size={compact ? 13 : 15} />
          <span>{compact ? `@${connections.github.username}` : githubLabel(connections.github)}</span>
          <ExternalLink size={10} />
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
  const [githubInput, setGithubInput] = useState("");
  const [instagram, setInstagram] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const findProfilePanel = () => {
      const panel = document.querySelector<HTMLElement>(".quick-panel.profile");
      if (!panel) {
        setTarget(null);
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

  async function loadConnections() {
    setLoading(true);
    try {
      const current = await getCurrentProfileConnections();
      setConnections(current);
      setGithubInput(current.github?.username ?? "");
      setInstagram(current.instagramUsername);
      setMessage("");
    } catch {
      setMessage("Não foi possível carregar as contas conectadas agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!target) return;
    void loadConnections();
  }, [target]);

  async function connectGithub() {
    setLoading(true);
    setMessage("Buscando seu perfil público no GitHub...");
    try {
      const github = await connectGithubProfile(githubInput);
      setConnections((current) => ({ ...current, github }));
      setGithubInput(github.username);
      setMessage("GitHub adicionado ao perfil do Labstar. O login não foi alterado.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code === "github_profile_not_found"
        ? "Esse usuário não foi encontrado no GitHub."
        : code === "invalid_github_username"
          ? "Use o @usuário ou o link completo do perfil no GitHub."
          : "Não foi possível importar o perfil do GitHub agora.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshGithub() {
    const username = connections.github?.username || githubInput;
    if (!username) return;
    setLoading(true);
    setMessage("Atualizando dados públicos do GitHub...");
    try {
      const github = await refreshGithubProfile(username);
      setConnections((current) => ({ ...current, github }));
      setGithubInput(github.username);
      setMessage("Perfil do GitHub atualizado.");
    } catch {
      setMessage("Não foi possível atualizar o GitHub agora.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnectGithub() {
    setLoading(true);
    setMessage("Removendo GitHub do perfil...");
    try {
      await disconnectGithubProfile();
      setConnections((current) => ({ ...current, github: null }));
      setGithubInput("");
      setMessage("GitHub removido do perfil. Seu login continua igual.");
    } catch {
      setMessage("Não foi possível remover o GitHub do perfil.");
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
        <div><strong>Contas conectadas</strong><small>Somente perfis públicos dentro do Labstar. O login não muda.</small></div>
        {loading && <LoaderCircle className="spin" size={15} />}
      </div>

      <article className={`connection-card github ${connections.github ? "connected" : ""}`}>
        <span className="connection-icon"><Github size={18} /></span>
        <div className="connection-copy">
          <b>GitHub {connections.github && <em><CheckCircle2 size={10} /> Importado</em>}</b>
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
          ) : (
            <>
              <small>Digite o usuário ou cole o link do GitHub para trazer o perfil ao Labstar.</small>
              <label><span>@</span><input value={githubInput} onChange={(event) => setGithubInput(event.target.value)} placeholder="usuario-do-github" maxLength={120} /></label>
            </>
          )}
        </div>
        <div className="connection-actions">
          {!connections.github ? (
            <button type="button" disabled={loading || !githubInput.trim()} onClick={() => void connectGithub()}><Github size={13} /> Adicionar</button>
          ) : (
            <>
              <button type="button" disabled={loading} onClick={() => void refreshGithub()} title="Atualizar perfil"><RefreshCw size={12} /></button>
              <button className="danger" type="button" disabled={loading} onClick={() => void disconnectGithub()} title="Remover GitHub do perfil"><Unlink size={12} /></button>
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
