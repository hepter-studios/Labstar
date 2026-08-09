import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import { buildPushHTTPRequest } from "npm:@pushforge/builder@2.0.5";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-labstar-push-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET") {
    const publicKey = Deno.env.get("LABSTAR_VAPID_PUBLIC_KEY") ?? "";
    return publicKey ? json({ publicKey }) : json({ error: "push_not_configured" }, 503);
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("LABSTAR_PUSH_WEBHOOK_SECRET") ?? "";
  if (!safeEqual(request.headers.get("x-labstar-push-secret") ?? "", expectedSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { notification_id: notificationId } = await request.json().catch(() => ({})) as { notification_id?: string };
  if (!notificationId) return json({ error: "notification_id_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("id, recipient_id, title, body, channel_id, event_type, entity_id")
    .eq("id", notificationId)
    .maybeSingle();
  if (notificationError) return json({ error: "notification_lookup_failed" }, 500);
  if (!notification) return json({ delivered: 0, reason: "notification_not_found" });

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("member_id", notification.recipient_id)
    .eq("enabled", true);
  if (subscriptionError) return json({ error: "subscriptions_lookup_failed" }, 500);
  if (!subscriptions?.length) return json({ delivered: 0, reason: "no_active_devices" });

  const privateJWK = JSON.parse(Deno.env.get("LABSTAR_VAPID_PRIVATE_JWK") ?? "{}");
  const eventType = String(notification.event_type ?? "notification");
  const call = eventType.includes("call");
  const tag = `labstar-${eventType}-${notification.entity_id ?? notification.id}`.slice(0, 120);
  const payload = {
    title: notification.title || "★ Labstar",
    body: notification.body || "Você recebeu uma nova atualização.",
    icon: "https://labstar.pages.dev/pwa-192.png",
    badge: "https://labstar.pages.dev/favicon-180.png",
    tag,
    requireInteraction: call,
    data: {
      notificationId: notification.id,
      channelId: notification.channel_id,
      eventType,
      entityId: notification.entity_id,
    },
  };

  let delivered = 0;
  let expired = 0;
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    const push = await buildPushHTTPRequest({
      privateJWK,
      subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      message: {
        payload,
        adminContact: "mailto:contato@labstar.com.br",
        options: { ttl: call ? 90 : 86400, urgency: call ? "high" : "normal", topic: tag.slice(0, 32) },
      },
    });
    const response = await fetch(push.endpoint, { method: "POST", headers: push.headers, body: push.body });
    if (response.ok || response.status === 201) { delivered += 1; return; }
    if (response.status === 404 || response.status === 410) {
      expired += 1;
      await supabase.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", subscription.id);
      return;
    }
    throw new Error(`push_provider_${response.status}`);
  }));

  return json({ delivered, expired, attempted: subscriptions.length });
});
