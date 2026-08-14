import { ExternalLink, Github } from "lucide-react";
import "../integration-message-cards.css";

export type ParsedGithubMessage = {
  event: string;
  title: string;
  repository: string;
  state: string;
  actor: string;
  url: string;
};

const GITHUB_PREFIX = "GitHub · ";

export function normalizeIntegrationMessageBody(body: string) {
  return body.replace(/\\n/g, "\n").trim();
}

export function parseGithubIntegrationMessage(rawBody: string): ParsedGithubMessage | null {
  const lines = normalizeIntegrationMessageBody(rawBody).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines[0]?.startsWith(GITHUB_PREFIX) || lines.length < 2) return null;

  const detailParts = (lines[2] ?? "").split(" · ").map((part) => part.trim()).filter(Boolean);
  const actorPart = detailParts.find((part) => part.toLowerCase().startsWith("por ")) ?? "";
  const actor = actorPart.replace(/^por\s+/i, "").trim();
  const repository = detailParts[0] ?? "";
  const state = detailParts.find((part, index) => index > 0 && !part.toLowerCase().startsWith("por ")) ?? "";
  const url = lines.find((line) => /^https:\/\//i.test(line)) ?? "";

  return {
    event: lines[0].slice(GITHUB_PREFIX.length).trim(),
    title: lines[1],
    repository,
    state,
    actor,
    url: safeGithubUrl(url),
  };
}

function safeGithubUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "github.com" || url.hostname.endsWith(".github.com"))
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function safeGithubLogin(value: string) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value) ? value : "";
}

function stateLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "opened") return "Aberto";
  if (normalized === "closed") return "Fechado";
  if (normalized === "merged") return "Mesclado";
  if (normalized === "failure") return "Falhou";
  if (normalized === "cancelled") return "Cancelado";
  if (normalized === "published") return "Publicado";
  return value;
}

function actionLabel(event: string) {
  const normalized = event.toLowerCase();
  if (normalized.includes("pull request")) return "Abrir pull request";
  if (normalized.includes("issue")) return "Abrir issue";
  if (normalized.includes("deploy")) return "Abrir execução";
  if (normalized.includes("versão") || normalized.includes("release")) return "Abrir release";
  if (normalized.includes("segurança")) return "Abrir alerta";
  return "Abrir no GitHub";
}

export function GithubIntegrationMessage({ message }: { message: ParsedGithubMessage }) {
  const actor = safeGithubLogin(message.actor);
  const stateClass = message.state.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <section className="integration-event-card integration-event-card-github" aria-label={`Evento do GitHub: ${message.event}`}>
      <div className="integration-event-top">
        <span className="integration-provider-mark"><Github size={19} /></span>
        <div className="integration-event-heading">
          <span className="integration-event-eyebrow">GitHub · {message.event}</span>
          <strong>{message.title}</strong>
        </div>
        {message.state && <span className={`integration-event-status is-${stateClass}`}>{stateLabel(message.state)}</span>}
      </div>

      {(message.repository || actor) && (
        <div className="integration-event-meta">
          {message.repository && <span className="integration-event-repo">{message.repository}</span>}
          {actor && (
            <span className="integration-event-actor">
              <img src={`https://github.com/${encodeURIComponent(actor)}.png?size=64`} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span>por {actor}</span>
            </span>
          )}
        </div>
      )}

      {message.url && (
        <a className="integration-event-open" href={message.url} target="_blank" rel="noopener noreferrer">
          <span>{actionLabel(message.event)}</span><ExternalLink size={13} />
        </a>
      )}
    </section>
  );
}
