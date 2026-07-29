import { Bell, BellRing, CheckCheck, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToTable,
  unsubscribe,
  type LabstarNotification,
  type Member,
} from "../lib/supabase";

export function NotificationsButton({ member, onOpenChannel }: { member: Member; onOpenChannel: (channelId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<LabstarNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      setNotifications(await listNotifications(member.id));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (member.id === "preview-member") {
      setLoading(false);
      return;
    }
    void refresh();
    const subscription = subscribeToTable("notifications", `recipient_id=eq.${member.id}`, () => void refresh());
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

  return (
    <div ref={wrapRef} className="notifications-wrap">
      <button className={`icon-button notification-button ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Notificações">
        {unread ? <BellRing size={16} /> : <Bell size={16} />}
        {unread > 0 && <i>{unread > 9 ? "9+" : unread}</i>}
      </button>
      {open && (
        <section className="notifications-panel">
          <header><div><strong>Notificações</strong><small>{unread ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Tudo em dia"}</small></div><button onClick={() => setOpen(false)}><X size={15} /></button></header>
          {unread > 0 && <button className="mark-all" onClick={async () => { await markAllNotificationsRead(member.id); await refresh(); }}><CheckCheck size={14} /> Marcar tudo como lido</button>}
          <div className="notifications-list">
            {loading ? <span className="notifications-loading"><LoaderCircle className="spin" /> Carregando</span> : notifications.map((notification) => (
              <button key={notification.id} className={notification.isRead ? "" : "unread"} onClick={async () => {
                if (!notification.isRead) await markNotificationRead(notification.id);
                if (notification.channelId) onOpenChannel(notification.channelId);
                setOpen(false);
                await refresh();
              }}>
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
