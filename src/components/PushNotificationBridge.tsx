import { useEffect } from "react";
import { syncDeviceNotificationSubscription } from "../lib/push-notifications";
import { supabaseClient } from "../lib/supabase";

type PushOpenData = {
  channelId?: string | null;
  eventType?: string | null;
  entityId?: string | null;
};

function openNotification(data: PushOpenData) {
  window.dispatchEvent(new CustomEvent("labstar:open-notification", { detail: data }));
}

export function PushNotificationBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const receive = (event: MessageEvent<{ type?: string; data?: PushOpenData }>) => {
      if (event.data?.type === "LABSTAR_NOTIFICATION_OPEN") openNotification(event.data.data ?? {});
    };
    navigator.serviceWorker.addEventListener("message", receive);

    const url = new URL(window.location.href);
    if (url.searchParams.get("notification") === "1") {
      const data = {
        channelId: url.searchParams.get("channel"),
        eventType: url.searchParams.get("event"),
        entityId: url.searchParams.get("entity"),
      };
      url.searchParams.delete("notification");
      url.searchParams.delete("channel");
      url.searchParams.delete("event");
      url.searchParams.delete("entity");
      window.history.replaceState({}, "", url);
      window.setTimeout(() => openNotification(data), 250);
    }

    void syncDeviceNotificationSubscription();
    const auth = supabaseClient?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void syncDeviceNotificationSubscription();
    });
    return () => {
      navigator.serviceWorker.removeEventListener("message", receive);
      auth?.data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
