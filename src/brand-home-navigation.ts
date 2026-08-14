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

// Uma abertura nova começa no Dashboard. Depois disso, nenhuma rotina de
// background tem autorização para trocar a área principal por conta própria.
// A área escolhida pelo usuário só é atualizada por uma interação real (ou por
// uma ação programática diretamente causada por essa interação, como clicar em
// um servidor do Dashboard e abrir o canal correspondente).
let activeMainView = HOME_LABEL;
let currentRail: HTMLElement | null = null;
let firstNavigationApplied = false;
let internalNavigation = false;
let lastUserGestureAt = 0;

function markUserGesture() {
  lastUserGestureAt = performance.now();
}

function hasRecentUserGesture() {
  return performance.now() - lastUserGestureAt < 1_200;
}

function findViewButton(label: string, rail?: HTMLElement | null) {
  const root = rail ?? document;
  return root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function runInternalNavigation(button: HTMLButtonElement) {
  internalNavigation = true;
  try {
    button.click();
  } finally {
    queueMicrotask(() => {
      internalNavigation = false;
    });
  }
}

function prepareNavigationButton(button: HTMLButtonElement) {
  if (button.hasAttribute(NAV_READY_ATTRIBUTE)) return;
  button.setAttribute(NAV_READY_ATTRIBUTE, "true");

  // Captura antes do onClick do React. Cliques programáticos soltos, disparados
  // por timers/observers sem uma ação do usuário, são bloqueados. Isso elimina o
  // efeito de a interface "viajar" para a Central alguns segundos depois.
  button.addEventListener("click", (event) => {
    const label = button.getAttribute("aria-label")?.trim();
    if (!label || !VALID_MAIN_VIEWS.has(label)) return;

    const allowed = internalNavigation || event.isTrusted || hasRecentUserGesture();
    if (!allowed) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    activeMainView = label;
  }, true);
}

function restoreViewAfterRealRemount(rail: HTMLElement, label: string) {
  const button = findViewButton(label, rail) ?? findViewButton(HOME_LABEL, rail);
  if (!button || button.classList.contains("active")) return;
  runInternalNavigation(button);
}

function syncMainNavigation() {
  const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  if (!rail) return;

  rail.querySelectorAll<HTMLButtonElement>("button[aria-label]").forEach(prepareNavigationButton);

  if (rail === currentRail) return;
  currentRail = rail;

  // Primeiro mount: Dashboard. Se o React realmente remontar a navegação na
  // mesma execução, restaura somente a última área escolhida pelo usuário.
  const target = firstNavigationApplied ? activeMainView : HOME_LABEL;
  firstNavigationApplied = true;
  window.requestAnimationFrame(() => restoreViewAfterRealRemount(rail, target));
}

function goToHome() {
  activeMainView = HOME_LABEL;
  const homeButton = findViewButton(HOME_LABEL, currentRail);
  if (!homeButton) return;

  runInternalNavigation(homeButton);
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
  document.addEventListener("pointerdown", markUserGesture, true);
  document.addEventListener("keydown", markUserGesture, true);

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
