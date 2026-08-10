export {};

const MOBILE_BREAKPOINT = 760;
const WORKSPACE_NAV_ID = "labstar-mobile-workspace-nav";

type WorkspacePane = "spaces" | "channels" | "content" | "members";

const paneLabels: Record<WorkspacePane, string> = {
  spaces: "Espaços",
  channels: "Canais",
  content: "Conversa",
  members: "Membros",
};

const paneIcons: Record<WorkspacePane, string> = {
  spaces: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  channels: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16"/></svg>',
  content: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></svg>',
  members: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function activeWorkspaceShell() {
  const mode = document.querySelector<HTMLElement>(".collaboration-server-mode");
  if (!mode || mode.classList.contains("communication-home-active")) return null;
  return mode.querySelector<HTMLElement>(":scope > .collaboration-shell");
}

function setWorkspacePane(shell: HTMLElement, pane: WorkspacePane) {
  if (pane === "members" && !shell.querySelector(".channel-members")) {
    const membersButton = shell.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Mostrar membros"]');
    membersButton?.click();
  }

  shell.dataset.mobilePane = pane;
  document.querySelectorAll<HTMLButtonElement>(`#${WORKSPACE_NAV_ID} button`).forEach((button) => {
    const active = button.dataset.pane === pane;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function ensureWorkspaceNav() {
  let nav = document.getElementById(WORKSPACE_NAV_ID) as HTMLElement | null;
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = WORKSPACE_NAV_ID;
    nav.className = "mobile-workspace-switcher";
    nav.setAttribute("aria-label", "Navegação da Central de trabalho");

    (Object.keys(paneLabels) as WorkspacePane[]).forEach((pane) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.pane = pane;
      button.innerHTML = `${paneIcons[pane]}<span>${paneLabels[pane]}</span>`;
      button.addEventListener("click", () => {
        const shell = activeWorkspaceShell();
        if (shell) setWorkspacePane(shell, pane);
      });
      nav?.appendChild(button);
    });

    document.body.appendChild(nav);
  }
  return nav;
}

function ensureDirectBackButton(hub: HTMLElement) {
  const header = hub.querySelector<HTMLElement>(".dm-conversation-header");
  if (!header || header.querySelector(".dm-mobile-back")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dm-mobile-back";
  button.setAttribute("aria-label", "Voltar para as conversas");
  button.title = "Voltar";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  button.addEventListener("click", () => {
    hub.querySelector<HTMLButtonElement>(".dm-home-mark")?.click();
  });
  header.prepend(button);
}

function syncMobileWorkspace() {
  const mobile = isMobile();
  document.documentElement.classList.toggle("labstar-mobile", mobile);

  const nav = ensureWorkspaceNav();
  const shell = activeWorkspaceShell();
  const directHub = document.querySelector<HTMLElement>(".workspace.collaboration-workspace .direct-hub");
  const communicationHome = document.querySelector<HTMLElement>(".communication-home-overlay");

  document.body.classList.toggle("mobile-workspace-active", Boolean(mobile && shell));
  document.body.classList.toggle("mobile-direct-active", Boolean(mobile && directHub));
  document.body.classList.toggle("mobile-communication-home-active", Boolean(mobile && communicationHome));

  nav.hidden = !mobile || !shell;

  if (mobile && shell) {
    const pane = (shell.dataset.mobilePane as WorkspacePane | undefined) ?? "content";
    setWorkspacePane(shell, pane);
  }

  if (mobile && directHub?.classList.contains("conversation-open")) {
    ensureDirectBackButton(directHub);
  }
}

function handleWorkspaceClick(event: Event) {
  if (!isMobile()) return;
  const target = event.target as HTMLElement;
  const shell = target.closest<HTMLElement>(".collaboration-shell");
  if (!shell) return;

  if (target.closest(".space-list button")) {
    window.setTimeout(() => setWorkspacePane(shell, "channels"), 0);
    return;
  }

  if (target.closest(".channel-list > button")) {
    window.setTimeout(() => setWorkspacePane(shell, "content"), 0);
  }
}

function startMobileWorkspaceV2() {
  let timer: number | null = null;
  const scheduleSync = () => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      syncMobileWorkspace();
    }, 0);
  };
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  document.addEventListener("click", handleWorkspaceClick, true);
  window.addEventListener("resize", scheduleSync);
  window.visualViewport?.addEventListener("resize", scheduleSync);
  window.addEventListener("pageshow", scheduleSync);
  syncMobileWorkspace();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startMobileWorkspaceV2, { once: true });
} else {
  startMobileWorkspaceV2();
}
