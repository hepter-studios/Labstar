import { useEffect, useRef } from "react";
import { getCurrentAccessIdentity } from "../lib/access";
import { listMembers, supabaseClient } from "../lib/supabase";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function ensureChatHint(composer: HTMLElement) {
  let hint = composer.querySelector<HTMLElement>(":scope > .programmer-chat-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.className = "programmer-chat-hint";
    hint.innerHTML = "<span>Anexos: até 8 arquivos · 20 MB cada</span><span>Shift+Enter quebra linha · cole imagens direto no campo</span>";
    composer.appendChild(hint);
  }
  return hint;
}

function setChatNotice(composer: HTMLElement, text: string, error = false) {
  const hint = ensureChatHint(composer);
  hint.classList.toggle("error", error);
  const first = hint.querySelector("span");
  if (first) first.textContent = text;
}

export function FinalProductPolishBridge() {
  const onlineIds = useRef(new Set<string>());
  const memberIdsByName = useRef(new Map<string, string>());
  const currentMemberId = useRef("");

  useEffect(() => {
    if (!supabaseClient) return;

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session) return;
      window.setTimeout(() => {
        const legacyGate = document.querySelector("main.access-screen:not(.access-v2-screen)");
        if (legacyGate) window.location.replace("/");
      }, 80);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let disposed = false;
    let presenceChannel: ReturnType<NonNullable<typeof supabaseClient>["channel"]> | null = null;

    const applyPresence = () => {
      const selfId = currentMemberId.current;
      const online = onlineIds.current;

      document.querySelectorAll<HTMLElement>(".channel-user .avatar-status, .profile-card .avatar-status").forEach((node) => {
        node.hidden = true;
      });
      document.querySelectorAll<HTMLElement>(".channel-user .online-label").forEach((node) => {
        node.hidden = true;
      });

      const rows = Array.from(document.querySelectorAll<HTMLElement>(".channel-member-row"));
      for (const row of rows) {
        const name = normalize(row.querySelector("b")?.textContent ?? "");
        const id = memberIdsByName.current.get(name) ?? "";
        const status = row.querySelector<HTMLElement>(".avatar-status");
        if (!status || !id) continue;
        if (id === selfId) {
          status.hidden = true;
          row.dataset.presence = "self";
          continue;
        }
        status.hidden = false;
        const isOnline = online.has(id);
        status.classList.toggle("online", isOnline);
        status.classList.toggle("offline", !isOnline);
        status.setAttribute("aria-label", isOnline ? "Online agora" : "Offline");
        row.dataset.presence = isOnline ? "online" : "offline";
      }

      const label = document.querySelector<HTMLElement>(".channel-members .member-group-label");
      if (label) {
        const otherOnline = [...online].filter((id) => id !== selfId).length;
        label.textContent = `MEMBROS — ${rows.length} · ${otherOnline} online`;
      }
    };

    const setup = async () => {
      if (!supabaseClient) return;
      const [identity, team] = await Promise.all([getCurrentAccessIdentity(), listMembers()]);
      if (disposed || !identity?.member) return;
      currentMemberId.current = identity.member.id;
      memberIdsByName.current = new Map(team.members.map((member) => [normalize(member.name), member.id]));

      presenceChannel = supabaseClient.channel("labstar-global-presence", {
        config: { presence: { key: identity.member.id } },
      });
      presenceChannel.on("presence", { event: "sync" }, () => {
        const state = presenceChannel?.presenceState() ?? {};
        onlineIds.current = new Set(Object.keys(state));
        applyPresence();
      });
      presenceChannel.subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await presenceChannel?.track({
          memberId: identity.member.id,
          name: identity.member.name,
          onlineAt: new Date().toISOString(),
        });
      });
      applyPresence();
    };

    void setup().catch(() => undefined);
    const observer = new MutationObserver(() => applyPresence());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", applyPresence);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("focus", applyPresence);
      if (presenceChannel && supabaseClient) void supabaseClient.removeChannel(presenceChannel);
    };
  }, []);

  useEffect(() => {
    const syncLegacyGate = () => {
      const modern = document.querySelector(".access-v2-screen");
      document.querySelectorAll<HTMLElement>("main.access-screen:not(.access-v2-screen)").forEach((legacy) => {
        legacy.style.display = modern ? "none" : "";
      });
    };
    syncLegacyGate();
    const observer = new MutationObserver(syncLegacyGate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".message-composer").forEach((composer) => ensureChatHint(composer));
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    const onChange = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.closest(".message-composer")) return;
      const composer = input.closest<HTMLElement>(".message-composer");
      if (!composer) return;
      const files = Array.from(input.files ?? []);
      const tooLarge = files.find((file) => file.size > MAX_FILE_BYTES);
      if (tooLarge) {
        event.stopImmediatePropagation();
        input.value = "";
        setChatNotice(composer, `${tooLarge.name} excede o limite de 20 MB.`, true);
        return;
      }
      if (files.length > MAX_FILES) {
        event.stopImmediatePropagation();
        input.value = "";
        setChatNotice(composer, `Selecione no máximo ${MAX_FILES} arquivos por mensagem.`, true);
        return;
      }
      setChatNotice(composer, "Anexos: até 8 arquivos · 20 MB cada");
    };

    const onPaste = (event: ClipboardEvent) => {
      const textarea = event.target as HTMLTextAreaElement;
      if (!(textarea instanceof HTMLTextAreaElement) || !textarea.closest(".message-composer")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      const composer = textarea.closest<HTMLElement>(".message-composer");
      const input = composer?.querySelector<HTMLInputElement>('input[type="file"][multiple]');
      if (!composer || !input) return;
      const valid = files.filter((file) => file.size <= MAX_FILE_BYTES).slice(0, MAX_FILES);
      if (!valid.length) {
        setChatNotice(composer, "O arquivo colado excede 20 MB.", true);
        return;
      }
      const transfer = new DataTransfer();
      valid.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      event.preventDefault();
    };

    document.addEventListener("change", onChange, true);
    document.addEventListener("paste", onPaste, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("paste", onPaste, true);
    };
  }, []);

  return null;
}
