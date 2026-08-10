export {};

const MOBILE_DM_BREAKPOINT = 760;
const MARKER = "v9";

type ImportantStyles = Record<string, string>;

function setImportant(element: HTMLElement | null, styles: ImportantStyles) {
  if (!element) return;
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value, "important");
  }
}

function isMobile() {
  return window.innerWidth <= MOBILE_DM_BREAKPOINT;
}

function forceHidden(root: ParentNode, selector: string) {
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    setImportant(element, {
      display: "none",
      visibility: "hidden",
      "pointer-events": "none",
    });
  });
}

function styleContactList(hub: HTMLElement) {
  const sidebar = hub.querySelector<HTMLElement>(".dm-sidebar");
  const list = hub.querySelector<HTMLElement>(".dm-contact-list");

  setImportant(hub, {
    position: "absolute",
    inset: "52px 0 0",
    width: "100%",
    height: "auto",
    "min-width": "0",
    "min-height": "0",
    "max-width": "100%",
    margin: "0",
    padding: "0",
    display: "block",
    overflow: "hidden",
    background: "#05070b",
    isolation: "isolate",
  });

  forceHidden(hub, ".dm-space-rail, .dm-home-main, .dm-inbox, .dm-profile-panel, .dm-own-profile, .dm-conversation");

  setImportant(sidebar, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    "min-width": "0",
    "min-height": "0",
    "max-width": "100%",
    display: "grid",
    "grid-template-columns": "minmax(0, 1fr)",
    "grid-template-rows": "44px 46px 1px 30px minmax(0, 1fr)",
    overflow: "hidden",
    border: "0",
    background: "#070a10",
    visibility: "visible",
    "pointer-events": "auto",
    "z-index": "20",
  });

  setImportant(hub.querySelector<HTMLElement>(".dm-search"), {
    width: "auto",
    height: "36px",
    margin: "4px 10px",
    padding: "0 10px",
    "box-sizing": "border-box",
  });

  const navigation = hub.querySelector<HTMLElement>(".dm-navigation");
  setImportant(navigation, {
    width: "100%",
    height: "46px",
    padding: "4px 10px 5px",
    display: "grid",
    "grid-template-columns": "repeat(4, minmax(0, 1fr))",
    "align-items": "stretch",
    gap: "5px",
    overflow: "hidden",
  });
  navigation?.querySelectorAll<HTMLElement>("button").forEach((button) => {
    setImportant(button, {
      width: "100%",
      "min-width": "0",
      height: "36px",
      "min-height": "36px",
      padding: "0 6px",
      display: "grid",
      "grid-template-columns": "auto",
      "place-items": "center",
      gap: "0",
      overflow: "hidden",
    });
    button.querySelectorAll<HTMLElement>("span, b").forEach((label) => setImportant(label, { display: "none" }));
  });

  setImportant(hub.querySelector<HTMLElement>(".dm-divider"), {
    width: "auto",
    height: "1px",
    margin: "0 10px",
    display: "block",
  });

  setImportant(hub.querySelector<HTMLElement>(".dm-list-heading"), {
    width: "100%",
    height: "30px",
    padding: "0 12px",
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
  });

  setImportant(list, {
    position: "relative",
    inset: "auto",
    width: "100%",
    height: "100%",
    "min-width": "0",
    "min-height": "0",
    "max-width": "100%",
    padding: "6px 10px 16px",
    margin: "0",
    display: "grid",
    "grid-template-columns": "minmax(0, 1fr)",
    "grid-auto-rows": "62px",
    "align-content": "start",
    "align-items": "stretch",
    gap: "6px",
    "overflow-x": "hidden",
    "overflow-y": "auto",
    background: "#070a10",
    visibility: "visible",
    "pointer-events": "auto",
    "z-index": "30",
  });

  list?.querySelectorAll<HTMLElement>(".dm-contact-entry").forEach((entry) => {
    setImportant(entry, {
      position: "relative",
      inset: "auto",
      width: "100%",
      height: "62px",
      "min-width": "0",
      "min-height": "62px",
      "max-width": "100%",
      "max-height": "62px",
      margin: "0",
      display: "grid",
      "grid-template-columns": "minmax(0, 1fr) 38px",
      "align-items": "center",
      overflow: "hidden",
      transform: "none",
      opacity: "1",
      visibility: "visible",
      "pointer-events": "auto",
      "z-index": "31",
    });

    setImportant(entry.querySelector<HTMLElement>(".dm-contact-main"), {
      position: "relative",
      inset: "auto",
      width: "100%",
      height: "60px",
      "min-width": "0",
      "min-height": "60px",
      "max-height": "60px",
      padding: "8px 6px 8px 9px",
      display: "grid",
      "grid-template-columns": "38px minmax(0, 1fr) auto",
      "align-items": "center",
      gap: "9px",
      overflow: "hidden",
      opacity: "1",
      visibility: "visible",
      "pointer-events": "auto",
      "z-index": "32",
    });

    setImportant(entry.querySelector<HTMLElement>(".dm-favorite-contact"), {
      position: "relative",
      inset: "auto",
      width: "38px",
      height: "60px",
      "min-width": "38px",
      "min-height": "60px",
      "max-width": "38px",
      "max-height": "60px",
      margin: "0",
      display: "grid",
      "place-items": "center",
      opacity: "1",
      visibility: "visible",
      "pointer-events": "auto",
      "z-index": "32",
    });
  });
}

function styleConversation(hub: HTMLElement) {
  setImportant(hub, {
    position: "absolute",
    inset: "52px 0 0",
    width: "100%",
    height: "auto",
    "min-width": "0",
    "min-height": "0",
    "max-width": "100%",
    margin: "0",
    padding: "0",
    display: "block",
    overflow: "hidden",
    background: "#05070b",
    isolation: "isolate",
  });

  forceHidden(hub, ".dm-space-rail, .dm-sidebar, .dm-home-main, .dm-inbox, .dm-profile-panel");

  const conversation = hub.querySelector<HTMLElement>(".dm-conversation");
  setImportant(conversation, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    "min-width": "0",
    "min-height": "0",
    "max-width": "100%",
    display: "grid",
    "grid-template-columns": "minmax(0, 1fr)",
    "grid-template-rows": "58px minmax(0, 1fr) auto",
    overflow: "hidden",
    border: "0",
    background: "#05070b",
    visibility: "visible",
    "pointer-events": "auto",
    "z-index": "30",
  });

  setImportant(conversation?.querySelector<HTMLElement>(".dm-conversation-header") ?? null, {
    position: "relative",
    width: "100%",
    height: "58px",
    "min-height": "58px",
    padding: "0 8px",
    display: "flex",
    "align-items": "center",
    gap: "7px",
    overflow: "hidden",
    background: "#080c12",
    "z-index": "31",
  });

  setImportant(conversation?.querySelector<HTMLElement>(".dm-message-scroll") ?? null, {
    position: "relative",
    width: "100%",
    height: "auto",
    "min-width": "0",
    "min-height": "0",
    padding: "6px 0 10px",
    "overflow-x": "hidden",
    "overflow-y": "auto",
    background: "#05070b",
    "z-index": "30",
  });

  setImportant(conversation?.querySelector<HTMLElement>(".dm-composer") ?? null, {
    position: "relative",
    inset: "auto",
    width: "100%",
    height: "auto",
    "min-width": "0",
    "min-height": "0",
    "max-width": "100%",
    margin: "0",
    padding: "6px 8px calc(max(7px, env(safe-area-inset-bottom)) + 4px)",
    display: "block",
    overflow: "visible",
    background: "#070a10",
    visibility: "visible",
    "pointer-events": "auto",
    "z-index": "40",
  });
}

function applyMobileDirectMessagesAuthority() {
  const hub = document.querySelector<HTMLElement>(".communication-direct-active .direct-hub");
  if (!hub || !isMobile()) return;

  document.documentElement.dataset.labstarMobileDmAuthority = MARKER;
  if (hub.classList.contains("conversation-open")) styleConversation(hub);
  else styleContactList(hub);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    applyMobileDirectMessagesAuthority();
  });
}

const observer = new MutationObserver(schedule);

function start() {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.addEventListener("pageshow", schedule);
  document.addEventListener("click", schedule, true);
  schedule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
