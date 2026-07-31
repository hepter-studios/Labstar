import { Bell, BellRing, CheckCheck, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  subscribeToAppSettings,
  type AppSettings,
} from "../lib/app-settings";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToTable,
  unsubscribe,
  type LabstarNotification,
  type Member,
} from "../lib/supabase";

function playNotificationTone() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.028, context.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .28);
    gain.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + .12);
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + .3);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // O alerta visual continua funcionando caso áudio seja bloqueado pelo sistema.
  }
}

export function NotificationsButton({ member, onOpenChannel }: { member: Member; onOpenChannel: (channelId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<LabstarNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void loadAppSettings().then((settings) => {
      if (!cancelled) settingsRef.current = settings;
    });
    const unsubscribeSettings = subscribeToAppSettings((settings) => {
      settingsRef.current = settings;
    });
    return () => {
      cancelled = true;
      unsubscribeSettings();
    };
  }, []);

  function mayNotify(item: LabstarNotification) {
    const settings = settingsRef.current;
    if (!settings.desktopNotifications || !("Notification" in window) || Notification.permission !== "granted") return false;
    if (document.visibilityState === "visible") return false;
    const isMention = /menç|mencion|@/i.test(`${item.title} ${item.body}`);
    return !isMention || settings.mentionNotifications;
  }

  function showDeviceNotification(item: LabstarNotification) {
    if (!mayNotify(item)) return;
    try {
      const notification = new Notification(item.title || "Labstar", {
        body: item.body,
        tag: `labstar-${item.id}`,
        silent: !settingsRef.current.messageSounds,
      });
      notification.onclick = () => {
        window.focus();
        if (item.channelId) onOpenChannel(item.channelId);
        notification.close();
      };
    } catch {
      // A notificação interna continua disponível mesmo se o SO recusar a nativa.
    }
  }

  async function refresh(notifyNew = false) {
    try {
      const data = await listNotifications(member.id);
      if (notifyNew) {
        const newItems = data.filter((item) => !item.isRead && !knownIds.current.has(item.id));
        if (newItems.length && settingsRef.current.messageSounds) playNotificationTone();
        for (const item of newItems) showDeviceNotification(item);
      }
      knownIds.current = new Set(data.map((item) => item.id));
      setNotifications(data);
      setError("");
    } catch {
      setError("Não foi possível sincronizar as notificações agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (member.id === "preview-member") {
      setLoading(false);
      return;
    }
    void refresh(false);
    const subscription = subscribeToTable("notifications", `recipient_id=eq.${member.id}`, () => void refresh(true));
    return () => unsubscribe(subscription);
  }, [member.id]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const unread = notifications.filter((item) => !item.isRead).length;

  async function markAll() {
    try {
      await markAllNotificationsRead(member.id);
      await refresh(false);
    } catch {
      setError("Não foi possível marcar as notificações como lidas.");
    }
  }

  async function openNotification(notification: LabstarNotification) {
    try {
      if (!notification.isRead) await markNotificationRead(notification.id);
      if (notification.channelId) onOpenChannel(notification.channelId);
      setOpen(false);
      await refresh(false);
    } catch {
      setError("Não foi possível abrir esta notificação.");
    }
  }

  return (
    <div ref={wrapRef} className="notifications-wrap">
      <button className={`icon-button notification-button ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Notificações">
        {unread ? <BellRing size={16} /> : <Bell size={16} />}
        {unread > 0 && <i>{unread > 9 ? "9+" : unread}</i>}
      </button>
      {open && (
        <section className="notifications-panel">
          <header><div><strong>Notificações</strong><small>{unread ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Tudo em dia"}</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Fechar notificações"><X size={15} /></button></header>
          {error && <div className="notifications-error"><span>{error}</span><button type="button" onClick={() => void refresh(false)}>Tentar novamente</button></div>}
          {unread > 0 && <button className="mark-all" type="button" onClick={() => void markAll()}><CheckCheck size={14} /> Marcar tudo como lido</button>}
          <div className="notifications-list">
            {loading ? <span className="notifications-loading"><LoaderCircle className="spin" /> Carregando</span> : notifications.map((notification) => (
              <button key={notification.id} type="button" className={notification.isRead ? "" : "unread"} onClick={() => void openNotification(notification)}>
                <i />
                <span><b>{notification.title}</b><p>{notification.body}</p><time>{new Date(notification.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></span>
              </button>
            ))}
            {!loading && !notifications.length && <div className="notifications-empty"><Bell size={22} /><strong>Nenhuma notificação</strong><span>Avisos, menções e atualizações aparecerão aqui.</span></div>}
          </div>
        </section>
      )}
    </div>
  );
}
