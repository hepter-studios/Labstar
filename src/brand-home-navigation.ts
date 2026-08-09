export {};

const BRAND_SELECTOR = ".app > .header .brand";
const RAIL_SELECTOR = ".rail-group";
const HOME_LABEL = "Visão geral";
const READY_ATTRIBUTE = "data-labstar-home-ready";
const NAV_READY_ATTRIBUTE = "data-labstar-navigation-ready";

let activeMainView = HOME_LABEL;
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
  if (label) activeMainView = label;
}

function prepareNavigationButton(button: HTMLButtonElement) {
  if (button.hasAttribute(NAV_READY_ATTRIBUTE)) return;
  button.setAttribute(NAV_READY_ATTRIBUTE, "true");
  button.addEventListener("click", () => {
    const label = button.getAttribute("aria-label")?.trim();
    if (label) activeMainView = label;
  });
}

function restoreMainView(rail: HTMLElement) {
  const targetLabel = navigationInitialized ? activeMainView : HOME_LABEL;
  navigationInitialized = true;
  activeMainView = targetLabel;

  const button = findViewButton(targetLabel, rail) ?? findViewButton(HOME_LABEL, rail);
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
  const homeButton = findViewButton(HOME_LABEL, currentRail);
  if (!homeButton) return;

  homeButton.click();

  // Voltar ao início usa apenas a navegação interna do React. Nada de reload:
  // o mesmo comportamento vale para a Web e para o shell desktop do Tauri.
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
  syncBrandHomeNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBrandHomeNavigation, { once: true });
} else {
  startBrandHomeNavigation();
}
