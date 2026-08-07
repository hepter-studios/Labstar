import "./integration-message-cards";
import "./integration-message-cards.css";

export {};

const BRAND_SELECTOR = ".app > .header .brand";
const HOME_SELECTOR = '.rail-group button[aria-label="Visão geral"]';
const READY_ATTRIBUTE = "data-labstar-home-ready";

function goToHome() {
  const homeButton = document.querySelector<HTMLButtonElement>(HOME_SELECTOR);
  if (!homeButton) return;

  homeButton.click();

  // Voltar ao início também deve retirar o foco de controles e levar o topo da
  // superfície inicial para a posição correta, sem recarregar a aplicação.
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(".dashboard-work-surface, .overview")?.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function prepareBrand(brand: HTMLElement) {
  if (brand.hasAttribute(READY_ATTRIBUTE)) return;

  brand.setAttribute(READY_ATTRIBUTE, "true");
  brand.setAttribute("role", "button");
  brand.setAttribute("tabindex", "0");
  brand.setAttribute("aria-label", "Voltar à visão inicial do Labstar");
  brand.setAttribute("title", "Voltar ao início");
  brand.style.cursor = "pointer";
  brand.style.borderRadius = "10px";

  brand.addEventListener("click", goToHome);
  brand.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    goToHome();
  });
}

function syncBrandHomeNavigation() {
  const brand = document.querySelector<HTMLElement>(BRAND_SELECTOR);
  if (brand) prepareBrand(brand);
}

function startBrandHomeNavigation() {
  const observer = new MutationObserver(syncBrandHomeNavigation);
  observer.observe(document.body, { childList: true, subtree: true });
  syncBrandHomeNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBrandHomeNavigation, { once: true });
} else {
  startBrandHomeNavigation();
}
