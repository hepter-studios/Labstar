import { useEffect, useState } from "react";
import type { Member } from "../lib/supabase";
import { DirectMessagesHub } from "./DirectMessagesHubV3";
import { CollaborationHub as LegacyCollaborationHub } from "./LegacyCollaborationHub";

type CollaborationHubProps = {
  member: Member;
  initialChannelId?: string | null;
  soundEnabled?: boolean;
};

type WorkSurface = "workspace" | "direct";

export function CollaborationHub({ member, initialChannelId, soundEnabled = true }: CollaborationHubProps) {
  const [surface, setSurface] = useState<WorkSurface>("workspace");
  const [workspaceChannelId, setWorkspaceChannelId] = useState<string | null>(initialChannelId ?? null);

  useEffect(() => {
    if (!initialChannelId) return;
    setWorkspaceChannelId(initialChannelId);
    setSurface("workspace");
  }, [initialChannelId]);

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