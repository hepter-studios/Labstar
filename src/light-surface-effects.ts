type LiquidGroupState = {
  indicator: HTMLSpanElement;
  moveTimer: number;
  previousKey: string;
};

const LIQUID_GROUP_SELECTOR = "[data-labstar-liquid-group]";
const ACTIVE_BUTTON_SELECTOR = [
  ":scope > button.active",
  ":scope > button[aria-current=\"page\"]",
  ":scope > button[aria-selected=\"true\"]",
  ":scope > button[role=\"radio\"][aria-checked=\"true\"]",
].join(",");

const liquidGroups = new WeakMap<HTMLElement, LiquidGroupState>();
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let runtimeStarted = false;
let scheduledFrame = 0;

function isNeumorphicTheme() {
  const theme = document.documentElement.dataset.labstarTheme;
  return theme === "light" || theme === "dark";
}

function hasReducedMotion() {
  return document.documentElement.dataset.labstarMotion === "reduced"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ensureLiquidFilter() {
  if (document.getElementById("labstar-liquid-filter-defs")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "labstar-liquid-filter-defs";
  svg.classList.add("labstar-neu-effect-defs");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = `
    <defs>
      <filter id="labstar-goo-small" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
        <feColorMatrix in="blur" mode="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 15 -5" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </defs>`;
  document.body.appendChild(svg);
}

function buttonKey(button: HTMLButtonElement) {
  return button.getAttribute("aria-label")
    || button.getAttribute("data-tooltip")
    || button.textContent?.trim()
    || String(Array.from(button.parentElement?.children ?? []).indexOf(button));
}

function ensureLiquidGroup(group: HTMLElement) {
  let state = liquidGroups.get(group);
  if (!state || !state.indicator.isConnected) {
    const indicator = document.createElement("span");
    indicator.className = "labstar-liquid-indicator";
    indicator.setAttribute("aria-hidden", "true");
    group.appendChild(indicator);
    group.classList.add("labstar-liquid-group");
    state = { indicator, moveTimer: 0, previousKey: "" };
    liquidGroups.set(group, state);
    resizeObserver?.observe(group);
  }

  const selected = group.querySelector<HTMLButtonElement>(ACTIVE_BUTTON_SELECTOR);
  if (!selected) {
    state.indicator.style.opacity = "0";
    state.previousKey = "";
    return;
  }

  const groupRect = group.getBoundingClientRect();
  const buttonRect = selected.getBoundingClientRect();
  if (!groupRect.width || !groupRect.height || !buttonRect.width || !buttonRect.height) {
    state.indicator.style.opacity = "0";
    return;
  }

  const nextKey = buttonKey(selected);
  state.indicator.style.setProperty("--liquid-x", `${buttonRect.left - groupRect.left + group.scrollLeft}px`);
  state.indicator.style.setProperty("--liquid-y", `${buttonRect.top - groupRect.top + group.scrollTop}px`);
  state.indicator.style.setProperty("--liquid-w", `${buttonRect.width}px`);
  state.indicator.style.setProperty("--liquid-h", `${buttonRect.height}px`);
  state.indicator.style.opacity = "1";

  if (state.previousKey && state.previousKey !== nextKey && !hasReducedMotion()) {
    window.clearTimeout(state.moveTimer);
    state.indicator.classList.remove("is-moving");
    void state.indicator.offsetWidth;
    state.indicator.classList.add("is-moving");
    state.moveTimer = window.setTimeout(() => state?.indicator.classList.remove("is-moving"), 620);
  }
  state.previousKey = nextKey;
}

function removeLiquidGroups() {
  document.querySelectorAll<HTMLElement>(LIQUID_GROUP_SELECTOR).forEach((group) => {
    const state = liquidGroups.get(group);
    if (state) {
      window.clearTimeout(state.moveTimer);
      resizeObserver?.unobserve(group);
      state.indicator.remove();
      liquidGroups.delete(group);
    }
    group.classList.remove("labstar-liquid-group");
  });
}

function syncEffects() {
  scheduledFrame = 0;
  if (!document.body) return;
  if (!isNeumorphicTheme()) {
    removeLiquidGroups();
    return;
  }
  ensureLiquidFilter();
  document.querySelectorAll<HTMLElement>(LIQUID_GROUP_SELECTOR).forEach(ensureLiquidGroup);
}

function scheduleSync() {
  if (scheduledFrame) return;
  scheduledFrame = window.requestAnimationFrame(syncEffects);
}

export function applyLightSurfaceEffects() {
  if (!runtimeStarted) {
    runtimeStarted = true;
    resizeObserver = new ResizeObserver(scheduleSync);
    mutationObserver = new MutationObserver(scheduleSync);
    mutationObserver.observe(document.documentElement, {
      attributeFilter: [
        "aria-checked",
        "aria-current",
        "aria-selected",
        "class",
        "data-labstar-motion",
        "data-labstar-theme",
      ],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", scheduleSync, { passive: true });
  }
  scheduleSync();
}
