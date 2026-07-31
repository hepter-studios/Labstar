export type PresenceStatus = "online" | "busy" | "offline";

type PresenceEntry = {
  id: string;
  name: string;
  status: PresenceStatus;
  lastSeenAt: string;
};

type PresenceSnapshot = {
  initialized: boolean;
  entries: PresenceEntry[];
};

const listeners = new Set<() => void>();
let snapshot: PresenceSnapshot = { initialized: false, entries: [] };

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function getPresenceSnapshot() {
  return snapshot;
}

export function publishPresence(entries: PresenceEntry[]) {
  snapshot = { initialized: true, entries };
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent("labstar:presence-changed", { detail: snapshot }));
}

export function clearPresence() {
  snapshot = { initialized: false, entries: [] };
  listeners.forEach((listener) => listener());
}

export function subscribePresence(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resolvePresence(name: string, requested?: PresenceStatus): PresenceStatus | undefined {
  if (!requested) return undefined;
  if (requested === "busy" || requested === "offline") return requested;
  if (!snapshot.initialized) return requested;

  const normalized = normalizeName(name);
  const matches = snapshot.entries.filter((entry) => normalizeName(entry.name) === normalized);
  if (!matches.length) return "offline";
  if (matches.some((entry) => entry.status === "online")) return "online";
  if (matches.some((entry) => entry.status === "busy")) return "busy";
  return "offline";
}
