import { isTauriApp } from "./native";

export type CommunicationNotificationPermission = "granted" | "denied" | "default" | "unsupported";

export type CommunicationNotification = {
  title: string;
  body: string;
  tag: string;
  kind: "message" | "audio-call" | "video-call";
  contactName?: string;
  requireInteraction?: boolean;
  critical?: boolean;
};

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let ringtoneTimer = 0;
let ringtoneStopped = true;

function getAudioContext() {
  if (audioContext) return audioContext;
  const Constructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!Constructor) return null;
  audioContext = new Constructor();
  return audioContext;
}

export function armCommunicationAudio() {
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => undefined);
}

function playRingtonePulse() {
  if (ringtoneStopped) return;
  const context = getAudioContext();
  if (!context) return;
  void context.resume().then(() => {
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    gain.connect(context.destination);

    for (const [frequency, offset] of [[740, 0], [920, 0.24]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      oscillator.connect(gain);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.38);
    }
  }).catch(() => undefined);
}

export function startIncomingCallRingtone() {
  stopIncomingCallRingtone();
  ringtoneStopped = false;
  playRingtonePulse();
  ringtoneTimer = window.setInterval(playRingtonePulse, 1900);
  navigator.vibrate?.([350, 180, 350, 800]);
  return stopIncomingCallRingtone;
}

export function stopIncomingCallRingtone() {
  ringtoneStopped = true;
  window.clearInterval(ringtoneTimer);
  ringtoneTimer = 0;
  navigator.vibrate?.(0);
}

export function getCommunicationNotificationPermission(): CommunicationNotificationPermission {
  if (isTauriApp()) return "granted";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestCommunicationNotifications(): Promise<CommunicationNotificationPermission> {
  armCommunicationAudio();
  if (isTauriApp()) {
    await window.__TAURI__?.core.invoke("show_native_notification", {
      title: "Notificações do Labstar ativadas",
      body: "Mensagens e chamadas privadas poderão aparecer no sistema.",
    }).catch(() => undefined);
    return "granted";
  }
  if (!("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function focusCommunication(contactName?: string) {
  if (isTauriApp()) {
    void window.__TAURI__?.core.invoke("focus_main_window").catch(() => undefined);
  } else {
    window.focus();
  }
  window.dispatchEvent(new CustomEvent("labstar:open-direct", {
    detail: contactName ? { query: contactName } : {},
  }));
}

async function showBrowserNotification(notification: CommunicationNotification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  const options: NotificationOptions = {
    body: notification.body,
    tag: notification.tag,
    icon: "/pwa-192.png",
    badge: "/favicon-180.png",
    requireInteraction: Boolean(notification.requireInteraction),
    silent: false,
    data: { contactName: notification.contactName ?? "" },
  };

  try {
    const item = new Notification(notification.title, options);
    item.onclick = () => {
      item.close();
      focusCommunication(notification.contactName);
    };
    return true;
  } catch {
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (!registration) return false;
      await registration.showNotification(notification.title, options);
      return true;
    } catch {
      return false;
    }
  }
}

export async function showCommunicationNotification(notification: CommunicationNotification) {
  window.dispatchEvent(new CustomEvent("labstar:communication-notification", {
    detail: notification,
  }));

  if (isTauriApp()) {
    await Promise.allSettled([
      window.__TAURI__?.core.invoke("show_native_notification", {
        title: notification.title,
        body: notification.body,
      }),
      window.__TAURI__?.core.invoke("request_main_window_attention", {
        critical: Boolean(notification.critical),
      }),
    ]);
    return true;
  }

  return showBrowserNotification(notification);
}
