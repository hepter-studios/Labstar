import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

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
  useEffect(() => setImageFailed(false), [url]);
  return (
    <span className={`user-avatar user-avatar-${size} ${className}`} aria-label={`Foto de ${name}`}>
      {url && !imageFailed ? <img src={url} alt="" onError={() => setImageFailed(true)} /> : name ? <b>{initials(name)}</b> : <UserRound size={16} />}
      {status && <i className={`avatar-status ${status}`} aria-label={status === "online" ? "Disponível" : status === "busy" ? "Ocupado" : "Offline"} />}
    </span>
  );
}
