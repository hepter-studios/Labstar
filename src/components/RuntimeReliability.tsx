import { AlertTriangle, CheckCircle2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type RuntimeNotice = {
  id: number;
  kind: "error" | "offline" | "online";
  title: string;
  message: string;
};

export function RuntimeReliability() {
  const [notice, setNotice] = useState<RuntimeNotice | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const show = (next: Omit<RuntimeNotice, "id">) => {
      sequence.current += 1;
      setNotice({ ...next, id: sequence.current });
    };

    const unhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      if (reason?.name === "AbortError") return;
      show({
        kind: "error",
        title: "A ação não foi concluída",
        message: "O Labstar preservou a tela atual. Tente novamente; se persistir, o erro ficará isolado sem perder sua sessão.",
      });
    };

    const offline = () => show({
      kind: "offline",
      title: "Sem conexão",
      message: "O Labstar continuará mostrando o que já está carregado e retomará a sincronização quando a rede voltar.",
    });

    const online = () => show({
      kind: "online",
      title: "Conexão restaurada",
      message: "A rede voltou. As próximas leituras e sincronizações usarão a conexão normal.",
    });

    window.addEventListener("unhandledrejection", unhandled);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("unhandledrejection", unhandled);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice((current) => current?.id === notice.id ? null : current), notice.kind === "online" ? 3500 : 7000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  if (!notice) return null;
  const Icon = notice.kind === "offline" ? WifiOff : notice.kind === "online" ? CheckCircle2 : AlertTriangle;

  return (
    <aside className={`runtime-notice ${notice.kind}`} role="status" aria-live="polite">
      <span><Icon size={17} /></span>
      <div><strong>{notice.title}</strong><p>{notice.message}</p></div>
      <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={14} /></button>
    </aside>
  );
}
