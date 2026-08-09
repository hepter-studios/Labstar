import { Check, Copy, Github, Hash, LoaderCircle, RefreshCw, Send, ShieldCheck, Webhook } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "../integration-webhook-bridge.css";
import { supabaseClient, type IntegrationRule } from "../lib/supabase";

const INGEST_URL = "https://pgzwyngxsxnheulvusdq.supabase.co/functions/v1/integration-channel-ingest";

type GithubWebhookSettingsProps = {
  rule: IntegrationRule;
  channelName: string;
  onRotate: () => Promise<void>;
  onRefresh: () => Promise<void> | void;
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

function webhookUrl(rule: IntegrationRule) {
  if (!rule.webhookToken) return "";
  const url = new URL(INGEST_URL);
  url.searchParams.set("rule", rule.id);
  url.searchParams.set("token", rule.webhookToken);
  return url.toString();
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function GithubWebhookSettings({ rule, channelName, onRotate, onRefresh }: GithubWebhookSettingsProps) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const copiedTimer = useRef(0);
  const url = webhookUrl(rule);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  async function copy() {
    if (!url) return;
    await copyText(url);
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  async function rotate() {
    if (rotating) return;
    setRotating(true);
    setTestStatus("");
    setTestOk(null);
    try {
      await onRotate();
      setTestOk(true);
      setTestStatus("Novo endereço criado. O webhook anterior deixou de funcionar.");
    } catch {
      setTestOk(false);
      setTestStatus("Não foi possível gerar um novo endereço. Verifique sua permissão de administrar canais.");
    } finally {
      setRotating(false);
    }
  }

  async function testDelivery() {
    if (!supabaseClient || testing || !url || !rule.channelId || !rule.enabled) return;
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
          message: `A integração GitHub está entregando eventos no canal #${channelName || "destino"}.`,
          url: rule.endpoint || "https://github.com",
          testId: crypto.randomUUID(),
          sentAt: new Date().toISOString(),
        }),
      });

      let confirmed = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await wait(700);
        const { data, error } = await supabaseClient
          .from("integration_rules")
          .select("delivered_count,last_event_at")
          .eq("id", rule.id)
          .maybeSingle();
        if (error) throw error;
        const nextCount = Number(data?.delivered_count ?? 0);
        const nextLast = String(data?.last_event_at ?? "");
        if (nextCount > beforeCount || (nextLast && nextLast !== beforeLastEvent)) {
          confirmed = true;
          break;
        }
      }

      setTestOk(confirmed);
      setTestStatus(confirmed
        ? `Teste entregue em #${channelName || "canal"}.`
        : "O receptor não confirmou a entrega. Confira se a atualização v16 foi aplicada e tente novamente.");
      await onRefresh();
    } catch {
      setTestOk(false);
      setTestStatus("Não foi possível entregar o teste. O endereço pode estar desatualizado ou o receptor ainda não foi publicado.");
    } finally {
      setTesting(false);
    }
  }

  const ready = Boolean(url && rule.channelId && rule.events.length && rule.enabled);

  return (
    <section className="integration-webhook-runtime">
      <div className="integration-webhook-summary">
        <span className="integration-webhook-avatar github"><Github size={18} /></span>
        <div className="integration-webhook-identity">
          <strong>{rule.name || "GitHub"}</strong>
          <small>{ready ? "GitHub · webhook pronto" : "GitHub · configuração incompleta"}</small>
        </div>
        <div className="integration-webhook-destination" title="Canal de destino">
          <Hash size={12} />
          <span>{channelName || "Canal não definido"}</span>
        </div>
        <span className={`integration-webhook-status ${ready ? "" : "pending"}`}><i /> {ready ? "Ativo" : "Pendente"}</span>
      </div>

      <div className="integration-webhook-divider" />

      <header>
        <span><Webhook size={13} /></span>
        <div><strong>URL do webhook</strong><small>Use esta URL em GitHub → Settings → Webhooks.</small></div>
        {rule.deliveredCount > 0 && <em>{rule.deliveredCount} entregue{rule.deliveredCount === 1 ? "" : "s"}</em>}
      </header>
      {url ? (
        <div className="integration-webhook-url">
          <input value={url} readOnly aria-label={`Webhook da integração ${rule.name}`} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={() => void copy()} title="Copiar URL do webhook">{copied ? <Check size={13} /> : <Copy size={13} />}<span>{copied ? "Copiado" : "Copiar URL"}</span></button>
          <button type="button" className="rotate" onClick={() => void rotate()} disabled={rotating} title="Gerar um novo endereço e invalidar o anterior"><RefreshCw className={rotating ? "spin" : ""} size={13} /></button>
        </div>
      ) : <p className="integration-webhook-test-status error">O endereço ainda não existe. Aplique a atualização v16 no Supabase.</p>}

      <div className="integration-webhook-self-test">
        <button type="button" onClick={() => void testDelivery()} disabled={testing || !ready}>
          {testing ? <LoaderCircle className="spin" size={13} /> : <Send size={13} />}
          <span>{testing ? "Testando…" : "Testar agora"}</span>
        </button>
        <div>
          <strong>Teste sem sair do Labstar</strong>
          <small>Envia um evento pelo mesmo receptor e confirma a chegada no canal.</small>
        </div>
      </div>
      {testStatus && <p className={`integration-webhook-test-status ${testOk === true ? "success" : testOk === false ? "error" : ""}`}>{testStatus}</p>}

      <footer>
        <ShieldCheck size={11} />
        <span>Content type: application/json. Em “Which events”, escolha os mesmos eventos marcados acima.</span>
        {rule.lastEventAt && <time>Último evento: {new Date(rule.lastEventAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>}
      </footer>
    </section>
  );
}
