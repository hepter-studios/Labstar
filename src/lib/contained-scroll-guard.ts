type LabstarScrollWindow = Window & {
  __LABSTAR_CONTAINED_SCROLL_GUARD__?: boolean;
};

const guardedWindow = window as LabstarScrollWindow;

if (!guardedWindow.__LABSTAR_CONTAINED_SCROLL_GUARD__) {
  guardedWindow.__LABSTAR_CONTAINED_SCROLL_GUARD__ = true;

  const originalScrollIntoView = Element.prototype.scrollIntoView;

  Element.prototype.scrollIntoView = function containedScrollIntoView(
    options?: boolean | ScrollIntoViewOptions,
  ) {
    const element = this as HTMLElement;
    const messageScroller = element.closest<HTMLElement>(
      ".dm-message-scroll, .message-scroll",
    );

    // Os chats usam um elemento vazio no final da lista para ir até a mensagem
    // mais recente. scrollIntoView nesse elemento também rolava ancestrais e a
    // viewport inteira, deslocando a tela do Labstar para cima. Limitamos essa
    // ação somente ao contêiner interno de mensagens.
    if (messageScroller && messageScroller.lastElementChild === element) {
      const behavior =
        typeof options === "object" && options?.behavior
          ? options.behavior
          : "auto";

      window.requestAnimationFrame(() => {
        messageScroller.scrollTo({
          top: messageScroller.scrollHeight,
          behavior,
        });
      });
      return;
    }

    originalScrollIntoView.call(this, options as ScrollIntoViewOptions);
  };
}
