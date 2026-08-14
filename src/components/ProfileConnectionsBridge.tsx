import { CheckCircle2, ExternalLink, Github, LoaderCircle, RefreshCw, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import {
  connectGithubProfile,
  disconnectGithubProfile,
  getCurrentProfileConnections,
  getMemberProfileConnections,
  type GithubProfileConnectionResult,
  type GithubPublicProfile,
  type PublicProfileConnections,
} from "../lib/profile-connections";

const emptyConnections: PublicProfileConnections = { github: null };

function githubLabel(profile: GithubPublicProfile) {
  return profile.name || `@${profile.username}`;
}

export function GithubProfileLink({ profile, compact = false }: { profile: GithubPublicProfile; compact?: boolean }) {
  return (
    <a
      className={`github-public-link ${compact ? "compact" : ""}`}
      href={profile.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir perfil verificado no GitHub"
    >
      <Github size={compact ? 13 : 15} />
      <span>{compact ? `@${profile.username}` : githubLabel(profile)}</span>
      <CheckCircle2 size={compact ? 10 : 11} />
      <ExternalLink size={10} />
    </a>
  );
}

export function MemberProfileConnection({ memberId }: { memberId: string }) {
  const [profile, setProfile] = useState<GithubPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMemberProfileConnections(memberId).then((connections) => {
      if (!cancelled) setProfile(connections.github);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [memberId]);

  if (loading) return <div className="member-directory-connections" aria-label="Carregando GitHub"><LoaderCircle className="spin" size={13} /></div>;
  if (!profile) return null;
  return <section className="member-directory-connections"><GithubProfileLink profile={profile} compact /></section>;
}

export function CurrentProfileConnection({ result = null }: { result?: GithubProfileConnectionResult }) {
  const [connections, setConnections] = useState(emptyConnections);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(() => {
    if (result === "connected") return "GitHub conectado e verificado.";
    if (result === "cancelled") return "Conexão cancelada. Nenhuma alteração foi feita.";
    if (result === "error") return "Não foi possível conectar ao GitHub.";
    return "";
  });

  async function loadConnections(silent = false) {
    if (!silent) setLoading(true);
    try {
      setConnections(await getCurrentProfileConnections());
    } catch {
      if (!silent) setMessage("Não foi possível carregar o GitHub.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => void loadConnections(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadConnections(true);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  async function connectGithub() {
    setLoading(true);
    setMessage("");
    try {
      await connectGithubProfile();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code.includes("not_configured")
        ? "Conexão do GitHub ainda não configurada."
        : "Não foi possível abrir o GitHub.");
      setLoading(false);
    }
  }

  async function disconnectGithub() {
    if (!window.confirm("Desconectar seu perfil do GitHub no Labstar?")) return;
    setLoading(true);
    setMessage("");
    try {
      await disconnectGithubProfile();
      setConnections(emptyConnections);
      setMessage("GitHub desconectado do seu perfil.");
    } catch {
      setMessage("Não foi possível desconectar o GitHub.");
    } finally {
      setLoading(false);
    }
  }

  const github = connections.github;
  return (
    <section className="profile-connections" aria-label="Conexão GitHub" aria-busy={loading}>
      {!github ? (
        <button className="github-connect-button" type="button" disabled={loading} onClick={() => void connectGithub()}>
          {loading ? <LoaderCircle className="spin" size={15} /> : <Github size={15} />}
          Conectar ao GitHub
          <ExternalLink size={11} />
        </button>
      ) : (
        <div className="github-connected-row">
          <span className="connection-icon">
            {github.avatarUrl ? <img src={github.avatarUrl} alt="" /> : <Github size={18} />}
          </span>
          <GithubProfileLink profile={github} />
          <div className="connection-actions">
            <button type="button" disabled={loading} onClick={() => void connectGithub()} title="Reconectar GitHub" aria-label="Reconectar GitHub">
              {loading ? <LoaderCircle className="spin" size={12} /> : <RefreshCw size={12} />}
            </button>
            <button className="danger" type="button" disabled={loading} onClick={() => void disconnectGithub()} title="Desconectar GitHub" aria-label="Desconectar GitHub">
              <Unlink size={12} />
            </button>
          </div>
        </div>
      )}
      {message && <p className="connection-message" role="status">{message}</p>}
    </section>
  );
}
