import { useEffect, useMemo, useRef, useState } from "react";
import {
  listMembers,
  loadCollaboration,
  type ChannelCategory,
  type CollaborationSpace,
  type LabstarChannel,
  type Member,
} from "../lib/supabase";
import { getCurrentAccessIdentity } from "../lib/access";
import { WorkspaceSettingsCenter } from "./WorkspaceSettingsCenter";

type Snapshot = {
  spaces: CollaborationSpace[];
  categories: ChannelCategory[];
  channels: LabstarChannel[];
  members: Member[];
  currentMember: Member;
};

export function WorkspaceSettingsPortal() {
  const [open, setOpen] = useState(false);
  const [selectedSpaceName, setSelectedSpaceName] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const legacyBypass = useRef(false);

  useEffect(() => {
    const capture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('button[aria-label="Configurar espaço"]');
      if (!button || legacyBypass.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const name = document.querySelector<HTMLElement>(".space-title strong")?.textContent?.trim() ?? "";
      setSelectedSpaceName(name);
      setOpen(true);
    };
    document.addEventListener("click", capture, true);
    return () => document.removeEventListener("click", capture, true);
  }, []);

  async function loadSnapshot() {
    const [collaboration, team, identity] = await Promise.all([
      loadCollaboration(),
      listMembers(),
      getCurrentAccessIdentity(),
    ]);
    if (!identity?.member) throw new Error("member_not_authorized");
    setSnapshot({
      spaces: collaboration.spaces,
      categories: collaboration.categories,
      channels: collaboration.channels,
      members: team.members,
      currentMember: identity.member,
    });
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [collaboration, team, identity] = await Promise.all([
          loadCollaboration(),
          listMembers(),
          getCurrentAccessIdentity(),
        ]);
        if (cancelled || !identity?.member) return;
        setSnapshot({
          spaces: collaboration.spaces,
          categories: collaboration.categories,
          channels: collaboration.channels,
          members: team.members,
          currentMember: identity.member,
        });
      } catch {
        // RuntimeReliability mostra falhas inesperadas sem derrubar a Central.
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const space = useMemo(() => {
    if (!snapshot) return null;
    const normalized = selectedSpaceName.trim().toLocaleLowerCase();
    return snapshot.spaces.find((item) => item.name.trim().toLocaleLowerCase() === normalized)
      ?? snapshot.spaces[0]
      ?? null;
  }, [snapshot, selectedSpaceName]);

  if (!open || !snapshot || !space) return null;
  const categories = snapshot.categories.filter((category) => category.spaceId === space.id);
  const channels = snapshot.channels.filter((channel) => channel.spaceId === space.id);

  function openLegacyIdentity() {
    setOpen(false);
    window.requestAnimationFrame(() => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Configurar espaço"]');
      if (!button) return;
      legacyBypass.current = true;
      button.click();
      window.setTimeout(() => { legacyBypass.current = false; }, 0);
    });
  }

  function openCategoryCreator() {
    setOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".new-category")?.click());
  }

  function openChannelCreator(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setOpen(false);
    window.requestAnimationFrame(() => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>(".channel-category"));
      const section = sections.find((item) => item.querySelector("header span")?.textContent?.trim() === category.name);
      section?.querySelector<HTMLButtonElement>('header button[aria-label^="Criar canal"]')?.click();
    });
  }

  function selectChannel(channelId: string) {
    const channel = channels.find((item) => item.id === channelId);
    if (!channel) return;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".channel-list button"));
    buttons.find((button) => button.querySelector("span")?.textContent?.trim() === channel.name)?.click();
  }

  function openIntegrations() {
    setOpen(false);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.channel-head-actions button[title="Integrações e automações"]')?.click();
    });
  }

  function openTeam() {
    document.querySelector<HTMLButtonElement>('button[aria-label="Equipe"]')?.click();
  }

  return (
    <WorkspaceSettingsCenter
      space={space}
      categories={categories}
      channels={channels}
      members={snapshot.members}
      currentMember={snapshot.currentMember}
      onClose={() => setOpen(false)}
      onEditIdentity={openLegacyIdentity}
      onCreateCategory={openCategoryCreator}
      onCreateChannel={openChannelCreator}
      onSelectChannel={selectChannel}
      onOpenIntegrations={openIntegrations}
      onOpenTeam={openTeam}
      onPermissionsSaved={loadSnapshot}
    />
  );
}
