const LABSTAR_ICON = "/pwa-192.png";
const LABSTAR_BADGE = "/favicon-180.png";

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let message = {};
    try { message = event.data?.json() ?? {}; } catch { message = { body: event.data?.text() ?? "Nova atualização" }; }

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = windows.some((client) => client.visibilityState === "visible");
    if (visible) {
      windows.forEach((client) => client.postMessage({ type: "LABSTAR_PUSH_RECEIVED", data: message.data ?? {} }));
      return;
    }

    const data = message.data ?? {};
    const call = String(data.eventType ?? "").includes("call");
    await self.registration.showNotification(message.title || "★ Labstar", {
      body: message.body || "Você recebeu uma nova atualização.",
      icon: message.icon || LABSTAR_ICON,
      badge: message.badge || LABSTAR_BADGE,
      tag: message.tag || `labstar-${data.notificationId || Date.now()}`,
      data,
      requireInteraction: Boolean(message.requireInteraction || call),
      silent: false,
      vibrate: call ? [500, 180, 500, 700, 500] : [180, 80, 180],
      actions: call
        ? [{ action: "open", title: "Abrir chamada" }, { action: "dismiss", title: "Agora não" }]
        : [{ action: "open", title: "Abrir Labstar" }],
    });
    if (self.registration.setAppBadge) await self.registration.setAppBadge().catch(() => undefined);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  event.waitUntil((async () => {
    if (self.registration.clearAppBadge) await self.registration.clearAppBadge().catch(() => undefined);
    const data = event.notification.data ?? {};
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows[0];
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: "LABSTAR_NOTIFICATION_OPEN", data });
      return;
    }
    const url = new URL("/", self.location.origin);
    url.searchParams.set("notification", "1");
    if (data.channelId) url.searchParams.set("channel", data.channelId);
    if (data.eventType) url.searchParams.set("event", data.eventType);
    if (data.entityId) url.searchParams.set("entity", data.entityId);
    await self.clients.openWindow(url.toString());
  })());
});
