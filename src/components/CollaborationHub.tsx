import { House } from "lucide-react";
import { useEffect, useState } from "react";
import type { Member } from "../lib/supabase";
import { CommunicationHome } from "./CommunicationHome";
import { DirectMessagesHub } from "./DirectMessagesHubV5";
import { CollaborationHub as LegacyCollaborationHub } from "./LegacyCollaborationHub";

type CollaborationHubProps = {
  member: Member;
  initialChannelId?: string | null;
  soundEnabled?: boolean;
};

type WorkSurface = "home" | "workspace" | "direct";
type OpenChannelDetail = { channelId?: string; query?: string };
type OpenDirectDetail = { query?: string };

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function CollaborationHub({ member, initialChannelId, soundEnabled = true }: CollaborationHubProps) {
  const [surface, setSurface] = useState<WorkSurface>(initialChannelId ? "workspace" : "home");
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
      const selector = surface === "direct"
        ? ".dm-search input"
        : surface === "workspace"
          ? ".channel-search input"
          : ".global-search input";
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

    const openHome = () => setSurface("home");

    window.addEventListener("labstar:open-channel", openChannel);
    window.addEventListener("labstar:open-direct", openDirect);
    window.addEventListener("labstar:open-work-home", openHome);
    return () => {
      window.removeEventListener("labstar:open-channel", openChannel);
      window.removeEventListener("labstar:open-direct", openDirect);
      window.removeEventListener("labstar:open-work-home", openHome);
    };
  }, []);

  if (surface === "direct") {
    return (
      <DirectMessagesHub
        member={member}
        onOpenWorkspace={(channelId) => {
          setWorkspaceChannelId(channelId ?? null);
          setSurface(channelId ? "workspace" : "home");
        }}
      />
    );
  }

  const openWorkspaceChannel = (channelId: string) => {
    setWorkspaceChannelId(channelId);
    setSurface("workspace");
  };

  return (
    <div
      className={`collaboration-server-mode ${surface === "home" ? "communication-home-active" : ""}`}
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".space-list button, .add-space")) setSurface("workspace");
      }}
    >
      <button
        type="button"
        className={`workspace-home-entry ${surface === "home" ? "active" : ""}`}
        onClick={() => setSurface("home")}
        title="Home da Central de trabalho"
        aria-label="Abrir Home da Central de trabalho"
      >
        <House size={21} />
        <i />
      </button>
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
      {surface === "home" && (
        <div className="communication-home-overlay">
          <CommunicationHome
            member={member}
            onOpenChannel={openWorkspaceChannel}
            onOpenDirect={() => setSurface("direct")}
          />
        </div>
      )}
    </div>
  );
}
