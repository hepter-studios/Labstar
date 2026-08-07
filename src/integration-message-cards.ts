const INTEGRATION_AUTHOR = "Labstar Integrations";
const GITHUB_PREFIX = "GitHub · ";

function githubMark() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.73 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.11 0 4.45-2.71 5.43-5.29 5.72.42.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/>
    </svg>`;
}

type ParsedGithubMessage = {
  event: string;
  title: string;
  repository: string;
  state: string;
  actor: string;
  url: string;
};

function parseGithubMessage(rawBody: string): ParsedGithubMessage | null {
  const body = rawBody.replace(/\\n/g, "\n").trim();
  const lines = body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
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
    url,
  };
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

function enhanceGithubMessage(article: HTMLElement, paragraph: HTMLParagraphElement, parsed: ParsedGithubMessage) {
  if (article.dataset.integrationCard === "github") return;
  article.dataset.integrationCard = "github";
  article.classList.add("integration-chat-message", "integration-chat-message-github");
  paragraph.hidden = true;

  const card = document.createElement("section");
  card.className = "integration-event-card integration-event-card-github";

  const top = document.createElement("div");
  top.className = "integration-event-top";

  const provider = document.createElement("span");
  provider.className = "integration-provider-mark";
  provider.innerHTML = githubMark();

  const heading = document.createElement("div");
  heading.className = "integration-event-heading";
  const eyebrow = document.createElement("span");
  eyebrow.className = "integration-event-eyebrow";
  eyebrow.textContent = `GitHub · ${parsed.event}`;
  const title = document.createElement("strong");
  title.textContent = parsed.title;
  heading.append(eyebrow, title);
  top.append(provider, heading);

  if (parsed.state) {
    const status = document.createElement("span");
    status.className = `integration-event-status is-${parsed.state.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    status.textContent = stateLabel(parsed.state);
    top.append(status);
  }

  card.append(top);

  if (parsed.repository || parsed.actor) {
    const meta = document.createElement("div");
    meta.className = "integration-event-meta";

    if (parsed.repository) {
      const repo = document.createElement("span");
      repo.className = "integration-event-repo";
      repo.textContent = parsed.repository;
      meta.append(repo);
    }

    const login = safeGithubLogin(parsed.actor);
    if (login) {
      const actor = document.createElement("span");
      actor.className = "integration-event-actor";
      const avatar = document.createElement("img");
      avatar.src = `https://github.com/${encodeURIComponent(login)}.png?size=64`;
      avatar.alt = "";
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      const label = document.createElement("span");
      label.textContent = `por ${login}`;
      actor.append(avatar, label);
      meta.append(actor);
    }

    card.append(meta);
  }

  if (parsed.url) {
    const open = document.createElement("a");
    open.className = "integration-event-open";
    open.href = parsed.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.innerHTML = `<span>${actionLabel(parsed.event)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`;
    card.append(open);
  }

  paragraph.insertAdjacentElement("afterend", card);
}

function enhanceIntegrationTest(paragraph: HTMLParagraphElement) {
  if (!paragraph.textContent?.includes("\\n")) return;
  paragraph.textContent = paragraph.textContent.replace(/\\n/g, "\n");
  paragraph.classList.add("integration-test-message");
}

function enhanceAllIntegrationMessages() {
  document.querySelectorAll<HTMLElement>(".chat-message").forEach((article) => {
    const author = article.querySelector<HTMLElement>(".message-body > header > strong")?.textContent?.trim();
    if (author !== INTEGRATION_AUTHOR) return;
    const paragraph = article.querySelector<HTMLParagraphElement>(".message-body > p");
    if (!paragraph) return;

    const parsed = parseGithubMessage(paragraph.textContent ?? "");
    if (parsed) {
      enhanceGithubMessage(article, paragraph, parsed);
      return;
    }
    enhanceIntegrationTest(paragraph);
  });
}

function startIntegrationMessageCards() {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      enhanceAllIntegrationMessages();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("pageshow", schedule);
  schedule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startIntegrationMessageCards, { once: true });
} else {
  startIntegrationMessageCards();
}

export {};
