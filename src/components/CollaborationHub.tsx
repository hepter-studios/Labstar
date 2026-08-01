import { useEffect, useState } from "react";
import type { Member } from "../lib/supabase";
import { DirectMessagesHub } from "./DirectMessagesHubV5";
import { CollaborationHub as LegacyCollaborationHub } from "./LegacyCollaborationHub";

type CollaborationHubProps = {
  member: Member;
  initialChannelId?: string | null;
  soundEnabled?: boolean;
};

type WorkSurface = "workspace" | "direct";
type OpenChannelDetail = { channelId?: string; query?: string };
type OpenDirectDetail = { query?: string };

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function CollaborationHub({ member, initialChannelId, soundEnabled = true }: CollaborationHubProps) {
  const [surface, setSurface] = useState<WorkSurface>("workspace");
  const [workspaceChannelId, setWorkspaceChannelId] = useState<string | null>(initialChannelId ?? null);

  useEffect(() => {
    if (!initialChannelId) return;
    setWorkspaceChannelId(initialChannelId);
    setSurface("workspace");
  }, [initialChannelId]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "k") return;
      event.preventDefault();
      const selector = surface === "direct" ? ".dm-search input" : ".channel-search input";
      document.querySelector<HTMLInputElement>(selector)?.focus();
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [surface]);

  useEffect(() => {
    const openChannel = (event: Event) => {
      const detail = (event as CustomEvent<OpenChannelDetail>).detail ?? {};
      if (detail.channelId) setWorkspaceChannelId(detail.channelId);
      setSurface("workspace");
      if (!detail.query) return;
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(".message-toolbar input");
        if (input) {
          setNativeInputValue(input, detail.query ?? "");
          input.focus();
        }
      }, 180);
    };

    const openDirect = (event: Event) => {
      const detail = (event as CustomEvent<OpenDirectDetail>).detail ?? {};
      setSurface("direct");
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(".dm-search input");
        if (input && detail.query) setNativeInputValue(input, detail.query);
        input?.focus();
      }, 160);
    };

    const openDashboard = () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="Visão geral"]')?.click();
    };

    window.addEventListener("labstar:open-channel", openChannel);
    window.addEventListener("labstar:open-direct", openDirect);
    window.addEventListener("labstar:open-work-home", openDashboard);
    return () => {
      window.removeEventListener("labstar:open-channel", openChannel);
      window.removeEventListener("labstar:open-direct", openDirect);
      window.removeEventListener("labstar:open-work-home", openDashboard);
    };
  }, []);

  if (surface === "direct") {
    return (
      <DirectMessagesHub
        member={member}
        onOpenWorkspace={(channelId) => {
          setWorkspaceChannelId(channelId ?? null);
          setSurface("workspace");
        }}
      />
    );
  }

  return (
    <div className="collaboration-server-mode">
      <button
        type="button"
        className="workspace-dm-entry"
        onClick={() => setSurface("direct")}
        title="Mensagens diretas"
        aria-label="Abrir mensagens diretas"
      >
        <img className="labstar-dm-logo" src="/labstar-dm.svg" alt="" aria-hidden="true" />
        <i />
      </button>
      <LegacyCollaborationHub
        member={member}
        initialChannelId={workspaceChannelId}
        soundEnabled={soundEnabled}
      />
    </div>
  );
}
