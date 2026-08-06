type LabstarScrollWindow = Window & {
  __LABSTAR_CONTAINED_SCROLL_GUARD__?: boolean;
};

const guardedWindow = window as LabstarScrollWindow;

const MESSAGE_SCROLLER_SELECTOR = ".dm-message-scroll, .message-scroll";
const ALLOWED_SCROLL_SELECTOR = [
  MESSAGE_SCROLLER_SELECTOR,
  ".dm-contact-list",
  ".dm-inbox-list",
  ".dm-profile-panel",
  ".channel-scroll",
  ".space-list",
  ".dm-space-rail",
].join(", ");
const LOCKED_SCROLL_SELECTOR = [
  "html",
  "body",
  "#root",
  ".app",
  ".workspace",
  ".workspace.collaboration-workspace",
  ".direct-hub",
  ".dm-conversation",
  ".collaboration-server-mode",
  ".collaboration-shell",
  ".channel-content",
  ".message-room",
].join(", ");

function chatSurfaceIsMounted() {
  return Boolean(document.querySelector(
    ".workspace.collaboration-workspace > .direct-hub, .workspace.collaboration-workspace > .collaboration-server-mode",
  ));
}

function resetOuterChatScroll() {
  if (!chatSurfaceIsMounted()) return;

  const scrollingElement = document.scrollingElement as HTMLElement | null;
  if (scrollingElement?.scrollTop) scrollingElement.scrollTop = 0;
  if (scrollingElement?.scrollLeft) scrollingElement.scrollLeft = 0;

  document.querySelectorAll<HTMLElement>(LOCKED_SCROLL_SELECTOR).forEach((element) => {
    if (element.matches(ALLOWED_SCROLL_SELECTOR)) return;
    if (element.scrollTop) element.scrollTop = 0;
    if (element.scrollLeft) element.scrollLeft = 0;
  });
}

if (!guardedWindow.__LABSTAR_CONTAINED_SCROLL_GUARD__) {
  guardedWindow.__LABSTAR_CONTAINED_SCROLL_GUARD__ = true;

  const originalScrollIntoView = Element.prototype.scrollIntoView;
  let resetFrame = 0;

  const scheduleOuterReset = () => {
    if (resetFrame) return;
    resetFrame = window.requestAnimationFrame(() => {
      resetFrame = 0;
      resetOuterChatScroll();
    });
  };

  // Desativa a ancoragem automática nos contêineres externos. Essa ancoragem
  // podia deslocar a workspace quando mensagens eram inseridas ou a conversa
  // era trocada, mesmo com overflow hidden.
  const style = document.createElement("style");
  style.id = "labstar-contained-scroll-style";
  style.textContent = `
    ${LOCKED_SCROLL_SELECTOR} {
      overflow-anchor: none !important;
      scroll-behavior: auto !important;
    }
    ${MESSAGE_SCROLLER_SELECTOR} {
      overflow-anchor: auto;
      overscroll-behavior: contain;
    }
  `;
  document.head.appendChild(style);

  Element.prototype.scrollIntoView = function containedScrollIntoView(
    options?: boolean | ScrollIntoViewOptions,
  ) {
    const element = this as HTMLElement;
    const messageScroller = element.closest<HTMLElement>(MESSAGE_SCROLLER_SELECTOR);

    // Tanto o chat dos servidores quanto o privado chamam scrollIntoView no
    // marcador final da lista. O navegador pode rolar todos os ancestrais para
    // tornar esse marcador visível. Aqui qualquer chamada originada dentro da
    // lista fica limitada ao único contêiner que realmente deve se mover.
    if (messageScroller) {
      const behavior =
        typeof options === "object" && options?.behavior
          ? options.behavior
          : "auto";

      window.requestAnimationFrame(() => {
        const isLastElement = messageScroller.lastElementChild === element;
        if (isLastElement) {
          messageScroller.scrollTo({
            top: messageScroller.scrollHeight,
            behavior,
          });
        } else {
          const scrollerRect = messageScroller.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const centeredTop = messageScroller.scrollTop
            + elementRect.top
            - scrollerRect.top
            - Math.max(0, (messageScroller.clientHeight - elementRect.height) / 2);
          messageScroller.scrollTo({ top: centeredTop, behavior });
        }
        scheduleOuterReset();
      });
      return;
    }

    originalScrollIntoView.call(this, options as ScrollIntoViewOptions);
  };

  const startGuard = () => {
    document.addEventListener("scroll", (event) => {
      if (!chatSurfaceIsMounted()) return;
      const target = event.target;
      if (target instanceof Element && target.closest(ALLOWED_SCROLL_SELECTOR)) return;
      scheduleOuterReset();
    }, true);

    const observer = new MutationObserver(() => {
      if (!chatSurfaceIsMounted()) return;
      scheduleOuterReset();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", scheduleOuterReset, { passive: true });
    window.addEventListener("orientationchange", scheduleOuterReset, { passive: true });
    scheduleOuterReset();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startGuard, { once: true });
  } else {
    startGuard();
  }
}
