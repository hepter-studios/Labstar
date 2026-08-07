export {};

const ROOM_SELECTOR = ".channel-content > .message-room";
const LOCKED_ANCESTOR_SELECTORS = [
  ".channel-content",
  ".collaboration-shell",
  ".collaboration-server-mode",
  ".workspace.collaboration-workspace",
];

function lockAncestorScroll(room: HTMLElement) {
  for (const selector of LOCKED_ANCESTOR_SELECTORS) {
    const element = room.closest<HTMLElement>(selector);
    if (!element) continue;
    if (element.scrollTop !== 0) element.scrollTop = 0;
    if (element.scrollLeft !== 0) element.scrollLeft = 0;
  }

  if (room.scrollTop !== 0) room.scrollTop = 0;
  if (room.scrollLeft !== 0) room.scrollLeft = 0;
}

function normalizeAllRooms() {
  document.querySelectorAll<HTMLElement>(ROOM_SELECTOR).forEach(lockAncestorScroll);
}

function startChannelChatStability() {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      normalizeAllRooms();
    });
  };

  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  const resizeObserver = new ResizeObserver(schedule);
  const syncResizeTargets = () => {
    document.querySelectorAll<HTMLElement>(ROOM_SELECTOR).forEach((room) => resizeObserver.observe(room));
  };
  syncResizeTargets();

  document.addEventListener("scroll", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches(".message-scroll")) return;
    if (target.closest(".collaboration-server-mode")?.querySelector(ROOM_SELECTOR)) schedule();
  }, true);

  document.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".message-composer")) {
      window.setTimeout(schedule, 0);
      window.setTimeout(schedule, 120);
    }
  }, true);

  window.addEventListener("resize", () => {
    syncResizeTargets();
    schedule();
  });
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  window.addEventListener("pageshow", schedule);

  window.setInterval(schedule, 1500);
  schedule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startChannelChatStability, { once: true });
} else {
  startChannelChatStability();
}
