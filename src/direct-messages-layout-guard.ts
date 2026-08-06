const DESKTOP_RAIL_WIDTH = 64;
const MOBILE_BREAKPOINT = 700;
const BUILD_MARKER = "dm-layout-runtime-2026-08-06-1";

function forceDirectMessagesLayout() {
  const workspace = document.querySelector<HTMLElement>(".workspace.collaboration-workspace");
  if (!workspace) return;

  const directHub = workspace.querySelector<HTMLElement>(":scope > .direct-hub");
  if (!directHub) return;

  const workspaceRect = workspace.getBoundingClientRect();
  const availableHeight = Math.max(0, window.innerHeight - workspaceRect.top);
  const railWidth = window.innerWidth <= MOBILE_BREAKPOINT ? 0 : DESKTOP_RAIL_WIDTH;

  document.documentElement.dataset.labstarBuild = BUILD_MARKER;

  workspace.style.setProperty("position", "relative", "important");
  workspace.style.setProperty("height", `${availableHeight}px`, "important");
  workspace.style.setProperty("min-height", "0", "important");
  workspace.style.setProperty("max-height", `${availableHeight}px`, "important");
  workspace.style.setProperty("overflow", "hidden", "important");

  directHub.style.setProperty("position", "absolute", "important");
  directHub.style.setProperty("top", "0", "important");
  directHub.style.setProperty("right", "0", "important");
  directHub.style.setProperty("bottom", "0", "important");
  directHub.style.setProperty("left", `${railWidth}px`, "important");
  directHub.style.setProperty("width", "auto", "important");
  directHub.style.setProperty("height", "auto", "important");
  directHub.style.setProperty("min-width", "0", "important");
  directHub.style.setProperty("min-height", "0", "important");
  directHub.style.setProperty("max-width", "none", "important");
  directHub.style.setProperty("max-height", "none", "important");
  directHub.style.setProperty("margin", "0", "important");
  directHub.style.setProperty("overflow", "hidden", "important");
  directHub.style.setProperty("grid-template-rows", "minmax(0, 1fr)", "important");
  directHub.style.setProperty("grid-auto-rows", "minmax(0, 1fr)", "important");
  directHub.style.setProperty("align-items", "stretch", "important");

  for (const child of Array.from(directHub.children)) {
    if (!(child instanceof HTMLElement)) continue;
    child.style.setProperty("min-height", "0", "important");
    child.style.setProperty("max-height", "none", "important");
    child.style.setProperty("align-self", "stretch", "important");
  }
}

let frame = 0;
let resizeObserver: ResizeObserver | null = null;
let observedWorkspace: HTMLElement | null = null;
let observedDirectHub: HTMLElement | null = null;

function observeCurrentLayout() {
  if (!resizeObserver) return;

  const workspace = document.querySelector<HTMLElement>(".workspace.collaboration-workspace");
  const directHub = workspace?.querySelector<HTMLElement>(":scope > .direct-hub") ?? null;
  if (workspace === observedWorkspace && directHub === observedDirectHub) return;

  resizeObserver.disconnect();
  observedWorkspace = workspace;
  observedDirectHub = directHub;

  if (workspace) resizeObserver.observe(workspace);
  if (directHub) resizeObserver.observe(directHub);
}

function scheduleDirectMessagesLayout() {
  window.cancelAnimationFrame(frame);
  frame = window.requestAnimationFrame(() => {
    forceDirectMessagesLayout();
    observeCurrentLayout();
  });
}

function startDirectMessagesLayoutGuard() {
  const mutationObserver = new MutationObserver(scheduleDirectMessagesLayout);
  mutationObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleDirectMessagesLayout);
  }

  window.addEventListener("resize", scheduleDirectMessagesLayout);
  window.addEventListener("orientationchange", scheduleDirectMessagesLayout);
  window.addEventListener("pageshow", scheduleDirectMessagesLayout);
  window.addEventListener("labstar:open-direct", scheduleDirectMessagesLayout);

  scheduleDirectMessagesLayout();
  [80, 220, 600, 1200, 2200].forEach((delay) => {
    window.setTimeout(scheduleDirectMessagesLayout, delay);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDirectMessagesLayoutGuard, { once: true });
} else {
  startDirectMessagesLayoutGuard();
}
