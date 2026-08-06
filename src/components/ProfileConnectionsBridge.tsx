import {
  CheckCircle2,
  ExternalLink,
  Github,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  connectGithubProfile,
  disconnectGithubProfile,
  getCurrentProfileConnections,
  listMemberProfileConnections,
  takeGithubProfileConnectionResult,
  type GithubPublicProfile,
  type PublicProfileConnections,
} from "../lib/profile-connections";

const emptyConnections: PublicProfileConnections = { github: null };

function githubLabel(profile: GithubPublicProfile) {
  return profile.name || `@${profile.username}`;
}

function GithubProfileLink({ profile, compact = false }: { profile: GithubPublicProfile; compact?: boolean }) {
  return (
    <a
      className={`github-public-link ${compact ? "compact" : ""}`}
      href={profile.profileUrl}
      target="_blank"
      rel="noreferrer"
      title="Abrir perfil verificado no GitHub"
    >
      <Github size={compact ? 13 : 15} />
      <span>{compact ? `@${profile.username}` : githubLabel(profile)}</span>
      <CheckCircle2 size={compact ? 10 : 11} />
      <ExternalLink size={10} />
    </a>
  );
}

function MemberDirectoryConnections() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [profile, setProfile] = useState<GithubPublicProfile | null>(null);
  const directoryRef = useRef<Awaited<ReturnType<typeof listMemberProfileConnections>>>([]);

  useEffect(() => {
    let cancelled = false;
    void listMemberProfileConnections().then((items) => {
      if (!cancelled) directoryRef.current = items;
    });

    const findTarget = () => {
      const memberProfile = document.querySelector<HTMLElement>(".member-editor .member-profile");
      if (!memberProfile) {
        setTarget(null);
        return;
      }
      let mount = memberProfile.parentElement?.querySelector<HTMLElement>(":scope > .member-directory-connections-mount") ?? null;
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "member-directory-connections-mount";
        memberProfile.insertAdjacentElement("afterend", mount);
      }
      const email = memberProfile.querySelector("small")?.textContent?.trim().toLowerCase() ?? "";
      setProfile(directoryRef.current.find((entry) => entry.email === email)?.github ?? null);
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

  if (!target || !profile) return null;
  return createPortal(
    <section className="member-directory-connections">
      <small>GITHUB CONECTADO</small>
      <GithubProfileLink profile={profile} compact />
    </section>,
    target,
  );
}

export function ProfileConnectionsBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [connections, setConnections] = useState(emptyConnections);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const resultRef = useRef(takeGithubProfileConnectionResult());

  useEffect(() => {
    const findProfilePanel = () => {
      const panel = document.querySelector<HTMLElement>(".quick-panel.profile");
      if (!panel) {
        setTarget(null);
        if (resultRef.current) document.querySelector<HTMLButtonElement>(".avatar-button")?.click();
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

  async function loadConnections(silent = false) {
    if (!silent) setLoading(true);
    try {
      setConnections(await getCurrentProfileConnections());
      if (!silent && !resultRef.current) setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível carregar a conexão do GitHub agora.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!target) return;
    const result = resultRef.current;
    if (result === "connected") setMessage("GitHub conectado e verificado com sucesso. Seu login do Labstar não foi alterado.");
    else if (result === "cancelled") setMessage("A autorização do GitHub foi cancelada. Nenhuma alteração foi feita.");
    else if (result === "error") setMessage("O GitHub autorizou o retorno, mas a conexão não pôde ser concluída.");
    resultRef.current = null;
    void loadConnections();
  }, [target]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (target) void loadConnections(true);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [target]);

  async function connectGithub() {
    setLoading(true);
    setMessage("Abrindo a autorização segura do GitHub...");
    try {
      await connectGithubProfile();
      setMessage("Conclua a autorização no GitHub. Ao voltar ao Labstar, o perfil será atualizado automaticamente.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code.includes("not_configured")
        ? "A integração GitHub ainda precisa das credenciais do aplicativo OAuth no servidor."
        : "Não foi possível abrir a autorização do GitHub agora.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnectGithub() {
    setLoading(true);
    setMessage("Desconectando o GitHub do perfil...");
    try {
      await disconnectGithubProfile();
      setConnections(emptyConnections);
      setMessage("GitHub removido do perfil. Seu login do Labstar continua igual.");
    } catch {
      setMessage("Não foi possível remover o GitHub do perfil agora.");
    } finally {
      setLoading(false);
    }
  }

  const github = connections.github;
  const portal = target ? createPortal(
    <section className="profile-connections" aria-label="Conexão GitHub">
      <div className="profile-connections-head">
        <div>
          <strong>GitHub</strong>
          <small>Conexão profissional do perfil. Não altera seu método de login.</small>
        </div>
        {loading && <LoaderCircle className="spin" size={15} />}
      </div>

      <article className={`connection-card github ${github ? "connected" : ""}`}>
        <span className="connection-icon github-icon">
          {github?.avatarUrl ? <img src={github.avatarUrl} alt="" /> : <Github size={20} />}
        </span>
        <div className="connection-copy">
          <b>
            {github ? githubLabel(github) : "Conectar perfil do GitHub"}
            {github && <em><ShieldCheck size={10} /> Verificado</em>}
          </b>
          {github ? (
            <>
              <GithubProfileLink profile={github} />
              {github.bio && <p>{github.bio}</p>}
              <div className="github-profile-meta">
                <span><strong>{github.publicRepos}</strong> repositórios</span>
                <span><strong>{github.followers}</strong> seguidores</span>
                <span><strong>{github.following}</strong> seguindo</span>
                {github.location && <span><MapPin size={10} />{github.location}</span>}
              </div>
            </>
          ) : (
            <small>Autorize o Labstar no GitHub para confirmar que o perfil pertence a você e importar apenas os dados públicos.</small>
          )}
        </div>
        <div className="connection-actions">
          {!github ? (
            <button className="github-connect-button" type="button" disabled={loading} onClick={() => void connectGithub()}>
              <Github size={14} /> Conectar ao GitHub <ExternalLink size={11} />
            </button>
          ) : (
            <>
              <button type="button" disabled={loading} onClick={() => void connectGithub()} title="Atualizar conexão do GitHub">
                <RefreshCw size={12} /> Reconectar
              </button>
              <button className="danger" type="button" disabled={loading} onClick={() => void disconnectGithub()} title="Desconectar GitHub">
                <Unlink size={12} />
              </button>
            </>
          )}
        </div>
      </article>

      {github && (
        <div className="connection-security-note">
          <ShieldCheck size={13} />
          <span>Perfil confirmado pelo OAuth do GitHub. O token é usado somente durante a conexão e não é armazenado.</span>
        </div>
      )}
      {message && <p className="connection-message">{message}</p>}
    </section>,
    target,
  ) : null;

  return <>{portal}<MemberDirectoryConnections /></>;
}
