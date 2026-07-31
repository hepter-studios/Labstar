import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { resolvePresence, subscribePresence } from "../lib/presence";

type AvatarProps = {
  name: string;
  url?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  status?: "online" | "busy" | "offline";
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "LS";
}

export function Avatar({ name, url, size = "md", className = "", status }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [, setPresenceRevision] = useState(0);
  const effectiveStatus = resolvePresence(name, status);

  useEffect(() => setImageFailed(false), [url]);
  useEffect(() => subscribePresence(() => setPresenceRevision((value) => value + 1)), []);

  return (
    <span className={`user-avatar user-avatar-${size} ${className}`} aria-label={`Foto de ${name}`}>
      <span className="avatar-media" aria-hidden="true">
        {url && !imageFailed
          ? <img src={url} alt="" onError={() => setImageFailed(true)} />
          : name
            ? <b>{initials(name)}</b>
            : <UserRound size={16} />}
      </span>
      {effectiveStatus && (
        <i
          className={`avatar-status ${effectiveStatus}`}
          aria-label={effectiveStatus === "online" ? "Disponível" : effectiveStatus === "busy" ? "Ocupado" : "Offline"}
        />
      )}
    </span>
  );
}
