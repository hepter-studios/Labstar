import { Home, MessageSquare, Server } from "lucide-react";
import { useEffect, useState } from "react";
import type { Member } from "../lib/supabase";
import { CommunicationHome } from "./CommunicationHome";
import { DirectMessagesHub } from "./DirectMessagesHubV6";
import { CollaborationHub as LegacyCollaborationHub } from "./LegacyCollaborationHub";

type CollaborationHubProps = {
  member: Member;
  initialChannelId?: string | null;
  soundEnabled?: boolean;
};

type WorkSurface = "home" | "workspace" | "direct";
type OpenChannelDetail = { channelId?: string; query?: string };
type OpenDirectDetail = { query?: string };
type RefreshCollaborationDetail = { channelId?: string };

type StoredCommunicationPosition = {
  surface: WorkSurface;
  workspaceChannelId: string | null;
};

const POSITION_KEY_PREFIX = "labstar-communication-position-v2:";

function storageKey(memberId: string) {
  return `${POSITION_KEY_PREFIX}${memberId}`;
}

function readPosition(memberId: string): StoredCommunicationPosition {
  try {
    const raw = window.sessionStorage.getItem(storageKey(memberId));
    if (!raw) return { surface: "home", workspaceChannelId: null };
    const value = JSON.parse(raw) as Partial<StoredCommunicationPosition>;
    const surface: WorkSurface = value.surface === "workspace" || value.surface === "direct" || value.surface === "home"
      ? value.surface
      : "home";
    return {
      surface,
      workspaceChannelId: typeof value.workspaceChannelId === "string" && value.workspaceChannelId
        ? value.workspaceChannelId
        : null,
    };
  } catch {
    return { surface: "home", workspaceChannelId: null };
  }
}

function savePosition(memberId: string, position: StoredCommunicationPosition) {
  try {
    window.sessionStorage.setItem(storageKey(memberId), JSON.stringify(position));
  } catch {
    // O estado em memória continua funcionando quando o armazenamento é bloqueado.
  }
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function CollaborationHub({ member, initialChannelId, soundEnabled = true }: CollaborationHubProps) {
  const [initialPosition] = useState(() => readPosition(member.id));
  const [surface, setSurface] = useState<WorkSurface>(() => initialChannelId ? "workspace" : initialPosition.surface);
  const [workspaceChannelId, setWorkspaceChannelId] = useState<string | null>(() => initialChannelId ?? initialPosition.workspaceChannelId);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  useEffect(() => {
    savePosition(member.id, { surface, workspaceChannelId });
  }, [member.id, surface, workspaceChannelId]);

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
    const refreshCollaboration = (event: Event) => {
      const detail = (event as CustomEvent<RefreshCollaborationDetail>).detail ?? {};
      if (detail.channelId) setWorkspaceChannelId(detail.channelId);
      setSurface("workspace");
      setWorkspaceVersion((value) => value + 1);
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("labstar:collaboration-refreshed"));
      }, 80);
    };

    window.addEventListener("labstar:open-channel", openChannel);
    window.addEventListener("labstar:open-direct", openDirect);
    window.addEventListener("labstar:open-work-home", openHome);
    window.addEventListener("labstar:refresh-collaboration", refreshCollaboration);
    return () => {
      window.removeEventListener("labstar:open-channel", openChannel);
      window.removeEventListener("labstar:open-direct", openDirect);
      window.removeEventListener("labstar:open-work-home", openHome);
      window.removeEventListener("labstar:refresh-collaboration", refreshCollaboration);
    };
  }, []);

  const openWorkspaceChannel = (channelId: string) => {
    setWorkspaceChannelId(channelId);
    setSurface("workspace");
  };

  return (
    <div className={`collaboration-server-mode ${surface === "home" ? "communication-home-active" : ""} ${surface === "direct" ? "communication-direct-active" : ""} ${surface === "workspace" ? "communication-channels-active" : ""}`}>
      <nav className="workspace-surface-rail" aria-label="Áreas da Central de trabalho">
        <button
          type="button"
          className={`workspace-home-entry ${surface === "home" ? "active" : ""}`}
          onClick={() => setSurface("home")}
          title="Home da Central de trabalho"
          aria-label="Abrir Home da Central de trabalho"
        >
          <Home size={21} />
          <i />
        </button>
        <button
          type="button"
          className={`workspace-dm-entry ${surface === "direct" ? "active" : ""}`}
          onClick={() => setSurface("direct")}
          title="Mensagens diretas"
          aria-label="Abrir mensagens diretas"
        >
          <MessageSquare size={21} />
          <i />
        </button>
        <button
          type="button"
          className={`workspace-channel-entry ${surface === "workspace" ? "active" : ""}`}
          onClick={() => setSurface("workspace")}
          title="Canais e servidores"
          aria-label="Abrir canais e servidores"
        >
          <Server size={21} />
          <i />
        </button>
      </nav>

      <div className="communication-workspace-stage" style={{ display: surface === "direct" ? "none" : "contents" }} aria-hidden={surface === "direct"}>
        <LegacyCollaborationHub
          key={workspaceVersion}
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

      <div className="communication-direct-stage" style={{ display: surface === "direct" ? "contents" : "none" }} aria-hidden={surface !== "direct"}>
        <DirectMessagesHub
          member={member}
          onOpenWorkspace={(channelId) => {
            setWorkspaceChannelId(channelId ?? null);
            setSurface(channelId ? "workspace" : "home");
          }}
        />
      </div>
    </div>
  );
}
