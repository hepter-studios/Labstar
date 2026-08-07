import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../meeting-room-v2.css";
import "../meeting-room-v2-fixes.css";
import { listMembers, loadCollaboration, type LabstarChannel, type Member } from "../lib/supabase";
import { MeetingRoomV2 } from "./MeetingRoomV2";

type Props = {
  member: Member;
  soundEnabled: boolean;
};

export function MeetingRoomUpgradeBridge({ member, soundEnabled }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [channel, setChannel] = useState<LabstarChannel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const channelsRef = useRef<LabstarChannel[]>([]);
  const spacesRef = useRef<Array<{ id: string; name: string }>>([]);
  const currentChannelIdRef = useRef("");

  useEffect(() => {
    let disposed = false;

    const sync = () => {
      const shell = document.querySelector<HTMLElement>(".collaboration-shell");
      const content = shell?.querySelector<HTMLElement>(":scope > .channel-content") ?? null;
      if (!shell || !content) {
        setTarget(null);
        setChannel(null);
        currentChannelIdRef.current = "";
        return;
      }

      const channelName = content.querySelector<HTMLElement>(".channel-heading strong")?.textContent?.trim() ?? "";
      const spaceName = shell.querySelector<HTMLElement>(".space-title strong")?.textContent?.trim() ?? "";
      const space = spacesRef.current.find((item) => item.name === spaceName);
      const selected = channelsRef.current.find((item) => item.type === "voice" && item.name === channelName && (!space || item.spaceId === space.id)) ?? null;

      let mount = content.querySelector<HTMLElement>(":scope > .meeting-v2-bridge-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "meeting-v2-bridge-mount";
        content.appendChild(mount);
      }

      if (!selected) {
        content.classList.remove("meeting-v2-enhanced");
        if (currentChannelIdRef.current) {
          currentChannelIdRef.current = "";
          setChannel(null);
        }
        setTarget(mount);
        return;
      }

      content.classList.add("meeting-v2-enhanced");
      setTarget(mount);
      if (currentChannelIdRef.current !== selected.id) {
        currentChannelIdRef.current = selected.id;
        setChannel(selected);
      }
    };

    const load = async () => {
      try {
        const [collaboration, team] = await Promise.all([loadCollaboration(), listMembers()]);
        if (disposed) return;
        channelsRef.current = collaboration.channels;
        spacesRef.current = collaboration.spaces.map((space) => ({ id: space.id, name: space.name }));
        setMembers(team.members);
        sync();
      } catch {
        // A sala antiga continua disponível caso os dados ainda não estejam prontos.
      }
    };

    void load();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const changed = () => void load();
    window.addEventListener("labstar:data-changed", changed);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("labstar:data-changed", changed);
      document.querySelectorAll(".channel-content.meeting-v2-enhanced").forEach((node) => node.classList.remove("meeting-v2-enhanced"));
    };
  }, []);

  if (!target || !channel) return null;
  return createPortal(
    <MeetingRoomV2 channel={channel} member={member} members={members} soundEnabled={soundEnabled} />,
    target,
  );
}
