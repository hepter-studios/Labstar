import { Check, Copy, Github, Hash, LoaderCircle, RefreshCw, Send, ShieldCheck, Webhook } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../integration-webhook-bridge.css";
import { loadCollaboration, supabaseClient } from "../lib/supabase";

const INGEST_URL = "https://pgzwyngxsxnheulvusdq.supabase.co/functions/v1/integration-channel-ingest";

type WebhookRule = {
  id: string;
  provider: "github";
  name: string;
  token: string;
  channelId: string;
  channelName: string;
  deliveredCount: number;
  lastEventAt: string;
  events: string[];
  endpoint: string;
};

type PortalTarget = {
  target: HTMLElement;
  rule: WebhookRule;
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

function webhookUrl(rule: WebhookRule) {
  const url = new URL(INGEST_URL);
  url.searchParams.set("rule", rule.id);
  url.searchParams.set("token", rule.token);
  return url.toString();
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function RuleWebhook({ rule, onRotate, onRefresh }: { rule: WebhookRule; onRotate: () => Promise<void>; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const url = webhookUrl(rule);

  async function copy() {
    await copyText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function rotate() {
    setRotating(true);
    setTestStatus("");
    setTestOk(null);
    try {
      await onRotate();
    } finally {
      setRotating(false);
    }
  }

  async function testDelivery() {
    if (!supabaseClient || testing) return;
    setTesting(true);
    setTestOk(null);
    setTestStatus("Enviando evento de teste…");

    const beforeCount = rule.deliveredCount;
    const beforeLastEvent = rule.lastEventAt;
    const eventName = rule.events[0] || "Pull request";

    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({
          event: eventName,
          title: `Teste manual · ${rule.name || "GitHub"}`,
          message: `A integração GitHub está entregando eventos no canal #${rule.channelName || "destino"}.`,
          url: rule.endpoint || "https://github.com",
          testId: crypto.randomUUID(),
          sentAt: new Date().toISOString(),
        }),
      });

      let confirmed = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await wait(700);
        const { data, error } = await supabaseClient
          .from("integration_rules")
          .select("delivered_count,last_event_at")
          .eq("id", rule.id)
          .maybeSingle();
        if (error) break;
        const nextCount = Number(data?.delivered_count ?? 0);
        const nextLast = String(data?.last_event_at ?? "");
        if (nextCount > beforeCount || (nextLast && nextLast !== beforeLastEvent)) {
          confirmed = true;
          break;
        }
      }

      setTestOk(confirmed);
      setTestStatus(confirmed
        ? `Teste entregue em #${rule.channelName || "canal"}. Confira também o sino de notificações.`
        : "O teste foi enviado, mas o Labstar não confirmou a entrega. Verifique o canal e o status do webhook.");
      onRefresh();
    } catch {
      setTestOk(false);
      setTestStatus("Não foi possível enviar o teste deste dispositivo.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="integration-webhook-runtime">
      <div className="integration-webhook-summary">
        <span className="integration-webhook-avatar github"><Github size={18} /></span>
        <div className="integration-webhook-identity">
          <strong>{rule.name || "GitHub"}</strong>
          <small>GitHub · webhook ativo</small>
        </div>
        <div className="integration-webhook-destination" title="Canal de destino">
          <Hash size={12} />
          <span>{rule.channelName || "Canal não definido"}</span>
        </div>
        <span className="integration-webhook-status"><i /> Ativo</span>
      </div>

      <div className="integration-webhook-divider" />

      <header>
        <span><Webhook size={13} /></span>
        <div><strong>URL do webhook</strong><small>Use esta URL em GitHub → Settings → Webhooks.</small></div>
        {rule.deliveredCount > 0 && <em>{rule.deliveredCount} entregue{rule.deliveredCount === 1 ? "" : "s"}</em>}
      </header>
      <div className="integration-webhook-url">
        <input value={url} readOnly aria-label={`Webhook da integração ${rule.name}`} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={() => void copy()} title="Copiar URL do webhook">{copied ? <Check size={13} /> : <Copy size={13} />}<span>{copied ? "Copiado" : "Copiar URL"}</span></button>
        <button type="button" className="rotate" onClick={() => void rotate()} disabled={rotating} title="Gerar um novo endereço e invalidar o anterior"><RefreshCw className={rotating ? "spin" : ""} size={13} /></button>
      </div>

      <div className="integration-webhook-self-test">
        <button type="button" onClick={() => void testDelivery()} disabled={testing || !rule.channelId}>
          {testing ? <LoaderCircle className="spin" size={13} /> : <Send size={13} />}
          <span>{testing ? "Testando…" : "Testar agora"}</span>
        </button>
        <div>
          <strong>Teste sem sair do Labstar</strong>
          <small>Envia um evento real pelo mesmo webhook e confirma se ele chegou ao canal.</small>
        </div>
      </div>
      {testStatus && <p className={`integration-webhook-test-status ${testOk === true ? "success" : testOk === false ? "error" : ""}`}>{testStatus}</p>}

      <footer>
        <ShieldCheck size={11} />
        <span>GitHub: Settings → Webhooks → Add webhook → cole esta URL em Payload URL.</span>
        {rule.lastEventAt && <time>Último evento: {new Date(rule.lastEventAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>}
      </footer>
    </section>
  );
}

export function IntegrationWebhookBridge() {
  const [portals, setPortals] = useState<PortalTarget[]>([]);
  const refreshTimer = useRef(0);
  const generation = useRef(0);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      window.clearTimeout(refreshTimer.current);
      const currentGeneration = ++generation.current;
      const modal = document.querySelector<HTMLElement>(".integrations-center");
      if (!modal || !supabaseClient) {
        setPortals([]);
        return;
      }

      const spaceLabel = modal.querySelector<HTMLElement>(":scope > header small")?.textContent?.split(" · ")[0]?.trim() ?? "";
      if (!spaceLabel) return;

      try {
        const collaboration = await loadCollaboration();
        const space = collaboration.spaces.find((item) => item.name === spaceLabel);
        if (!space || disposed || currentGeneration !== generation.current) return;

        const channelNames = new Map(
          collaboration.channels
            .filter((channel) => channel.spaceId === space.id)
            .map((channel) => [channel.id, channel.name] as const),
        );

        const { data, error } = await supabaseClient
          .from("integration_rules")
          .select("id,provider,name,endpoint,events,channel_id,webhook_token,last_event_at,delivered_count")
          .eq("space_id", space.id)
          .eq("provider", "github")
          .order("created_at", { ascending: true });
        if (error) throw error;

        const rules: WebhookRule[] = (data ?? []).filter((row) => row.webhook_token).map((row) => {
          const channelId = String(row.channel_id ?? "");
          return {
            id: String(row.id),
            provider: "github",
            name: String(row.name ?? "GitHub"),
            token: String(row.webhook_token),
            channelId,
            channelName: channelNames.get(channelId) ?? "",
            deliveredCount: Number(row.delivered_count ?? 0),
            lastEventAt: String(row.last_event_at ?? ""),
            events: Array.isArray(row.events) ? row.events.map(String) : [],
            endpoint: String(row.endpoint ?? ""),
          };
        });
        const cards = [...modal.querySelectorAll<HTMLElement>(".integration-rule-list > article")]
          .filter((card) => Boolean(card.querySelector(".provider-mark.github")));
        if (disposed || currentGeneration !== generation.current) return;

        setPortals(cards.flatMap((card, index) => {
          const rule = rules[index];
          if (!rule) return [];
          card.classList.add("integration-card-enhanced");
          let target = card.querySelector<HTMLElement>(":scope > .integration-webhook-bridge-mount");
          if (!target) {
            target = document.createElement("div");
            target.className = "integration-webhook-bridge-mount";
            card.appendChild(target);
          }
          return [{ target, rule }];
        }));
      } catch {
        setPortals([]);
      }
    };

    const schedule = () => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(), 220);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);
    document.addEventListener("labstar:integration-refresh", schedule as EventListener);
    schedule();

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer.current);
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      document.removeEventListener("labstar:integration-refresh", schedule as EventListener);
    };
  }, []);

  async function rotate(ruleId: string) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.rpc("rotate_integration_webhook_token", { target_rule_id: ruleId });
    if (error) throw error;
    document.dispatchEvent(new Event("labstar:integration-refresh"));
  }

  return <>{portals.map(({ target, rule }) => createPortal(
    <RuleWebhook
      key={rule.id}
      rule={rule}
      onRotate={() => rotate(rule.id)}
      onRefresh={() => document.dispatchEvent(new Event("labstar:integration-refresh"))}
    />,
    target,
  ))}</>;
}
