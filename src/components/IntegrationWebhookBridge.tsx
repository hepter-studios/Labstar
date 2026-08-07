import { Check, Copy, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../integration-webhook-bridge.css";
import { loadCollaboration, supabaseClient } from "../lib/supabase";

const INGEST_URL = "https://pgzwyngxsxnheulvusdq.supabase.co/functions/v1/integration-channel-ingest";

type WebhookRule = {
  id: string;
  provider: string;
  name: string;
  token: string;
  deliveredCount: number;
  lastEventAt: string;
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

function RuleWebhook({ rule, onRotate }: { rule: WebhookRule; onRotate: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const url = webhookUrl(rule);

  async function copy() {
    await copyText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function rotate() {
    setRotating(true);
    try {
      await onRotate();
    } finally {
      setRotating(false);
    }
  }

  return (
    <section className="integration-webhook-runtime">
      <header>
        <span><Webhook size={13} /></span>
        <div><strong>Webhook de entrada</strong><small>Eventos externos publicados no canal escolhido.</small></div>
        {rule.deliveredCount > 0 && <em>{rule.deliveredCount} entregue{rule.deliveredCount === 1 ? "" : "s"}</em>}
      </header>
      <div className="integration-webhook-url">
        <input value={url} readOnly aria-label={`Webhook da integração ${rule.name}`} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={() => void copy()} title="Copiar webhook">{copied ? <Check size={13} /> : <Copy size={13} />}<span>{copied ? "Copiado" : "Copiar"}</span></button>
        <button type="button" className="rotate" onClick={() => void rotate()} disabled={rotating} title="Gerar um novo endereço e invalidar o anterior"><RefreshCw className={rotating ? "spin" : ""} size={13} /></button>
      </div>
      <footer>
        <ShieldCheck size={11} />
        <span>{rule.provider === "github" ? "Use como Payload URL no webhook do repositório." : "Use este endereço no serviço que enviará o evento."}</span>
        {rule.lastEventAt && <time>Último: {new Date(rule.lastEventAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>}
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

        const { data, error } = await supabaseClient
          .from("integration_rules")
          .select("id,provider,name,webhook_token,last_event_at,delivered_count")
          .eq("space_id", space.id)
          .order("created_at", { ascending: true });
        if (error) throw error;

        const rules: WebhookRule[] = (data ?? []).filter((row) => row.webhook_token).map((row) => ({
          id: String(row.id),
          provider: String(row.provider),
          name: String(row.name),
          token: String(row.webhook_token),
          deliveredCount: Number(row.delivered_count ?? 0),
          lastEventAt: String(row.last_event_at ?? ""),
        }));
        const cards = [...modal.querySelectorAll<HTMLElement>(".integration-rule-list > article")];
        if (disposed || currentGeneration !== generation.current) return;

        setPortals(cards.flatMap((card, index) => {
          const rule = rules[index];
          if (!rule) return [];
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
    schedule();

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer.current);
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
    };
  }, []);

  async function rotate(ruleId: string) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.rpc("rotate_integration_webhook_token", { target_rule_id: ruleId });
    if (error) throw error;
    const modal = document.querySelector<HTMLElement>(".integrations-center");
    modal?.dispatchEvent(new Event("click", { bubbles: true }));
  }

  return <>{portals.map(({ target, rule }) => createPortal(<RuleWebhook key={rule.id} rule={rule} onRotate={() => rotate(rule.id)} />, target))}</>;
}
