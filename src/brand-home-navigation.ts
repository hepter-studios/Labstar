export {};

const BRAND_SELECTOR = ".app > .header .brand";
const RAIL_SELECTOR = ".rail-group";
const HOME_LABEL = "Visão geral";
const READY_ATTRIBUTE = "data-labstar-home-ready";
const NAV_READY_ATTRIBUTE = "data-labstar-navigation-ready";
const VIEW_SESSION_KEY = "labstar-main-view-v3";
const VALID_MAIN_VIEWS = new Set([
  "Visão geral",
  "Mapa da organização",
  "Central de trabalho",
  "Equipe",
]);

function readSavedView() {
  try {
    const value = window.sessionStorage.getItem(VIEW_SESSION_KEY)?.trim() ?? "";
    return VALID_MAIN_VIEWS.has(value) ? value : HOME_LABEL;
  } catch {
    return HOME_LABEL;
  }
}

function saveActiveView(label: string) {
  if (!VALID_MAIN_VIEWS.has(label)) return;
  try {
    window.sessionStorage.setItem(VIEW_SESSION_KEY, label);
  } catch {
    // A navegação continua funcionando mesmo quando o armazenamento da sessão é bloqueado.
  }
}

let activeMainView = readSavedView();
let currentRail: HTMLElement | null = null;
let navigationInitialized = false;
let restoringNavigation = false;

function findViewButton(label: string, rail?: HTMLElement | null) {
  const root = rail ?? document;
  return root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function rememberActiveView(rail: HTMLElement) {
  if (restoringNavigation) return;
  const active = rail.querySelector<HTMLButtonElement>("button.active[aria-label]");
  const label = active?.getAttribute("aria-label")?.trim();
  if (!label || !VALID_MAIN_VIEWS.has(label)) return;
  activeMainView = label;
  saveActiveView(label);
}

function prepareNavigationButton(button: HTMLButtonElement) {
  if (button.hasAttribute(NAV_READY_ATTRIBUTE)) return;
  button.setAttribute(NAV_READY_ATTRIBUTE, "true");
  button.addEventListener("click", () => {
    const label = button.getAttribute("aria-label")?.trim();
    if (!label || !VALID_MAIN_VIEWS.has(label)) return;
    activeMainView = label;
    saveActiveView(label);
  });
}

function restoreMainView(rail: HTMLElement) {
  // Em uma sessão nova não existe valor salvo, então a primeira tela é sempre
  // o Dashboard (Visão geral). Depois que o usuário troca de aba, a escolha fica
  // preservada nesta mesma sessão mesmo se o React remontar ou a página voltar
  // do cache do navegador.
  const targetLabel = navigationInitialized ? activeMainView : readSavedView();
  navigationInitialized = true;
  activeMainView = VALID_MAIN_VIEWS.has(targetLabel) ? targetLabel : HOME_LABEL;

  const button = findViewButton(activeMainView, rail) ?? findViewButton(HOME_LABEL, rail);
  if (!button || button.classList.contains("active")) {
    rememberActiveView(rail);
    return;
  }

  restoringNavigation = true;
  button.click();
  window.requestAnimationFrame(() => {
    restoringNavigation = false;
    rememberActiveView(rail);
  });
}

function syncMainNavigation() {
  const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  if (!rail) return;

  rail.querySelectorAll<HTMLButtonElement>("button[aria-label]").forEach(prepareNavigationButton);

  if (rail !== currentRail) {
    currentRail = rail;
    window.requestAnimationFrame(() => restoreMainView(rail));
    return;
  }

  rememberActiveView(rail);
}

function goToHome() {
  activeMainView = HOME_LABEL;
  saveActiveView(HOME_LABEL);
  const homeButton = findViewButton(HOME_LABEL, currentRail);
  if (!homeButton) return;

  homeButton.click();

  // Voltar ao início usa somente a navegação interna do React. Não há reload,
  // troca de URL nem reconstrução proposital da aplicação.
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
  const observer = new MutationObserver(syncBrandHomeNavigation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  // pageshow também cobre retorno pelo histórico/BFCache. Apenas restauramos a
  // tela já escolhida; nunca chamamos location.reload().
  window.addEventListener("pageshow", syncBrandHomeNavigation);
  syncBrandHomeNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBrandHomeNavigation, { once: true });
} else {
  startBrandHomeNavigation();
}
