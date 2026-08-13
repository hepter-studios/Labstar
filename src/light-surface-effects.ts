type LiquidGroupState = {
  indicator: HTMLSpanElement;
  previousKey: string;
  moveTimer: number;
};

type BubbleDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  moved: boolean;
};

const LIQUID_GROUP_SELECTORS = [
  ".rail-group",
  ".workspace-surface-rail",
  ".global-settings-nav nav",
  ".dm-navigation",
  ".dm-inbox-tabs",
  ".card-theme-picker [role=\"radiogroup\"]",
];

const CHAT_SCROLL_SELECTORS = [".message-scroll", ".dm-message-scroll"];
const ACTIVE_BUTTON_SELECTOR = [
  "button.active",
  "button[aria-current=\"page\"]",
  "button[aria-selected=\"true\"]",
  "button[role=\"radio\"][aria-checked=\"true\"]",
].join(",");

const SOAP_TINTS = [
  "rgba(255,214,232,.38)",
  "rgba(207,232,255,.38)",
  "rgba(230,217,255,.38)",
  "rgba(211,255,233,.36)",
  "rgba(255,238,199,.34)",
];

const liquidGroups = new WeakMap<HTMLElement, LiquidGroupState>();
const bubbleLayers = new WeakMap<HTMLElement, HTMLElement>();
let runtimeStarted = false;
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let scheduledFrame = 0;

function isLightTheme() {
  return document.documentElement.dataset.labstarTheme === "light";
}

function reducedMotion() {
  return document.documentElement.dataset.labstarMotion === "reduced"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function compactBubbleMode() {
  return window.matchMedia("(max-width: 820px)").matches;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function ensureSvgFilters() {
  if (document.getElementById("labstar-neu-effect-defs")) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "labstar-neu-effect-defs";
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("labstar-neu-effect-defs");
  svg.innerHTML = `
    <defs>
      <filter id="labstar-goo-bubbles" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="blur" />
        <feColorMatrix in="blur" mode="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 20 -8" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
      <filter id="labstar-goo-small" x="-35%" y="-35%" width="170%" height="170%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
        <feColorMatrix in="blur" mode="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 18 -7" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </defs>`;
  document.body.appendChild(svg);
}

function activeButton(group: HTMLElement) {
  return group.querySelector<HTMLButtonElement>(ACTIVE_BUTTON_SELECTOR);
}

function buttonKey(button: HTMLButtonElement) {
  return button.getAttribute("aria-label")
    || button.getAttribute("data-tooltip")
    || button.textContent?.trim()
    || String(Array.from(button.parentElement?.children ?? []).indexOf(button));
}

function ensureLiquidGroup(group: HTMLElement) {
  let state = liquidGroups.get(group);
  if (!state) {
    const indicator = document.createElement("span");
    indicator.className = "labstar-liquid-indicator";
    indicator.setAttribute("aria-hidden", "true");
    group.appendChild(indicator);
    group.classList.add("labstar-liquid-group");
    state = { indicator, previousKey: "", moveTimer: 0 };
    liquidGroups.set(group, state);
    resizeObserver?.observe(group);
  }

  const selected = activeButton(group);
  if (!selected || !group.isConnected) {
    state.indicator.style.opacity = "0";
    return;
  }

  const groupRect = group.getBoundingClientRect();
  const buttonRect = selected.getBoundingClientRect();
  if (!buttonRect.width || !buttonRect.height || !groupRect.width || !groupRect.height) {
    state.indicator.style.opacity = "0";
    return;
  }

  const nextKey = buttonKey(selected);
  const x = buttonRect.left - groupRect.left + group.scrollLeft;
  const y = buttonRect.top - groupRect.top + group.scrollTop;
  state.indicator.style.setProperty("--liquid-x", `${x}px`);
  state.indicator.style.setProperty("--liquid-y", `${y}px`);
  state.indicator.style.setProperty("--liquid-w", `${buttonRect.width}px`);
  state.indicator.style.setProperty("--liquid-h", `${buttonRect.height}px`);
  state.indicator.style.opacity = "1";

  if (state.previousKey && state.previousKey !== nextKey && !reducedMotion()) {
    window.clearTimeout(state.moveTimer);
    state.indicator.classList.remove("is-moving");
    void state.indicator.offsetWidth;
    state.indicator.classList.add("is-moving");
    state.moveTimer = window.setTimeout(() => state?.indicator.classList.remove("is-moving"), 620);
  }
  state.previousKey = nextKey;
}

function updateLiquidGroups() {
  if (!isLightTheme()) return;
  for (const selector of LIQUID_GROUP_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach(ensureLiquidGroup);
  }
}

function makeSoapBubble(field: HTMLElement, index: number, compact: boolean) {
  const bubble = document.createElement("span");
  bubble.className = "labstar-soap-bubble";
  bubble.setAttribute("aria-hidden", "true");
  const min = compact ? 64 : 88;
  const max = compact ? 126 : 190;
  const size = randomBetween(min, max);
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  bubble.style.left = `${randomBetween(4, 84)}%`;
  bubble.style.top = `${randomBetween(4, 78)}%`;
  bubble.style.setProperty("--soap-tint", SOAP_TINTS[index % SOAP_TINTS.length]);
  bubble.style.setProperty("--soap-tx1", `${randomBetween(-54, 54)}px`);
  bubble.style.setProperty("--soap-ty1", `${randomBetween(-42, 42)}px`);
  bubble.style.setProperty("--soap-tx2", `${randomBetween(-54, 54)}px`);
  bubble.style.setProperty("--soap-ty2", `${randomBetween(-42, 42)}px`);
  bubble.style.setProperty("--soap-s1", randomBetween(.88, 1.14).toFixed(2));
  bubble.style.setProperty("--soap-s2", randomBetween(.9, 1.16).toFixed(2));
  bubble.style.setProperty("--soap-duration", `${randomBetween(compact ? 17 : 12, compact ? 24 : 20).toFixed(1)}s`);
  bubble.style.setProperty("--soap-delay", `${randomBetween(-12, -1).toFixed(1)}s`);

  let drag: BubbleDragState | null = null;

  const respawn = () => {
    window.setTimeout(() => {
      if (!field.isConnected || !isLightTheme()) return;
      field.appendChild(makeSoapBubble(field, Math.floor(Math.random() * SOAP_TINTS.length), compactBubbleMode()));
    }, 280 + Math.random() * 420);
  };

  const pop = () => {
    if (bubble.classList.contains("is-popping")) return;
    bubble.classList.add("is-popping");
    window.setTimeout(() => {
      bubble.remove();
      respawn();
    }, 270);
  };

  bubble.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const fieldRect = field.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const visualLeft = bubbleRect.left - fieldRect.left;
    const visualTop = bubbleRect.top - fieldRect.top;
    bubble.style.left = `${visualLeft}px`;
    bubble.style.top = `${visualTop}px`;
    bubble.style.animation = "none";
    bubble.style.transform = "none";
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: visualLeft,
      originTop: visualTop,
      moved: false,
    };
    bubble.setPointerCapture(event.pointerId);
    bubble.classList.add("is-dragging");
  });

  bubble.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    const maxLeft = Math.max(0, field.clientWidth - bubble.offsetWidth);
    const maxTop = Math.max(0, field.clientHeight - bubble.offsetHeight);
    bubble.style.left = `${Math.max(0, Math.min(maxLeft, drag.originLeft + dx))}px`;
    bubble.style.top = `${Math.max(0, Math.min(maxTop, drag.originTop + dy))}px`;
  });

  const finishPointer = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const shouldPop = !drag.moved;
    try { bubble.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    bubble.classList.remove("is-dragging");
    drag = null;
    if (shouldPop) pop();
  };

  bubble.addEventListener("pointerup", finishPointer);
  bubble.addEventListener("pointercancel", finishPointer);
  return bubble;
}

function syncBubbleLayerSize(scroll: HTMLElement, layer: HTMLElement) {
  layer.style.setProperty("--soap-viewport-h", `${Math.max(1, scroll.clientHeight)}px`);
}

function ensureBubbleLayer(scroll: HTMLElement) {
  if (!scroll.isConnected) return;
  const existing = bubbleLayers.get(scroll);
  if (existing?.isConnected) {
    syncBubbleLayerSize(scroll, existing);
    return;
  }
  if (existing) bubbleLayers.delete(scroll);

  const layer = document.createElement("div");
  layer.className = "labstar-soap-layer";
  layer.setAttribute("aria-hidden", "true");
  const field = document.createElement("div");
  field.className = "labstar-soap-field";
  layer.appendChild(field);

  const compact = compactBubbleMode();
  const count = compact ? 3 : 5;
  for (let index = 0; index < count; index += 1) {
    field.appendChild(makeSoapBubble(field, index, compact));
  }

  syncBubbleLayerSize(scroll, layer);
  scroll.prepend(layer);
  scroll.classList.add("labstar-soap-enabled");
  bubbleLayers.set(scroll, layer);
  resizeObserver?.observe(scroll);
}

function updateBubbleLayers() {
  if (!isLightTheme()) {
    for (const selector of CHAT_SCROLL_SELECTORS) {
      document.querySelectorAll<HTMLElement>(selector).forEach((scroll) => {
        const layer = bubbleLayers.get(scroll);
        layer?.remove();
        scroll.classList.remove("labstar-soap-enabled");
        bubbleLayers.delete(scroll);
        resizeObserver?.unobserve(scroll);
      });
    }
    return;
  }

  ensureSvgFilters();
  for (const selector of CHAT_SCROLL_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach(ensureBubbleLayer);
  }
}

function syncEffects() {
  scheduledFrame = 0;
  if (!document.body) return;
  updateLiquidGroups();
  updateBubbleLayers();
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
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-labstar-theme", "data-labstar-motion", "aria-selected", "aria-checked"],
    });
    window.addEventListener("resize", scheduleSync, { passive: true });
  }
  scheduleSync();
}
