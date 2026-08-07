export {};

const CENTER_SELECTOR = ".integrations-center";

function setText(node: Element | null, value: string) {
  if (node && node.textContent !== value) node.textContent = value;
}

function syncGithubOnlyIntegrations() {
  document.querySelectorAll<HTMLElement>(CENTER_SELECTOR).forEach((center) => {
    center.dataset.providerMode = "github-only";

    const create = center.querySelector<HTMLElement>(".integration-create");
    const select = create?.querySelector<HTMLSelectElement>("select");
    if (select) {
      if (select.value !== "github") {
        select.value = "github";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      select.hidden = true;
      select.setAttribute("aria-hidden", "true");
      select.tabIndex = -1;
    }

    const addButton = create?.querySelector<HTMLButtonElement>("button");
    if (addButton) addButton.innerHTML = '<span aria-hidden="true">＋</span> Adicionar GitHub';

    const intro = center.querySelector<HTMLElement>(".integration-intro p");
    setText(intro, "Conecte repositórios GitHub aos canais do Labstar e escolha exatamente quais eventos devem gerar avisos.");

    let visibleGithubRules = 0;
    center.querySelectorAll<HTMLElement>(".integration-rule-list > article").forEach((article) => {
      const github = Boolean(article.querySelector(".provider-mark.github"));
      article.hidden = !github;
      article.setAttribute("aria-hidden", github ? "false" : "true");
      if (github) {
        visibleGithubRules += 1;
        const endpointLabel = article.querySelector<HTMLElement>(".integration-rule-fields label.full");
        if (endpointLabel) {
          const textNode = Array.from(endpointLabel.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
          if (textNode) textNode.textContent = "Repositório GitHub (opcional)";
          const input = endpointLabel.querySelector<HTMLInputElement>("input");
          if (input) input.placeholder = "https://github.com/empresa/repositorio";
        }
      }
    });

    const empty = center.querySelector<HTMLElement>(".integration-empty");
    if (empty) {
      empty.hidden = visibleGithubRules > 0;
      const strong = empty.querySelector("strong");
      const paragraph = empty.querySelector("p");
      setText(strong, "Nenhum GitHub configurado");
      setText(paragraph, "Adicione uma integração GitHub, escolha o canal e copie o Webhook de entrada para Settings → Webhooks no repositório.");
    }
  });
}

function startGithubOnlyIntegrations() {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncGithubOnlyIntegrations();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", schedule, true);
  window.addEventListener("pageshow", schedule);
  schedule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startGithubOnlyIntegrations, { once: true });
} else {
  startGithubOnlyIntegrations();
}
