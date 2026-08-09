import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  Github,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  RotateCcw,
  ShieldCheck,
  Star,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  accessErrorMessage,
  clearPendingInviteToken,
  createInviteLink,
  getCurrentAccessIdentity,
  getPendingInviteToken,
  inspectInvite,
  requestAccessLink,
  secureSignOut,
  signInWithProvider,
  subscribeToAccessChanges,
  type AccessIdentity,
  type AccessProvider,
  type CreatedInvite,
  type InviteInspection,
  type InviteMode,
} from "../lib/access";

type AccessStage = "loading" | "anonymous" | "active" | "pending" | "suspended" | "unauthorized" | "error";

const BRAND_INTRO_DURATION_MS = 2350;

type InviteForm = {
  mode: InviteMode;
  email: string;
  name: string;
  role: "admin" | "manager" | "member" | "viewer";
  jobTitle: string;
  area: string;
  validForHours: number;
};

const emptyInvite: InviteForm = {
  mode: "quick",
  email: "",
  name: "",
  role: "member",
  jobTitle: "",
  area: "",
  validForHours: 48,
};

function formatExpiry(value: string) {
  if (!value) return "prazo não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const element = document.createElement("textarea");
  element.value = value;
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.appendChild(element);
  element.select();
  document.execCommand("copy");
  element.remove();
}

export function AccessControl({ children }: { children: ReactNode }) {
  const [introComplete, setIntroComplete] = useState(false);
  const [stage, setStage] = useState<AccessStage>("loading");
  const [identity, setIdentity] = useState<AccessIdentity | null>(null);
  const [inspection, setInspection] = useState<InviteInspection | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setStage("loading");
    setIdentity(null);
    setError("");
    try {
      const token = getPendingInviteToken();
      if (token) setInspection(await inspectInvite(token));

      const result = await getCurrentAccessIdentity();
      if (!result) {
        setStage("anonymous");
        return;
      }

      setIdentity(result);
      setStage(result.authorization);
    } catch (cause) {
      setError(accessErrorMessage(cause));
      setStage("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroComplete(true), BRAND_INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToAccessChanges((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  if (!introComplete) return <AccessBrandIntro />;

  if (stage === "active" && identity?.member) {
    const canInvite = identity.member.role === "owner" || identity.member.role === "admin";
    return <>{children}{canInvite && <InvitePortal />}</>;
  }

  if (stage === "loading") {
    return <ApprovalValidation />;
  }
  if (stage === "anonymous") return <SignInScreen inspection={inspection} />;
  if (stage === "pending" && identity) {
    return (
      <AccessFrame>
        <span className="access-v2-icon amber"><Clock3 size={22} /></span>
        <small>APROVAÇÃO PENDENTE</small>
        <h1>Seu acesso está aguardando confirmação.</h1>
        <p>Sua identidade foi confirmada. Um administrador precisa liberar o convite rápido antes de você entrar.</p>
        <div className="access-v2-identity"><b>{identity.user.email ?? "conta sem e-mail confirmado"}</b><span>Conta identificada com segurança</span></div>
        <button className="access-v2-secondary" type="button" onClick={() => void secureSignOut()}><LogOut size={15} /> Entrar com outra conta</button>
      </AccessFrame>
    );
  }
  if (stage === "suspended" && identity) {
    return (
      <AccessFrame>
        <span className="access-v2-icon red"><LockKeyhole size={22} /></span>
        <small>CONTA SUSPENSA</small>
        <h1>Este acesso foi suspenso.</h1>
        <p>A conta <b>{identity.user.email ?? "conta sem e-mail confirmado"}</b> continua identificada, mas não pode abrir dados da equipe.</p>
        <button className="access-v2-secondary" type="button" onClick={() => void secureSignOut()}><LogOut size={15} /> Entrar com outra conta</button>
      </AccessFrame>
    );
  }
  if (stage === "unauthorized" && identity) {
    return (
      <AccessFrame>
        <span className="access-v2-icon amber"><AlertTriangle size={22} /></span>
        <small>ACESSO NÃO AUTORIZADO</small>
        <h1>Esta identidade não pertence à equipe.</h1>
        <p>Você entrou como <b>{identity.user.email ?? "conta sem e-mail confirmado"}</b>, mas não existe convite válido nem membro ativo para essa identidade.</p>
        <button className="access-v2-secondary" type="button" onClick={() => void secureSignOut()}><LogOut size={15} /> Entrar com outra conta</button>
      </AccessFrame>
    );
  }

  return (
    <AccessFrame>
      <span className="access-v2-icon red"><AlertTriangle size={22} /></span>
      <small>VERIFICAÇÃO INTERROMPIDA</small>
      <h1>Não foi possível concluir o acesso.</h1>
      <p>{error || "O serviço de identidade não respondeu como esperado."}</p>
      <div className="access-v2-actions">
        <button type="button" onClick={() => void refresh()}><RotateCcw size={15} /> Tentar novamente</button>
        <button className="access-v2-secondary" type="button" onClick={() => void secureSignOut()}><LogOut size={15} /> Entrar com outra conta</button>
        {getPendingInviteToken() && <button className="access-v2-secondary" type="button" onClick={() => { clearPendingInviteToken(); void refresh(); }}>Remover convite</button>}
      </div>
    </AccessFrame>
  );
}

function AccessBrandIntro() {
  return (
    <main className="access-screen brand-intro" aria-label="Abrindo Labstar" aria-live="polite" aria-busy="true">
      <div className="intro-mark">
        <strong className="wordmark large animated" aria-label="Labstar">
          <span className="word-letter" aria-hidden="true">L</span>
          <span className="word-letter transform-letter" aria-hidden="true">
            <span className="letter-a">A</span>
            <Star className="star-letter" size={28} fill="currentColor" strokeWidth={1.25} />
          </span>
          <span className="word-letter" aria-hidden="true">B</span>
          <span className="word-letter" aria-hidden="true">S</span>
          <span className="word-letter" aria-hidden="true">T</span>
          <span className="word-letter" aria-hidden="true">A</span>
          <span className="word-letter" aria-hidden="true">R</span>
        </strong>
        <span className="intro-progress" aria-hidden="true"><i /></span>
      </div>
    </main>
  );
}

function ApprovalValidation() {
  return (
    <main className="access-screen" aria-label="Validando aprovação" aria-live="polite" aria-busy="true">
      <p style={{ position: "relative", zIndex: 2, margin: 0, color: "#8f98aa", fontSize: 12, fontWeight: 500, letterSpacing: ".035em", animation: "access-v2-star-breathe 1.8s ease-in-out infinite" }}>Validando aprovação</p>
    </main>
  );
}

function AccessFrame({ children, compact = false, login = false }: { children: React.ReactNode; compact?: boolean; login?: boolean }) {
  return (
    <main className="access-v2-screen">
      <section className={`access-v2-card ${compact ? "compact" : ""} ${login ? "login" : ""}`}>
        <strong className="access-v2-wordmark">L<span>★</span>BSTAR</strong>
        {children}
        <div className="access-v2-security"><ShieldCheck size={14} /> Autenticação não libera dados sem autorização interna.</div>
      </section>
    </main>
  );
}

function SignInScreen({ inspection }: { inspection: InviteInspection | null }) {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<AccessProvider | "email" | "">("");
  const [error, setError] = useState("");

  async function oauth(provider: AccessProvider) {
    setLoading(provider);
    setError("");
    try {
      await signInWithProvider(provider);
    } catch (cause) {
      setError(accessErrorMessage(cause));
      setLoading("");
    }
  }

  async function emailLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading("email");
    setError("");
    try {
      await requestAccessLink(email);
      setSent(true);
    } catch (cause) {
      setError(accessErrorMessage(cause));
    } finally {
      setLoading("");
    }
  }

  const inviteMessage = useMemo(() => {
    if (!inspection) return "Entre com uma identidade já autorizada pela equipe.";
    if (!inspection.valid) return "O link detectado expirou, já foi usado ou foi revogado.";
    if (inspection.kind === "personal") return `Convite pessoal válido${inspection.emailHint ? ` para ${inspection.emailHint}` : ""}.`;
    return "Convite rápido válido. Depois do login, um administrador confirma sua entrada.";
  }, [inspection]);

  return (
    <AccessFrame login>
      {inspection && <p className="access-v2-invite-copy">{inviteMessage}</p>}

      {inspection && (
        <div className={`access-v2-invite-state ${inspection.valid ? "valid" : "invalid"}`}>
          {inspection.valid ? <Link2 size={16} /> : <AlertTriangle size={16} />}
          <div><b>{inspection.valid ? "Convite de uso único" : "Convite indisponível"}</b><span>{inspection.valid ? `Expira em ${formatExpiry(inspection.expiresAt)}` : "Peça um novo link ao administrador."}</span></div>
        </div>
      )}

      <div className="access-v2-provider-list">
        <button type="button" onClick={() => void oauth("google")} disabled={Boolean(loading)}>
          {loading === "google" ? <LoaderCircle className="spin" size={18} /> : <span className="google-mark">G</span>}
          Continuar com Google
        </button>
        <button type="button" onClick={() => void oauth("github")} disabled={Boolean(loading)}>
          {loading === "github" ? <LoaderCircle className="spin" size={18} /> : <Github size={18} />}
          Continuar com GitHub
        </button>
      </div>

      <button className="access-v2-email-toggle" type="button" onClick={() => setEmailMode((value) => !value)}><Mail size={14} /> {emailMode ? "Ocultar entrada por e-mail" : "Usar link por e-mail"}</button>

      {emailMode && (sent ? (
        <div className="access-v2-sent"><Check size={18} /><div><b>Confira seu e-mail</b><span>O link foi enviado para {email}.</span></div></div>
      ) : (
        <form className="access-v2-email-form" onSubmit={emailLogin}>
          <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" />
          <button type="submit" disabled={Boolean(loading)}>{loading === "email" ? <LoaderCircle className="spin" size={15} /> : <LogIn size={15} />} Enviar link</button>
        </form>
      ))}

      {error && <div className="access-v2-error"><AlertTriangle size={14} /> {error}</div>}
    </AccessFrame>
  );
}

function InvitePortal() {
  const [target, setTarget] = useState<Element | null>(() => document.querySelector(".team-head"));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const findTarget = () => setTarget(document.querySelector(".team-head"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const openInvite = () => setOpen(true);
    window.addEventListener("labstar:open-secure-invite", openInvite);
    return () => window.removeEventListener("labstar:open-secure-invite", openInvite);
  }, []);

  return <>
    {target && createPortal(
    <>
      <button className="secure-invite-button" type="button" onClick={() => setOpen(true)}><UserPlus size={14} /> Criar convite</button>
    </>,
    target,
    )}
    {open && <InviteModal onClose={() => setOpen(false)} />}
  </>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<InviteForm>(emptyInvite);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCreated(null);
    try {
      const invite = await createInviteLink(form);
      setCreated(invite);
      await copyText(invite.url);
      setCopied(true);
    } catch (cause) {
      setError(accessErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function copyInvite() {
    if (!created) return;
    await copyText(created.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return createPortal(
    <div className="access-v2-modal-backdrop" onMouseDown={onClose}>
      <section className="access-v2-invite-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><UserPlus size={18} /></span><div><b>Criar convite seguro</b><small>Um link, um uso, uma identidade.</small></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        </header>

        {created ? (
          <div className="access-v2-created-invite">
            <span className="access-v2-created-icon"><Check size={22} /></span>
            <h2>Convite criado e copiado.</h2>
            <p>{created.mode === "quick" ? "A primeira pessoa autenticada que usar o link ficará aguardando sua aprovação." : `Somente a identidade correspondente a ${created.email} poderá aceitar.`}</p>
            <label>Link de uso único<div><input readOnly value={created.url} /><button type="button" onClick={() => void copyInvite()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></label>
            <div className="access-v2-created-meta"><span><Clock3 size={13} /> Expira em {formatExpiry(created.expiresAt)}</span><span><ShieldCheck size={13} /> Máximo de 1 uso</span></div>
            <button className="access-v2-primary" type="button" onClick={() => { setCreated(null); setForm(emptyInvite); setCopied(false); }}>Criar outro convite</button>
          </div>
        ) : (
          <form onSubmit={create}>
            <div className="access-v2-invite-tabs">
              <button className={form.mode === "quick" ? "active" : ""} type="button" onClick={() => setForm({ ...form, mode: "quick", email: "" })}><Link2 size={14} /> Convite rápido</button>
              <button className={form.mode === "personal" ? "active" : ""} type="button" onClick={() => setForm({ ...form, mode: "personal" })}><Mail size={14} /> Convite pessoal</button>
            </div>

            <div className="access-v2-mode-note">
              <ShieldCheck size={15} />
              <span>{form.mode === "quick" ? "Você envia o link para quem quiser. O primeiro uso cria uma solicitação pendente para você aprovar." : "O link continua sendo de uso único, mas só aceita a conta com o e-mail definido."}</span>
            </div>

            {form.mode === "personal" && <label>E-mail autorizado<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="pessoa@empresa.com" /></label>}
            <label>Nome inicial <small>opcional</small><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="A pessoa poderá editar depois" /></label>

            <div className="access-v2-invite-grid">
              <label>Nível inicial<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as InviteForm["role"] })}><option value="member">Membro</option><option value="manager">Gestor</option><option value="admin">Administrador</option><option value="viewer">Somente leitura</option></select></label>
              <label>Validade<select value={form.validForHours} onChange={(event) => setForm({ ...form, validForHours: Number(event.target.value) })}><option value={1}>1 hora</option><option value={24}>24 horas</option><option value={48}>48 horas</option><option value={168}>7 dias</option></select></label>
              <label>Cargo <small>opcional</small><input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} placeholder="Desenvolvedor" /></label>
              <label>Área <small>opcional</small><input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="Labstar" /></label>
            </div>

            {error && <div className="access-v2-error"><AlertTriangle size={14} /> {error}</div>}
            <button className="access-v2-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <Link2 size={15} />} {loading ? "Gerando convite..." : "Gerar e copiar link"}</button>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
