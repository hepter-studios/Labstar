export {};

const BRAND_SELECTOR = ".app > .header .brand";
const RAIL_SELECTOR = ".rail-group";
const HOME_LABEL = "Visão geral";
const READY_ATTRIBUTE = "data-labstar-home-ready";
const NAV_READY_ATTRIBUTE = "data-labstar-navigation-ready";
const VALID_MAIN_VIEWS = new Set([
  "Visão geral",
  "Mapa da organização",
  "Central de trabalho",
  "Equipe",
]);

// Estado somente em memória: uma abertura nova do Labstar começa sempre na
// Dashboard. Enquanto esta instância continuar aberta, a aba escolhida pelo
// usuário fica preservada e nunca é trocada por visibilitychange/pageshow.
let activeMainView = HOME_LABEL;
let currentRail: HTMLElement | null = null;
let firstNavigationApplied = false;

function findViewButton(label: string, rail?: HTMLElement | null) {
  const root = rail ?? document;
  return root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function rememberVisibleView(rail: HTMLElement) {
  const active = rail.querySelector<HTMLButtonElement>("button.active[aria-label]");
  const label = active?.getAttribute("aria-label")?.trim();
  if (label && VALID_MAIN_VIEWS.has(label)) activeMainView = label;
}

function prepareNavigationButton(button: HTMLButtonElement) {
  if (button.hasAttribute(NAV_READY_ATTRIBUTE)) return;
  button.setAttribute(NAV_READY_ATTRIBUTE, "true");
  button.addEventListener("click", () => {
    const label = button.getAttribute("aria-label")?.trim();
    if (label && VALID_MAIN_VIEWS.has(label)) activeMainView = label;
  });
}

function restoreViewAfterRealRemount(rail: HTMLElement, label: string) {
  const button = findViewButton(label, rail) ?? findViewButton(HOME_LABEL, rail);
  if (!button || button.classList.contains("active")) {
    rememberVisibleView(rail);
    return;
  }
  button.click();
}

function syncMainNavigation() {
  const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  if (!rail) return;

  rail.querySelectorAll<HTMLButtonElement>("button[aria-label]").forEach(prepareNavigationButton);

  if (rail !== currentRail) {
    currentRail = rail;
    const target = firstNavigationApplied ? activeMainView : HOME_LABEL;
    firstNavigationApplied = true;
    window.requestAnimationFrame(() => restoreViewAfterRealRemount(rail, target));
    return;
  }

  // Apenas observa a seleção atual. Não clica, não restaura e não interfere na
  // navegação quando a janela perde foco, muda de aba ou volta a ficar visível.
  rememberVisibleView(rail);
}

function goToHome() {
  activeMainView = HOME_LABEL;
  const homeButton = findViewButton(HOME_LABEL, currentRail);
  if (!homeButton) return;

  homeButton.click();
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
  syncMainNavigation();
}

function startBrandHomeNavigation() {
  // Observamos somente montagem/desmontagem de nós. Mudanças de classe do React
  // (como trocar a aba ativa) não disparam restaurações automáticas.
  const observer = new MutationObserver(syncBrandHomeNavigation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  syncBrandHomeNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBrandHomeNavigation, { once: true });
} else {
  startBrandHomeNavigation();
}
