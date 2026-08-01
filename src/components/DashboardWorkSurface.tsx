import { ArrowRight, LayoutDashboard, LoaderCircle, Network, Server, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrentIdentity,
  loadCollaboration,
  type CollaborationSpace,
  type LabstarChannel,
  type Member,
} from "../lib/supabase";
import { WorkHome } from "./WorkHome";

type DashboardData = {
  member: Member | null;
  spaces: CollaborationSpace[];
  channels: LabstarChannel[];
};

const EMPTY_DATA: DashboardData = {
  member: null,
  spaces: [],
  channels: [],
};

function clickView(label: string) {
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
}

export function DashboardWorkSurface() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [identityResult, collaborationResult] = await Promise.allSettled([
        getCurrentIdentity(),
        loadCollaboration(),
      ]);
      if (cancelled) return;
      const collaboration = collaborationResult.status === "fulfilled"
        ? collaborationResult.value
        : { spaces: [], categories: [], channels: [] };
      setData({
        member: identityResult.status === "fulfilled" ? identityResult.value?.member ?? null : null,
        spaces: collaboration.spaces,
        channels: collaboration.channels,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let currentOverview: HTMLElement | null = null;
    let currentWorkspace: HTMLElement | null = null;

    const syncMount = () => {
      const overview = document.querySelector<HTMLElement>(".overview");
      if (!overview) {
        if (currentOverview) currentOverview.classList.remove("dashboard-work-surface");
        if (currentWorkspace) currentWorkspace.classList.remove("dashboard-workspace");
        currentOverview = null;
        currentWorkspace = null;
        setMount((value) => value === null ? value : null);
        return;
      }

      const workspace = overview.closest<HTMLElement>(".workspace");
      if (currentOverview && currentOverview !== overview) currentOverview.classList.remove("dashboard-work-surface");
      if (currentWorkspace && currentWorkspace !== workspace) currentWorkspace.classList.remove("dashboard-workspace");
      currentOverview = overview;
      currentWorkspace = workspace;
      overview.classList.add("dashboard-work-surface");
      workspace?.classList.add("dashboard-workspace");

      let target = overview.querySelector<HTMLElement>("[data-labstar-dashboard-work]");
      if (!target) {
        target = document.createElement("div");
        target.dataset.labstarDashboardWork = "true";
        overview.prepend(target);
      }
      setMount((value) => value === target ? value : target);
    };

    syncMount();
    const observer = new MutationObserver(syncMount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      currentOverview?.classList.remove("dashboard-work-surface");
      currentWorkspace?.classList.remove("dashboard-workspace");
    };
  }, []);

  const firstChannelBySpace = useMemo(() => {
    const map = new Map<string, string>();
    for (const space of data.spaces) {
      const channel = data.channels.find((item) => item.spaceId === space.id);
      if (channel) map.set(space.id, channel.id);
    }
    return map;
  }, [data.channels, data.spaces]);

  function openChannel(channelId?: string | null) {
    clickView("Central de trabalho");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("labstar:open-channel", {
        detail: { channelId: channelId ?? undefined },
      }));
    }, 80);
  }

  function openDirect() {
    clickView("Central de trabalho");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("labstar:open-direct")), 80);
  }

  function openSummary() {
    document.querySelector<HTMLButtonElement>(".overview .overview-head > button")?.click();
  }

  if (!mount) return null;

  return createPortal(
    <section className="dashboard-work-shell">
      <header className="dashboard-work-header">
        <div>
          <span><LayoutDashboard size={14} /> Dashboard</span>
          <strong>Visão central do Labstar</strong>
          <small>Prioridades, tarefas, decisões, reuniões e atividade ficam aqui. Servidores e canais continuam na Central de trabalho.</small>
        </div>
        <div>
          <button type="button" onClick={openSummary}><Sparkles size={14} /> Resumo executivo</button>
          <button type="button" onClick={() => clickView("Mapa da organização")}><Network size={14} /> Abrir mapa</button>
          <button type="button" className="primary" onClick={() => openChannel(data.channels[0]?.id)}><Server size={14} /> Abrir servidores</button>
        </div>
      </header>

      <section className="dashboard-server-strip" aria-label="Servidores e espaços de trabalho">
        <div><Server size={15} /><span><strong>Servidores</strong><small>Acesso direto aos espaços principais</small></span></div>
        <div className="dashboard-server-list">
          {data.spaces.map((space) => (
            <button
              type="button"
              key={space.id}
              onClick={() => openChannel(firstChannelBySpace.get(space.id))}
              style={{ "--server-color": space.color } as React.CSSProperties}
              title={`Abrir ${space.name}`}
            >
              <span>{space.logoUrl ? <img src={space.logoUrl} alt="" /> : space.icon || "★"}</span>
              <b>{space.name}</b>
              <ArrowRight size={13} />
            </button>
          ))}
          {!data.spaces.length && !loading && <p>Nenhum servidor configurado ainda.</p>}
          {loading && <p><LoaderCircle className="spin" size={14} /> Carregando servidores…</p>}
        </div>
      </section>

      {data.member ? (
        <WorkHome member={data.member} onOpenChannel={openChannel} onOpenDirect={openDirect} />
      ) : (
        <div className="dashboard-work-loading"><LoaderCircle className="spin" size={22} /><strong>Carregando o Dashboard</strong><span>Preparando os dados compartilhados da Web e do aplicativo.</span></div>
      )}
    </section>,
    mount,
  );
}
