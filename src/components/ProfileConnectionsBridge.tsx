import {
  CheckCircle2,
  ExternalLink,
  Github,
  LoaderCircle,
  RefreshCw,
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
      if (!silent) setMessage("Não foi possível carregar o GitHub.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!target) return;
    const result = resultRef.current;
    if (result === "error") setMessage("Não foi possível conectar ao GitHub.");
    else setMessage("");
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
    setMessage("");
    try {
      await connectGithubProfile();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code.includes("not_configured")
        ? "Conexão do GitHub ainda não configurada."
        : "Não foi possível abrir o GitHub.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnectGithub() {
    setLoading(true);
    setMessage("");
    try {
      await disconnectGithubProfile();
      setConnections(emptyConnections);
    } catch {
      setMessage("Não foi possível desconectar o GitHub.");
    } finally {
      setLoading(false);
    }
  }

  const github = connections.github;
  const portal = target ? createPortal(
    <section className="profile-connections" aria-label="Conexão GitHub">
      {!github ? (
        <button
          className="github-connect-button"
          type="button"
          disabled={loading}
          onClick={() => void connectGithub()}
        >
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
            <button type="button" disabled={loading} onClick={() => void connectGithub()} title="Reconectar GitHub">
              {loading ? <LoaderCircle className="spin" size={12} /> : <RefreshCw size={12} />}
            </button>
            <button className="danger" type="button" disabled={loading} onClick={() => void disconnectGithub()} title="Desconectar GitHub">
              <Unlink size={12} />
            </button>
          </div>
        </div>
      )}
      {message && <p className="connection-message">{message}</p>}
    </section>,
    target,
  ) : null;

  return <>{portal}<MemberDirectoryConnections /></>;
}
