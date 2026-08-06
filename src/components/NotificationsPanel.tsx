import {
  AtSign,
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  LoaderCircle,
  Megaphone,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type NotificationFilter = "all" | "unread";

type NotificationVisual = {
  Icon: LucideIcon;
  label: string;
  className: string;
};

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

function notificationVisual(item: LabstarNotification): NotificationVisual {
  const text = `${item.title} ${item.body}`.toLocaleLowerCase();
  if (/chamada|voz|vídeo|video/.test(text)) return { Icon: Phone, label: "Chamada", className: "call" };
  if (/reunião|reuniao|agendada|horário|horario/.test(text)) return { Icon: CalendarClock, label: "Agenda", className: "meeting" };
  if (/mencion|respondeu|@/.test(text)) return { Icon: AtSign, label: "Menção", className: "mention" };
  if (/aviso|anúncio|anuncio|regra/.test(text)) return { Icon: Megaphone, label: "Aviso", className: "announcement" };
  if (/acesso|membro|cargo|aprova|suspens/.test(text)) return { Icon: UserPlus, label: "Equipe", className: "member" };
  if (/integração|integracao|renovação|renovacao|github/.test(text)) return { Icon: ShieldCheck, label: "Integração", className: "integration" };
  if (/mensagem|enviou/.test(text)) return { Icon: MessageSquare, label: "Mensagem", className: "message" };
  return { Icon: Bell, label: "Atualização", className: "general" };
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

export function NotificationsButton({ member, onOpenChannel }: { member: Member; onOpenChannel: (channelId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<LabstarNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [devicePermission, setDevicePermission] = useState<NotificationPermission | "unsupported">(
    "Notification" in window ? Notification.permission : "unsupported",
  );
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

  async function refresh(notifyNew = false, manual = false) {
    if (manual) setRefreshing(true);
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
      setRefreshing(false);
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
  const visible = useMemo(
    () => filter === "unread" ? notifications.filter((item) => !item.isRead) : notifications,
    [filter, notifications],
  );
  const todayCount = notifications.filter((item) => isToday(item.createdAt)).length;

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

  async function enableDeviceNotifications() {
    if (!("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setDevicePermission(permission);
      if (permission === "granted") setError("");
    } catch {
      setError("O sistema não permitiu ativar alertas neste dispositivo.");
    }
  }

  return (
    <div ref={wrapRef} className="notifications-wrap">
      <button className={`icon-button notification-button ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Notificações">
        {unread ? <BellRing size={16} /> : <Bell size={16} />}
        {unread > 0 && <i>{unread > 99 ? "99+" : unread}</i>}
      </button>
      {open && (
        <section className="notifications-panel">
          <header>
            <div><strong>Notificações</strong><small>{unread ? `${unread} não lida${unread === 1 ? "" : "s"} · ${todayCount} hoje` : `${todayCount} atualização${todayCount === 1 ? "" : "ões"} hoje`}</small></div>
            <span className="notifications-head-actions">
              <button type="button" className={refreshing ? "spin" : ""} onClick={() => void refresh(false, true)} aria-label="Atualizar notificações"><RefreshCw size={14} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar notificações"><X size={15} /></button>
            </span>
          </header>
          <div className="notification-tabs">
            <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas <i>{notifications.length}</i></button>
            <button type="button" className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>Não lidas <i>{unread}</i></button>
            {unread > 0 && <button className="mark-all" type="button" onClick={() => void markAll()}><CheckCheck size={13} /> Marcar lidas</button>}
          </div>
          {devicePermission === "default" && (
            <button className="notification-permission" type="button" onClick={() => void enableDeviceNotifications()}><BellRing size={14} /><span><b>Ativar alertas do dispositivo</b><small>Receba mensagens, chamadas, reuniões e avisos mesmo fora da janela.</small></span></button>
          )}
          {error && <div className="notifications-error"><span>{error}</span><button type="button" onClick={() => void refresh(false, true)}>Tentar novamente</button></div>}
          <div className="notifications-list">
            {loading ? <span className="notifications-loading"><LoaderCircle className="spin" /> Carregando</span> : visible.map((notification) => {
              const visual = notificationVisual(notification);
              const Icon = visual.Icon;
              return (
                <button key={notification.id} type="button" className={notification.isRead ? "" : "unread"} onClick={() => void openNotification(notification)}>
                  <span className={`notification-kind ${visual.className}`} title={visual.label}><Icon size={14} /></span>
                  <span><b>{notification.title}</b><p>{notification.body}</p><time>{new Date(notification.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></span>
                </button>
              );
            })}
            {!loading && !visible.length && <div className="notifications-empty"><Bell size={22}/><strong>{filter === "unread" ? "Nenhuma pendência" : "Nenhuma notificação"}</strong><span>{filter === "unread" ? "Tudo foi lido. Novos eventos aparecerão em tempo real." : "Mensagens, chamadas, reuniões, acessos e integrações aparecerão aqui."}</span></div>}
          </div>
        </section>
      )}
    </div>
  );
}
