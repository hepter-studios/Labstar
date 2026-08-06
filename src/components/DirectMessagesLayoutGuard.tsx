import { useEffect } from "react";

const DESKTOP_RAIL_WIDTH = 64;
const MOBILE_BREAKPOINT = 700;

function forceDirectMessagesLayout() {
  const workspace = document.querySelector<HTMLElement>(".workspace.collaboration-workspace");
  if (!workspace) return;

  const directHub = workspace.querySelector<HTMLElement>(":scope > .direct-hub");
  if (!directHub) return;

  const workspaceRect = workspace.getBoundingClientRect();
  const availableHeight = Math.max(0, window.innerHeight - workspaceRect.top);
  const railWidth = window.innerWidth <= MOBILE_BREAKPOINT ? 0 : DESKTOP_RAIL_WIDTH;

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

export function DirectMessagesLayoutGuard() {
  useEffect(() => {
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        forceDirectMessagesLayout();

        const workspace = document.querySelector<HTMLElement>(".workspace.collaboration-workspace");
        const directHub = workspace?.querySelector<HTMLElement>(":scope > .direct-hub");
        if (workspace && directHub && resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver.observe(workspace);
          resizeObserver.observe(directHub);
        }
      });
    };

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    resizeObserver = new ResizeObserver(schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("pageshow", schedule);

    schedule();
    const delayedChecks = [80, 220, 600, 1200].map((delay) => window.setTimeout(schedule, delay));

    return () => {
      window.cancelAnimationFrame(frame);
      delayedChecks.forEach((timer) => window.clearTimeout(timer));
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
    };
  }, []);

  return null;
}
