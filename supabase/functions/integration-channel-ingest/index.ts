import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1024 * 1024;

type Provider = "github" | "discord" | "monitoring" | "billing" | "support";

type RuleRow = {
  id: string;
  space_id: string;
  provider: Provider;
  name: string;
  channel_id: string | null;
  events: string[] | null;
  enabled: boolean;
  webhook_token: string;
};

type NormalizedEvent = {
  label: string;
  title: string;
  body: string;
  url: string;
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function nested(payload: Record<string, unknown>, key: string) {
  return recordValue(payload[key]);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function trimText(value: string, limit: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(0, limit - 1))}…`;
}

function providerLabel(provider: Provider) {
  if (provider === "github") return "GitHub";
  if (provider === "discord") return "Discord";
  if (provider === "monitoring") return "Monitoramento";
  if (provider === "billing") return "Assinaturas";
  return "Suporte";
}

function criticalIssue(payload: Record<string, unknown>) {
  const issue = nested(payload, "issue");
  const labels = arrayValue(issue.labels).map((item) => stringValue(recordValue(item).name).toLowerCase());
  return labels.some((label) => /critical|critico|crítico|urgent|urgente|sev[-_ ]?1|severity[: ]?high|alta/.test(label));
}

function normalizeGithub(event: string, payload: Record<string, unknown>): NormalizedEvent | null {
  const repository = nested(payload, "repository");
  const repo = firstText(repository.full_name, repository.name, "repositório");
  const action = firstText(payload.action);

  if (event === "pull_request") {
    const pr = nested(payload, "pull_request");
    const number = String(payload.number ?? "");
    return {
      label: "Pull request",
      title: trimText(`PR ${number ? `#${number} ` : ""}${firstText(pr.title, action, "atualizado")}`, 180),
      body: trimText(`${repo}${action ? ` · ${action}` : ""}${firstText(nested(payload, "sender").login) ? ` · por ${firstText(nested(payload, "sender").login)}` : ""}`, 700),
      url: firstText(pr.html_url, repository.html_url),
    };
  }

  if (event === "issues" && criticalIssue(payload)) {
    const issue = nested(payload, "issue");
    const number = String(payload.number ?? "");
    return {
      label: "Issue crítica",
      title: trimText(`Issue crítica ${number ? `#${number} ` : ""}${firstText(issue.title, "detectada")}`, 180),
      body: trimText(`${repo}${action ? ` · ${action}` : ""}`, 700),
      url: firstText(issue.html_url, repository.html_url),
    };
  }

  if (event === "workflow_run") {
    const run = nested(payload, "workflow_run");
    const conclusion = firstText(run.conclusion).toLowerCase();
    if (!["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(conclusion)) return null;
    return {
      label: "Deploy falhou",
      title: trimText(`Deploy falhou: ${firstText(run.name, run.display_title, "workflow")}`, 180),
      body: trimText(`${repo} · ${conclusion || "falha"}${firstText(run.head_branch) ? ` · ${firstText(run.head_branch)}` : ""}`, 700),
      url: firstText(run.html_url, repository.html_url),
    };
  }

  if (event === "deployment_status") {
    const status = nested(payload, "deployment_status");
    const state = firstText(status.state).toLowerCase();
    if (!["failure", "error", "inactive"].includes(state)) return null;
    return {
      label: "Deploy falhou",
      title: trimText(`Deploy falhou em ${repo}`, 180),
      body: trimText(firstText(status.description, state, "Falha de implantação"), 700),
      url: firstText(status.log_url, status.environment_url, repository.html_url),
    };
  }

  if (event === "release") {
    const release = nested(payload, "release");
    if (action && !["published", "released", "created"].includes(action)) return null;
    return {
      label: "Nova versão",
      title: trimText(`Nova versão: ${firstText(release.name, release.tag_name, "release")}`, 180),
      body: trimText(`${repo}${action ? ` · ${action}` : ""}`, 700),
      url: firstText(release.html_url, repository.html_url),
    };
  }

  if (["repository_vulnerability_alert", "code_scanning_alert", "secret_scanning_alert", "dependabot_alert"].includes(event)) {
    const alert = nested(payload, "alert");
    const rule = nested(alert, "rule");
    return {
      label: "Alerta de segurança",
      title: trimText(`Alerta de segurança: ${firstText(rule.description, rule.name, nested(alert, "security_advisory").summary, event)}`, 180),
      body: trimText(`${repo}${action ? ` · ${action}` : ""}`, 700),
      url: firstText(alert.html_url, repository.html_url),
    };
  }

  return null;
}

function normalizeGeneric(provider: Provider, payload: Record<string, unknown>): NormalizedEvent | null {
  const explicit = firstText(payload.event, payload.eventName, payload.type, payload.kind);
  const title = firstText(payload.title, payload.subject, payload.name, nested(payload, "alert").title, nested(payload, "ticket").title);
  const body = firstText(payload.message, payload.body, payload.summary, payload.description, nested(payload, "alert").message, nested(payload, "ticket").description);
  const url = firstText(payload.url, payload.link, payload.html_url, nested(payload, "ticket").url, nested(payload, "alert").url);

  if (explicit) {
    return {
      label: explicit,
      title: trimText(title || `${providerLabel(provider)} · ${explicit}`, 180),
      body: trimText(body || "Novo evento recebido pela integração.", 700),
      url,
    };
  }

  if (provider === "monitoring") {
    const status = firstText(payload.status, nested(payload, "monitor").status).toLowerCase();
    const label = /up|recovered|resolved|healthy/.test(status) ? "Serviço recuperado" : /ssl|certificate/.test(body.toLowerCase()) ? "SSL vai expirar" : /domain/.test(body.toLowerCase()) ? "Domínio vai expirar" : /down|offline|unreachable/.test(status) ? "Site fora do ar" : "Erro crítico";
    return { label, title: trimText(title || label, 180), body: trimText(body || status || "Evento de monitoramento", 700), url };
  }

  if (provider === "support") {
    const priority = firstText(payload.priority, nested(payload, "ticket").priority).toLowerCase();
    const label = /urgent|high|critical|urgente|alta/.test(priority) ? "Chamado urgente" : "Novo chamado";
    return { label, title: trimText(title || label, 180), body: trimText(body || "Novo chamado recebido.", 700), url };
  }

  if (provider === "billing") {
    const status = firstText(payload.status).toLowerCase();
    const label = /fail|failed|past_due|unpaid|erro/.test(status) ? "Pagamento falhou" : "Plano alterado";
    return { label, title: trimText(title || label, 180), body: trimText(body || status || "Atualização de cobrança", 700), url };
  }

  if (provider === "discord") {
    return { label: "Aviso da comunidade", title: trimText(title || "Aviso do Discord", 180), body: trimText(body || "Nova atualização encaminhada do Discord.", 700), url };
  }

  return null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return response(503, { error: "backend_not_configured" });

  const url = new URL(request.url);
  const ruleId = url.searchParams.get("rule")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!UUID.test(ruleId) || !UUID.test(token)) return response(401, { error: "invalid_webhook_credentials" });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return response(413, { error: "payload_too_large" });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return response(413, { error: "payload_too_large" });

  let payload: Record<string, unknown> = {};
  try {
    payload = raw.trim() ? recordValue(JSON.parse(raw)) : {};
  } catch {
    return response(400, { error: "invalid_json" });
  }

  const { data: ruleData, error: ruleError } = await admin
    .from("integration_rules")
    .select("id,space_id,provider,name,channel_id,events,enabled,webhook_token")
    .eq("id", ruleId)
    .eq("webhook_token", token)
    .maybeSingle();
  const rule = ruleData as RuleRow | null;
  if (ruleError || !rule) return response(401, { error: "invalid_webhook_credentials" });
  if (!rule.enabled) return response(202, { ignored: true, reason: "integration_disabled" });
  if (!rule.channel_id) return response(409, { error: "destination_channel_missing" });

  const { data: channel, error: channelError } = await admin
    .from("channels")
    .select("id,space_id,name,type")
    .eq("id", rule.channel_id)
    .eq("space_id", rule.space_id)
    .maybeSingle();
  if (channelError || !channel || ["voice", "social"].includes(String(channel.type))) {
    return response(409, { error: "invalid_destination_channel" });
  }

  const githubEvent = request.headers.get("x-github-event")?.trim().toLowerCase() ?? "";
  const normalized = rule.provider === "github" && githubEvent
    ? normalizeGithub(githubEvent, payload)
    : normalizeGeneric(rule.provider, payload);
  if (!normalized) return response(202, { ignored: true, reason: "event_not_supported" });

  const configured = Array.isArray(rule.events) ? rule.events.map((item) => String(item).trim().toLowerCase()) : [];
  if (configured.length && !configured.includes(normalized.label.toLowerCase())) {
    return response(202, { ignored: true, reason: "event_not_selected", event: normalized.label });
  }

  const deliveryHeader = firstText(
    request.headers.get("x-github-delivery"),
    request.headers.get("x-request-id"),
    request.headers.get("x-event-id"),
  );
  const eventKey = trimText(deliveryHeader || await sha256Hex(`${rule.id}:${githubEvent}:${raw}`), 180);

  const { error: receiptError } = await admin.from("integration_event_receipts").insert({
    rule_id: rule.id,
    event_key: eventKey,
  });
  if (receiptError) {
    if (receiptError.code === "23505") return response(202, { duplicate: true });
    return response(500, { error: "event_receipt_failed" });
  }

  const { data: bot, error: botError } = await admin
    .from("members")
    .select("id")
    .eq("email", "integrations@system.labstar")
    .maybeSingle();
  if (botError || !bot?.id) return response(500, { error: "integration_author_missing" });

  const prefix = `${providerLabel(rule.provider)} · ${normalized.label}`;
  const text = [
    prefix,
    normalized.title,
    normalized.body,
    normalized.url,
  ].filter(Boolean).join("\n").slice(0, 4000);

  const { data: message, error: messageError } = await admin.from("channel_messages").insert({
    channel_id: rule.channel_id,
    author_id: bot.id,
    body: text,
  }).select("id").single();

  if (messageError) {
    await admin.from("integration_event_receipts").delete().eq("rule_id", rule.id).eq("event_key", eventKey);
    return response(500, { error: "channel_delivery_failed" });
  }

  await admin.from("integration_rules").update({
    last_event_at: new Date().toISOString(),
    delivered_count: Number((payload.delivered_count as number | undefined) ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", rule.id);

  return response(200, {
    delivered: true,
    messageId: message.id,
    channelId: rule.channel_id,
    event: normalized.label,
  });
});
