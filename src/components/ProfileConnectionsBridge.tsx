import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Github,
  LoaderCircle,
  Mail,
  MapPin,
  Network,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentIdentity, type Member } from "../lib/supabase";
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

type WorkspaceNode = {
  id?: string;
  name?: string;
};

function githubLabel(profile: GithubPublicProfile) {
  return profile.name || `@${profile.username}`;
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = validDate(value);
  if (!date) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatActivity(value: string) {
  const date = validDate(value);
  if (!date) return "Agora";
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 2) return "Agora";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  return formatDate(value);
}

function statusLabel(status: Member["status"]) {
  if (status === "active") return "Ativo";
  if (status === "pending") return "Pendente";
  return "Suspenso";
}

function workspaceAssignmentNames(member: Member) {
  if (!member.assignments.length) return [];
  try {
    const raw = window.localStorage.getItem("labstar-workspace-v1");
    const nodes = raw ? JSON.parse(raw) as WorkspaceNode[] : [];
    const names = new Map(nodes.map((node) => [String(node.id ?? ""), String(node.name ?? "").trim()]));
    return member.assignments.map((id) => names.get(id) || id);
  } catch {
    return member.assignments;
  }
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

function CompleteProfile({
  member,
  github,
  loading,
  message,
  copied,
  onCopyEmail,
  onConnectGithub,
  onDisconnectGithub,
}: {
  member: Member;
  github: GithubPublicProfile | null;
  loading: boolean;
  message: string;
  copied: boolean;
  onCopyEmail: () => void;
  onConnectGithub: () => void;
  onDisconnectGithub: () => void;
}) {
  const assignments = useMemo(() => workspaceAssignmentNames(member), [member]);
  const completionChecks = [
    Boolean(member.name.trim()),
    Boolean(member.avatarPath || member.avatarUrl),
    Boolean(member.jobRoles.length || member.jobTitle.trim()),
    Boolean(member.area.trim()),
    Boolean(member.assignments.length),
    Boolean(github),
  ];
  const completion = Math.round((completionChecks.filter(Boolean).length / completionChecks.length) * 100);

  return (
    <section className="profile-complete" aria-label="Informações completas do perfil">
      <div className="profile-completeness">
        <div><span>Perfil profissional</span><strong>{completion}%</strong></div>
        <i aria-hidden="true"><b style={{ width: `${completion}%` }} /></i>
      </div>

      <div className="profile-detail-grid">
        <article>
          <MapPin size={14} />
          <span><small>Área</small><b>{member.area || "Não definida"}</b></span>
        </article>
        <article className={`status-${member.status}`}>
          <ShieldCheck size={14} />
          <span><small>Status</small><b>{statusLabel(member.status)}</b></span>
        </article>
        <article>
          <Network size={14} />
          <span><small>Núcleos</small><b>{assignments.length}</b></span>
        </article>
        <article>
          <CalendarDays size={14} />
          <span><small>Entrada</small><b>{formatDate(member.createdAt)}</b></span>
        </article>
      </div>

      {assignments.length > 0 && (
        <section className="profile-assignments" aria-label="Núcleos atribuídos">
          <header><BriefcaseBusiness size={13} /><span>Núcleos atribuídos</span></header>
          <div>
            {assignments.slice(0, 4).map((name) => <span key={name}>{name}</span>)}
            {assignments.length > 4 && <span>+{assignments.length - 4}</span>}
          </div>
        </section>
      )}

      <section className="profile-account-row">
        <div>
          <Mail size={14} />
          <span><small>E-mail corporativo</small><b title={member.email}>{member.email}</b></span>
        </div>
        <button type="button" onClick={onCopyEmail} title="Copiar e-mail" aria-label="Copiar e-mail corporativo">
          {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
        </button>
      </section>

      <div className="profile-last-activity">
        <Activity size={13} />
        <span>Última atividade</span>
        <b>{formatActivity(member.lastSeenAt)}</b>
      </div>

      <section className="profile-connections" aria-label="Conexão GitHub">
        {!github ? (
          <button
            className="github-connect-button"
            type="button"
            disabled={loading}
            onClick={onConnectGithub}
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
              <button type="button" disabled={loading} onClick={onConnectGithub} title="Reconectar GitHub">
                {loading ? <LoaderCircle className="spin" size={12} /> : <RefreshCw size={12} />}
              </button>
              <button className="danger" type="button" disabled={loading} onClick={onDisconnectGithub} title="Desconectar GitHub">
                <Unlink size={12} />
              </button>
            </div>
          </div>
        )}
        {message && <p className="connection-message" role="status">{message}</p>}
      </section>
    </section>
  );
}

export function ProfileConnectionsBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [connections, setConnections] = useState(emptyConnections);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(takeGithubProfileConnectionResult());
  const copiedTimerRef = useRef(0);

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [identity, profileConnections] = await Promise.all([
        getCurrentIdentity(),
        getCurrentProfileConnections(),
      ]);
      setMember(identity?.member ?? null);
      setConnections(profileConnections);
      if (!silent && !resultRef.current) setMessage("");
    } catch {
      if (!silent) setMessage("Não foi possível atualizar o perfil agora.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const findProfilePanel = () => {
      const panel = document.querySelector<HTMLElement>(".quick-panel.profile");
      if (!panel) {
        setTarget(null);
        if (resultRef.current) document.querySelector<HTMLButtonElement>(".avatar-button")?.click();
        return;
      }

      panel.querySelector<HTMLElement>(":scope > .profile-connections-mount")?.remove();

      let mount = panel.querySelector<HTMLElement>(":scope > .profile-complete-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "profile-complete-mount";
        const profileInfo = panel.querySelector(".profile-info");
        const roleList = panel.querySelector(".profile-role-list");
        const signOut = panel.querySelector(".sign-out");
        if (profileInfo) profileInfo.insertAdjacentElement("afterend", mount);
        else if (roleList) panel.insertBefore(mount, roleList);
        else if (signOut) panel.insertBefore(mount, signOut);
        else panel.appendChild(mount);
      }
      setTarget(mount);
    };

    findProfilePanel();
    const observer = new MutationObserver(findProfilePanel);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return;
    const result = resultRef.current;
    if (result === "error") setMessage("Não foi possível conectar ao GitHub.");
    else setMessage("");
    resultRef.current = null;
    void loadProfile();
  }, [loadProfile, target]);

  useEffect(() => {
    const panel = target?.closest<HTMLElement>(".quick-panel.profile");
    if (!panel) return undefined;
    const refreshAfterLegacyAction = (event: Event) => {
      const element = event.target as HTMLElement;
      if (!element.closest(".profile-photo-actions button, .profile-name-field button")) return;
      window.setTimeout(() => void loadProfile(true), 900);
    };
    panel.addEventListener("click", refreshAfterLegacyAction);
    return () => panel.removeEventListener("click", refreshAfterLegacyAction);
  }, [loadProfile, target]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (target) void loadProfile(true);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [loadProfile, target]);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

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

  async function copyEmail() {
    if (!member?.email) return;
    try {
      await navigator.clipboard.writeText(member.email);
      setCopied(true);
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Não foi possível copiar o e-mail.");
    }
  }

  const portal = target && member ? createPortal(
    <CompleteProfile
      member={member}
      github={connections.github}
      loading={loading}
      message={message}
      copied={copied}
      onCopyEmail={() => void copyEmail()}
      onConnectGithub={() => void connectGithub()}
      onDisconnectGithub={() => void disconnectGithub()}
    />,
    target,
  ) : target && loading ? createPortal(
    <div className="profile-complete-loading"><LoaderCircle className="spin" size={17} /> Atualizando perfil</div>,
    target,
  ) : null;

  return <>{portal}<MemberDirectoryConnections /></>;
}
