import {
  AudioLines,
  BellRing,
  Camera,
  CameraOff,
  CalendarDays,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  FileImage,
  FolderPlus,
  Github,
  Hash,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  Pencil,
  PictureInPicture2,
  Pin,
  Plus,
  Reply,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCategory,
  createChannel,
  createMeeting,
  createSpace,
  cancelMeeting,
  deleteMessage,
  deleteSocialPost,
  editMessage,
  listMembers,
  listMeetings,
  listMessages,
  listIntegrationRules,
  listSocialPosts,
  loadCollaboration,
  pinMessage,
  saveSocialPost,
  saveIntegrationRule,
  sendMessage,
  subscribeToTable,
  supabaseClient,
  unsubscribe,
  updateSpace,
  uploadSpaceLogo,
  removeIntegrationRule,
  rotateIntegrationWebhookToken,
  type ChannelCategory,
  type ChannelMessage,
  type CollaborationSpace,
  type LabstarChannel,
  type Member,
  type ScheduledMeeting,
  type SocialPost,
  type IntegrationRule,
} from "../lib/supabase";
import { memberPresenceStatus, useMemberPresence } from "../lib/presence";
import {
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_FILES,
  chatFileErrorMessage,
  createLargePasteAttachment,
  formatChatBytes,
  mergeChatFiles,
} from "../lib/programmer-files";
import { Avatar } from "./Avatar";
import {
  DeveloperAttachmentCard,
  DeveloperFileQueue,
  DeveloperMessageBody,
} from "./DeveloperChatContent";
import { MeetingRoomV2 } from "./MeetingRoomV2";
import { GithubWebhookSettings } from "./IntegrationWebhookBridge";
import { DeveloperComposerTools, handleDeveloperComposerKeyDown } from "./DeveloperComposerTools";
import {
  GithubIntegrationMessage,
  normalizeIntegrationMessageBody,
  parseGithubIntegrationMessage,
} from "./GithubIntegrationMessage";

type CollaborationHubProps = {
  member: Member;
  initialChannelId?: string | null;
  soundEnabled?: boolean;
};

type CreateModal =
  | { type: "space" }
  | { type: "category"; spaceId: string }
  | { type: "channel"; spaceId: string; categoryId: string }
  | { type: "space-settings"; spaceId: string }
  | null;

const channelIcons = {
  text: Hash,
  announcement: Megaphone,
  rules: ShieldCheck,
  voice: Volume2,
  social: CalendarDays,
};

const channelLabels = {
  text: "Texto",
  announcement: "Avisos",
  rules: "Regras",
  voice: "Voz",
  social: "Planejamento social",
};

const emojiSet = ["😀", "😃", "😄", "😁", "😂", "🤣", "😊", "🥹", "😍", "🥰", "😎", "🤔", "🫡", "😮", "😢", "😭", "😡", "👍", "👎", "👏", "🙌", "🤝", "💪", "🙏", "👀", "🧠", "💡", "❤️", "💙", "💚", "🔥", "✨", "⭐", "🚀", "✅", "❌", "⚠️", "🎯", "📌", "📎", "📝", "🎉", "🥳", "💬", "🔒", "🔔", "☕", "💻"];

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function canManage(member: Member) {
  return member.role === "owner" || member.role === "admin" || member.jobRoles.some((role) => role.permissions.includes("manage_channels"));
}

export function CollaborationHub({ member, initialChannelId, soundEnabled = true }: CollaborationHubProps) {
  const [spaces, setSpaces] = useState<CollaborationSpace[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [channels, setChannels] = useState<LabstarChannel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState(initialChannelId ?? "");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [createModal, setCreateModal] = useState<CreateModal>(null);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const onlineMemberIds = useMemberPresence(member.id);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [collaboration, team] = await Promise.all([loadCollaboration(), listMembers()]);
      setSpaces(collaboration.spaces);
      setCategories(collaboration.categories);
      setChannels(collaboration.channels);
      setMembers(team.members);
      const nextSpace = selectedSpaceId || collaboration.spaces[0]?.id || "";
      setSelectedSpaceId(nextSpace);
      setSelectedChannelId((current) => {
        if (current && collaboration.channels.some((channel) => channel.id === current)) return current;
        return collaboration.channels.find((channel) => channel.spaceId === nextSpace)?.id ?? "";
      });
    } catch {
      setError("A central de trabalho ainda não está conectada ao banco. Execute a atualização v6 e recarregue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!initialChannelId) return;
    const channel = channels.find((item) => item.id === initialChannelId);
    if (channel) {
      setSelectedSpaceId(channel.spaceId);
      setSelectedChannelId(channel.id);
    }
  }, [initialChannelId, channels]);

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? null;
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const spaceCategories = categories.filter((category) => category.spaceId === selectedSpaceId);
  const spaceChannels = channels.filter((channel) => channel.spaceId === selectedSpaceId);
  const visibleMembers = members.filter((item) => item.status === "active");
  const query = search.trim().toLocaleLowerCase();

  function chooseSpace(space: CollaborationSpace) {
    setSelectedSpaceId(space.id);
    setSelectedChannelId(channels.find((channel) => channel.spaceId === space.id)?.id ?? "");
  }

  if (loading) {
    return <section className="collab-loading"><LoaderCircle className="spin" /><strong>Abrindo central de trabalho</strong><span>Organizando espaços, canais e mensagens…</span></section>;
  }

  if (error) {
    return <section className="collab-error"><ShieldCheck size={28} /><h1>Falta concluir a atualização da central</h1><p>{error}</p><button onClick={() => void refresh()}>Tentar novamente</button></section>;
  }

  return (
    <section className={`collaboration-shell ${showMembers ? "" : "members-hidden"}`}>
      <aside className="space-rail" aria-label="Espaços de trabalho">
        <div className="space-list">
          {spaces.map((space) => (
            <button
              key={space.id}
              className={selectedSpaceId === space.id ? "active" : ""}
              onClick={() => chooseSpace(space)}
              title={space.name}
              style={{ "--space-color": space.color } as React.CSSProperties}
            >
              {space.logoUrl ? <img src={space.logoUrl} alt="" /> : <span>{space.icon || "★"}</span>}
              <i />
            </button>
          ))}
        </div>
        {canManage(member) && <button className="add-space" onClick={() => setCreateModal({ type: "space" })} aria-label="Criar espaço"><Plus size={18} /></button>}
      </aside>

      <aside className="channel-sidebar">
        <header className="space-header">
          <div className="space-title">
            <span style={{ "--space-color": selectedSpace?.color } as React.CSSProperties}>{selectedSpace?.logoUrl ? <img src={selectedSpace.logoUrl} alt="" /> : selectedSpace?.icon || "★"}</span>
            <div><strong>{selectedSpace?.name}</strong><small>{selectedSpace?.kind === "company" ? "Empresa" : selectedSpace?.kind === "product" ? "Produto" : selectedSpace?.kind === "project" ? "Projeto" : "Equipe"}</small></div>
          </div>
          {canManage(member) && selectedSpace && <button onClick={() => setCreateModal({ type: "space-settings", spaceId: selectedSpace.id })} aria-label="Configurar espaço"><Settings2 size={16} /></button>}
        </header>

        <label className="channel-search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar canal" />
        </label>

        <div className="channel-scroll">
          {spaceCategories.map((category) => {
            const categoryChannels = spaceChannels.filter((channel) =>
              channel.categoryId === category.id && (!query || `${channel.name} ${channel.description}`.toLocaleLowerCase().includes(query))
            );
            const isCollapsed = collapsed.has(category.id);
            return (
              <section className="channel-category" key={category.id}>
                <header>
                  <button onClick={() => setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(category.id)) next.delete(category.id); else next.add(category.id);
                    return next;
                  })}>
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    <span>{category.name}</span>
                  </button>
                  {canManage(member) && <button onClick={() => setCreateModal({ type: "channel", spaceId: selectedSpaceId, categoryId: category.id })} aria-label={`Criar canal em ${category.name}`}><Plus size={14} /></button>}
                </header>
                {!isCollapsed && (
                  <div className="channel-list">
                    {categoryChannels.map((channel) => {
                      const Icon = channelIcons[channel.type];
                      return (
                        <button key={channel.id} className={selectedChannelId === channel.id ? "active" : ""} onClick={() => setSelectedChannelId(channel.id)}>
                          <Icon size={16} />
                          <span>{channel.name}</span>
                          {channel.allowedRoles.length > 0 && <LockKeyhole size={11} className="channel-lock" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {canManage(member) && selectedSpace && (
            <button className="new-category" onClick={() => setCreateModal({ type: "category", spaceId: selectedSpace.id })}>
              <FolderPlus size={14} /> Nova categoria
            </button>
          )}
        </div>

        <div className="channel-user">
          <Avatar name={member.name} url={member.avatarUrl} size="sm" />
          <div><strong>{member.name}</strong><small>{member.jobRoles[0]?.name || member.jobTitle || "Membro"}</small></div>
          <span className="online-label">Você</span>
        </div>
      </aside>

      <main className="channel-content">
        {selectedChannel ? (
          <>
            <header className="channel-header">
              <div className="channel-heading">
                {(() => { const Icon = channelIcons[selectedChannel.type]; return <Icon size={19} />; })()}
                <div><strong>{selectedChannel.name}</strong><small>{selectedChannel.description || channelLabels[selectedChannel.type]}</small></div>
              </div>
              <div className="channel-head-actions">
                {selectedSpace && <button onClick={() => setIntegrationsOpen(true)} title="Integrações e automações"><Webhook size={17} /></button>}
                <button className={showMembers ? "active" : ""} onClick={() => setShowMembers((value) => !value)} title="Mostrar membros"><Users size={17} /></button>
              </div>
            </header>
            {selectedChannel.type === "voice"
              ? <MeetingRoomV2 channel={selectedChannel} member={member} members={members} soundEnabled={soundEnabled} />
              : selectedChannel.type === "social"
                ? <SocialPlanner space={selectedSpace!} member={member} />
                : <MessageRoom channel={selectedChannel} space={selectedSpace!} member={member} />}
          </>
        ) : (
          <div className="channel-empty"><MessageSquare size={28} /><h2>Escolha um canal</h2><p>As conversas, arquivos e decisões ficam organizadas por categoria.</p></div>
        )}
      </main>

      {showMembers && (
        <aside className="channel-members">
          <header><strong>Membros</strong><span>{visibleMembers.length}</span></header>
          <div className="member-group-label">DISPONÍVEIS — {visibleMembers.length}</div>
          {visibleMembers.map((item) => (
            <div className="channel-member-row" key={item.id}>
              <Avatar name={item.name} url={item.avatarUrl} size="sm" status={memberPresenceStatus(onlineMemberIds, member.id, item.id)} />
              <span><b>{item.name}</b><small>{item.jobRoles[0]?.name || item.jobTitle || "Membro"}</small></span>
              {item.jobRoles[0] && <i className="member-role-star" style={{ color: item.jobRoles[0].color }}><Star size={11} fill="currentColor" /></i>}
            </div>
          ))}
        </aside>
      )}

      {createModal && (
        <CollaborationModal
          modal={createModal}
          spaces={spaces}
          onClose={() => setCreateModal(null)}
          onCreated={async () => {
            setCreateModal(null);
            await refresh();
          }}
          member={member}
        />
      )}
      {integrationsOpen && selectedSpace && (
        <IntegrationsCenter
          space={selectedSpace}
          channels={spaceChannels}
          onClose={() => setIntegrationsOpen(false)}
        />
      )}
    </section>
  );
}

const githubEvents = ["Pull request", "Issue crítica", "Deploy falhou", "Nova versão", "Alerta de segurança"];

function IntegrationsCenter({ space, channels, onClose }: { space: CollaborationSpace; channels: LabstarChannel[]; onClose: () => void }) {
  const [rules, setRules] = useState<IntegrationRule[]>([]);
  const [notice, setNotice] = useState("Carregando configurações…");
  const [adding, setAdding] = useState(false);
  const modalRef = useRef<HTMLElement>(null);
  const writableChannels = channels.filter((channel) => channel.type !== "voice" && channel.type !== "social");
  const channelNames = new Map(writableChannels.map((channel) => [channel.id, channel.name] as const));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function refreshRules(silent = false) {
    if (!silent) setNotice("Carregando configurações…");
    try {
      const data = await listIntegrationRules(space.id);
      setRules(data.filter((rule) => rule.provider === "github"));
      if (!silent) setNotice("Integrações GitHub sincronizadas para toda a equipe.");
    } catch {
      setNotice("Não foi possível carregar as integrações. Verifique se as atualizações v8 e v16 foram aplicadas.");
    }
  }

  useEffect(() => {
    void refreshRules();
  }, [space.id]);

  async function persist(changed: IntegrationRule) {
    setNotice("Salvando…");
    try {
      await saveIntegrationRule(changed);
      setNotice("Configuração GitHub salva para toda a equipe.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(code.includes("permission") || code.includes("policy")
        ? "Sua conta não tem permissão para administrar integrações."
        : "Não foi possível salvar. Verifique as atualizações v8 e v16 do banco.");
    }
  }

  async function addRule() {
    if (adding) return;
    setAdding(true);
    const newRule: IntegrationRule = {
      id: crypto.randomUUID(),
      spaceId: space.id,
      provider: "github",
      name: "GitHub",
      endpoint: "",
      channelId: writableChannels[0]?.id || "",
      events: [githubEvents[0]],
      enabled: true,
      renewalDate: "",
      webhookToken: "",
      lastEventAt: "",
      deliveredCount: 0,
    };
    setNotice("Criando integração GitHub…");
    try {
      await saveIntegrationRule(newRule);
      await refreshRules(true);
      setNotice("Integração GitHub criada. Agora copie o webhook para o repositório.");
    } catch {
      setNotice("Não foi possível criar a integração GitHub.");
    } finally {
      setAdding(false);
    }
  }

  function updateRule(id: string, patch: Partial<IntegrationRule>) {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  function patchAndPersist(id: string, patch: Partial<IntegrationRule>) {
    const current = rules.find((rule) => rule.id === id);
    if (!current) return;
    const changed = { ...current, ...patch };
    setRules((items) => items.map((rule) => rule.id === id ? changed : rule));
    void persist(changed);
  }

  function saveCurrentRule(id: string) {
    const current = rules.find((rule) => rule.id === id);
    if (current) void persist(current);
  }

  async function rotateWebhook(id: string) {
    const token = await rotateIntegrationWebhookToken(id);
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, webhookToken: token } : rule));
  }

  return (
    <div className="modal-backdrop integrations-backdrop" onMouseDown={onClose}>
      <section ref={modalRef} className="integrations-center" role="dialog" aria-modal="true" aria-label="Central de integrações" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span><Webhook size={19} /></span><div><strong>Integrações e automações</strong><small>{space.name} · cada evento chega ao canal certo</small></div></div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
        </header>

        <div className="integration-intro">
          <div><b>GitHub conectado aos canais</b><p>Envie pull requests, issues críticas, falhas, versões e alertas de segurança diretamente para a equipe.</p></div>
          <div className="integration-create">
            <button type="button" onClick={() => void addRule()} disabled={adding}>{adding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Adicionar GitHub</button>
          </div>
        </div>

        <div className="integration-rule-list">
          {rules.map((rule) => {
            return (
              <article key={rule.id} className={`integration-card-enhanced ${rule.enabled ? "" : "disabled"}`}>
                <div className="integration-rule-head">
                  <span className="provider-mark github"><Github size={18} /></span>
                  <div><strong>GitHub</strong><small>Pull requests, issues, releases, ações e alertas de segurança.</small></div>
                  <label className="integration-toggle"><input type="checkbox" checked={rule.enabled} onChange={(event) => patchAndPersist(rule.id, { enabled: event.target.checked })} /><i /></label>
                  <button className="remove-rule" type="button" onClick={async () => {
                    if (!window.confirm(`Remover a integração ${rule.name || "GitHub"}? O endereço atual deixará de funcionar.`)) return;
                    try {
                      await removeIntegrationRule(rule.id);
                      setRules((current) => current.filter((item) => item.id !== rule.id));
                      setNotice("Integração GitHub removida.");
                    } catch { setNotice("Não foi possível remover a integração."); }
                  }} aria-label="Remover integração"><Trash2 size={14} /></button>
                </div>
                <div className="integration-rule-fields">
                  <label>Nome<input value={rule.name} onChange={(event) => updateRule(rule.id, { name: event.target.value })} onBlur={() => saveCurrentRule(rule.id)} /></label>
                  <label>Enviar para<select value={rule.channelId} onChange={(event) => patchAndPersist(rule.id, { channelId: event.target.value })}><option value="">Escolha um canal</option>{writableChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
                  <label className="full">Repositório GitHub (opcional)<input type="url" value={rule.endpoint} onChange={(event) => updateRule(rule.id, { endpoint: event.target.value })} onBlur={() => saveCurrentRule(rule.id)} placeholder="https://github.com/empresa/repositorio" /></label>
                </div>
                <fieldset>
                  <legend>Eventos que devem gerar aviso</legend>
                  {githubEvents.map((eventName) => <label key={eventName}><input type="checkbox" checked={rule.events.includes(eventName)} onChange={() => patchAndPersist(rule.id, { events: rule.events.includes(eventName) ? rule.events.filter((item) => item !== eventName) : [...rule.events, eventName] })} /><span>{eventName}</span></label>)}
                </fieldset>
                <GithubWebhookSettings
                  rule={rule}
                  channelName={channelNames.get(rule.channelId) ?? ""}
                  onRotate={() => rotateWebhook(rule.id)}
                  onRefresh={() => refreshRules(true)}
                />
              </article>
            );
          })}
          {!rules.length && <div className="integration-empty"><Github size={26} /><strong>Nenhum GitHub configurado</strong><p>Adicione o GitHub, escolha um canal e copie o endereço para Settings → Webhooks no repositório.</p></div>}
        </div>
        <footer><span role="status">{notice || "As regras ficam separadas por Espaço."}</span><button type="button" onClick={onClose}><Check size={14} /> Concluir</button></footer>
      </section>
    </div>
  );
}

const CHAT_LOAD_TIMEOUT_MS = 10_000;

function withChatLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("chat_load_timeout")), CHAT_LOAD_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function scrollInside(container: HTMLElement | null, target: HTMLElement | null) {
  if (!container || !target) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = container.scrollTop
    + targetRect.top
    - containerRect.top
    - Math.max(0, (container.clientHeight - targetRect.height) / 2);
  container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function MessageRoom({ channel, space, member }: { channel: LabstarChannel; space: CollaborationSpace; member: Member }) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replying, setReplying] = useState<ChannelMessage | null>(null);
  const [editing, setEditing] = useState<ChannelMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChannelMessage } | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadNoticeError, setUploadNoticeError] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickerRef = useRef<HTMLInputElement>(null);

  async function refreshMessages(scroll = false) {
    try {
      const data = await withChatLoadTimeout(listMessages(channel.id));
      setMessages(data);
      setLoadError("");
      if (scroll) requestAnimationFrame(() => {
        const container = messageScrollRef.current;
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
    } catch {
      setLoadError("As mensagens demoraram demais para responder. Você pode continuar navegando e tentar novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setDraft("");
    setFiles([]);
    setReplying(null);
    setEditing(null);
    setEmojiOpen(false);
    setContextMenu(null);
    setLoadError("");
    setUploadNotice("");
    setUploadNoticeError(false);
    setDragActive(false);
    void refreshMessages(true);
    const messageSubscription = subscribeToTable("channel_messages", `channel_id=eq.${channel.id}`, () => void refreshMessages());
    const attachmentSubscription = subscribeToTable("channel_message_attachments", "", () => void refreshMessages());
    return () => {
      unsubscribe(messageSubscription);
      unsubscribe(attachmentSubscription);
    };
  }, [channel.id]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() && !files.length) return;
    setSending(true);
    setUploadNotice("");
    setUploadNoticeError(false);
    try {
      if (editing) {
        await editMessage(editing.id, draft);
      } else {
        await sendMessage({
          channelId: channel.id,
          spaceId: space.id,
          authorId: member.id,
          body: draft,
          replyTo: replying?.id,
          files,
        });
      }
      setDraft("");
      setFiles([]);
      setEditing(null);
      setReplying(null);
      await refreshMessages(true);
    } catch (error) {
      setUploadNotice(chatFileErrorMessage(error));
      setUploadNoticeError(true);
    } finally {
      setSending(false);
    }
  }

  function addFiles(incoming: Iterable<File>, notice = "") {
    if (editing) return;
    try {
      const next = mergeChatFiles(files, incoming);
      setFiles(next);
      setUploadNotice(notice || `${next.length} de ${MAX_CHAT_FILES} arquivos preparados.`);
      setUploadNoticeError(false);
    } catch (error) {
      setUploadNotice(chatFileErrorMessage(error));
      setUploadNoticeError(true);
    }
  }

  function pasteIntoComposer(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (editing) return;
    const clipboardFiles = Array.from(event.clipboardData.files);
    if (clipboardFiles.length) {
      event.preventDefault();
      addFiles(clipboardFiles, "Arquivo colado e preparado para envio.");
      return;
    }
    const attachment = createLargePasteAttachment(event.clipboardData.getData("text/plain"));
    if (!attachment) return;
    event.preventDefault();
    addFiles([attachment], "A colagem grande virou um anexo para manter o chat leve.");
  }

  function openMessageMenu(message: ChannelMessage, x: number, y: number) {
    setEmojiOpen(false);
    setContextMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - 197)),
      y: Math.max(8, Math.min(y, window.innerHeight - 250)),
      message,
    });
  }

  function beginEdit(message: ChannelMessage) {
    setEditing(message);
    setReplying(null);
    setFiles([]);
    setUploadNotice("");
    setDraft(message.body);
    setContextMenu(null);
  }

  const filtered = messages.filter((message) =>
    (!pinnedOnly || message.isPinned)
    && (!messageSearch.trim() || `${message.body} ${message.author?.name ?? ""}`.toLocaleLowerCase().includes(messageSearch.trim().toLocaleLowerCase()))
  );
  const canWrite = member.role !== "viewer" && (channel.type === "text" || member.role === "owner" || member.role === "admin");

  return (
    <section className="message-room">
      <div className="message-toolbar">
        <label><Search size={13} /><input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Buscar nesta conversa" /></label>
        <button className={pinnedOnly ? "active" : ""} onClick={() => setPinnedOnly((value) => !value)}><Pin size={13} /> {pinnedOnly ? "Mostrando fixadas" : "Fixadas"}</button>
        <span>{filtered.length} mensagens</span>
      </div>
      <div ref={messageScrollRef} className="message-scroll">
        <section className="channel-welcome">
          <span>{channel.type === "announcement" ? <Megaphone size={23} /> : channel.type === "rules" ? <ShieldCheck size={23} /> : <Hash size={23} />}</span>
          <h2>Este é o início de #{channel.name}</h2>
          <p>{channel.description || "Registre decisões, compartilhe arquivos e mantenha toda a equipe alinhada."}</p>
        </section>

        {loading ? <div className="message-loading"><LoaderCircle className="spin" /> Carregando mensagens</div> : filtered.map((message) => {
          const reply = message.replyTo ? messages.find((item) => item.id === message.replyTo) : null;
          const primaryRole = message.author?.jobRoles[0];
          const own = message.authorId === member.id;
          const integrationBody = message.author?.name === "Labstar Integrations"
            ? normalizeIntegrationMessageBody(message.body)
            : message.body;
          const githubMessage = message.author?.name === "Labstar Integrations"
            ? parseGithubIntegrationMessage(integrationBody)
            : null;
          return (
            <article
              key={message.id}
              className={`chat-message ${message.isPinned ? "pinned" : ""}`}
              onContextMenu={(event) => {
                event.preventDefault();
                openMessageMenu(message, event.clientX, event.clientY);
              }}
            >
              <Avatar name={message.author?.name ?? "Membro removido"} url={message.author?.avatarUrl} size="md" />
              <div className="message-body">
                {reply && <button className="message-reply-preview" onClick={() => scrollInside(messageScrollRef.current, document.getElementById(`message-${reply.id}`))}><Reply size={11} /> <b>{reply.author?.name}</b><span>{reply.body}</span></button>}
                <header id={`message-${message.id}`}>
                  <strong style={{ color: primaryRole?.color || undefined }}>{message.author?.name ?? "Membro removido"}</strong>
                  {primaryRole && <span className="role-chip" style={{ "--role-color": primaryRole.color } as React.CSSProperties}><Star size={10} fill="currentColor" />{primaryRole.name}</span>}
                  <time>{formatMessageTime(message.createdAt)}</time>
                  {message.editedAt && <em>(editada)</em>}
                  {message.isPinned && <Pin size={11} />}
                </header>
                {githubMessage
                  ? <GithubIntegrationMessage message={githubMessage} />
                  : <DeveloperMessageBody body={integrationBody} />}
                {!!message.attachments.length && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment) => attachment.mimeType.startsWith("image/") ? (
                      <button
                        key={attachment.id}
                        className={`image-attachment ${brokenImages.has(attachment.id) ? "is-broken" : ""}`}
                        type="button"
                        onClick={() => !brokenImages.has(attachment.id) && setImagePreview({ url: attachment.url, name: attachment.fileName })}
                        aria-label={`Visualizar imagem ${attachment.fileName}`}
                      >
                        {!brokenImages.has(attachment.id) && <img
                          src={attachment.url}
                          alt={attachment.fileName}
                          loading="lazy"
                          onError={() => setBrokenImages((current) => new Set(current).add(attachment.id))}
                        />}
                        <span><FileImage size={12} /> <b>{brokenImages.has(attachment.id) ? "Imagem indisponível" : attachment.fileName}</b></span>
                      </button>
                    ) : (
                      <DeveloperAttachmentCard
                        key={attachment.id}
                        fileName={attachment.fileName}
                        mimeType={attachment.mimeType}
                        sizeBytes={attachment.sizeBytes}
                        url={attachment.url}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="message-actions">
                <button title="Responder" onClick={() => { setReplying(message); setEditing(null); }}><Reply size={14} /></button>
                {(own || member.role === "owner" || member.role === "admin") && <button title="Editar" onClick={() => beginEdit(message)}><Pencil size={13} /></button>}
                <button type="button" title="Mais ações" aria-label="Mais ações da mensagem" onClick={(event) => openMessageMenu(message, event.clientX - 170, event.clientY + 8)}><MoreHorizontal size={15} /></button>
              </div>
            </article>
          );
        })}
        {loadError && <div className="message-empty">{loadError} <button type="button" onClick={() => { setLoading(true); void refreshMessages(); }}>Tentar novamente</button></div>}
        {!loading && !filtered.length && messageSearch && <div className="message-empty">Nenhuma mensagem corresponde à busca.</div>}
      </div>

      {canWrite ? (
        <form
          className={`message-composer ${dragActive ? "developer-drop-active" : ""}`}
          onSubmit={submit}
          onDragEnter={(event) => { if (!editing) { event.preventDefault(); setDragActive(true); } }}
          onDragOver={(event) => { if (!editing) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(Array.from(event.dataTransfer.files), "Arquivos soltos e preparados para envio.");
          }}
        >
          {(replying || editing) && (
            <div className="composer-context">
              {editing ? <Edit3 size={13} /> : <Reply size={13} />}
              <span>{editing ? "Editando sua mensagem" : <>Respondendo a <b>{replying?.author?.name}</b></>}</span>
              <button type="button" onClick={() => { setEditing(null); setReplying(null); setDraft(""); }}><X size={14} /></button>
            </div>
          )}
          {!!files.length && <DeveloperFileQueue files={files} onRemove={(index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />}
          {uploadNotice && <p className={`developer-composer-notice ${uploadNoticeError ? "error" : ""}`}>{uploadNotice}</p>}
          <DeveloperComposerTools textareaRef={composerRef} value={draft} onChange={setDraft} disabled={sending} />
          <div className="composer-row">
            <button type="button" disabled={Boolean(editing)} onClick={() => fileRef.current?.click()} title={editing ? "Anexos não mudam durante edição" : `Anexar até ${MAX_CHAT_FILES} arquivos de ${formatChatBytes(MAX_CHAT_FILE_BYTES)}`}><Paperclip size={18} /></button>
            <textarea
              ref={composerRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={pasteIntoComposer}
              onKeyDown={(event) => {
                if (handleDeveloperComposerKeyDown(event, draft, setDraft)) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={editing ? "Edite a mensagem…" : `Conversar em #${channel.name}`}
            />
            <button type="button" onClick={() => stickerRef.current?.click()} title="Escolher figurinha ou imagem do dispositivo"><ImagePlus size={18} /></button>
            <button type="button" className={emojiOpen ? "active" : ""} onClick={() => setEmojiOpen((value) => !value)} title="Emoji"><Smile size={18} /></button>
            <button className="send-message" type="submit" disabled={sending || (!draft.trim() && !files.length)} title="Enviar">
              {sending ? <LoaderCircle className="spin" size={17} /> : editing ? <Save size={17} /> : <Send size={17} />}
            </button>
          </div>
          {emojiOpen && <div className="emoji-picker" role="listbox" aria-label="Emojis disponíveis">{emojiSet.map((emoji) => <button key={emoji} type="button" title={`Inserir ${emoji}`} aria-label={`Inserir emoji ${emoji}`} onClick={() => setDraft((current) => `${current}${emoji}`)}>{emoji}</button>)}</div>}
          <input ref={fileRef} hidden multiple type="file" onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }} />
          <input ref={stickerRef} hidden type="file" accept="image/*,.gif,.webp" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) addFiles([file]);
            event.target.value = "";
          }} />
        </form>
      ) : <div className="read-only-notice"><LockKeyhole size={14} /> Este canal é somente leitura para o seu nível de acesso.</div>}

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { setReplying(contextMenu.message); setEditing(null); setContextMenu(null); }}><Reply size={14} /> Responder</button>
          <button type="button" onClick={() => { const text = contextMenu.message.body.trim() || contextMenu.message.attachments.map((attachment) => attachment.url).join("\n"); void copyToClipboard(text); setContextMenu(null); }}><Copy size={14} /> Copiar texto</button>
          {(contextMenu.message.authorId === member.id || member.role === "owner" || member.role === "admin") && <button onClick={() => beginEdit(contextMenu.message)}><Pencil size={14} /> Editar mensagem</button>}
          <button onClick={async () => { await pinMessage(contextMenu.message.id, !contextMenu.message.isPinned); setContextMenu(null); await refreshMessages(); }}><Pin size={14} /> {contextMenu.message.isPinned ? "Desafixar" : "Fixar mensagem"}</button>
          {(contextMenu.message.authorId === member.id || member.role === "owner" || member.role === "admin") && <button className="danger" onClick={async () => { await deleteMessage(contextMenu.message.id); setContextMenu(null); await refreshMessages(); }}><Trash2 size={14} /> Excluir mensagem</button>}
        </div>
      )}
      {imagePreview && (
        <div className="image-preview-backdrop" role="presentation" onMouseDown={() => setImagePreview(null)}>
          <section className="image-preview" role="dialog" aria-modal="true" aria-label={`Visualização de ${imagePreview.name}`} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><FileImage size={16} /><b>{imagePreview.name}</b></span>
              <div>
                <a href={imagePreview.url} target="_blank" rel="noreferrer" title="Abrir original"><Download size={16} /></a>
                <button type="button" onClick={() => setImagePreview(null)} aria-label="Fechar visualização"><X size={18} /></button>
              </div>
            </header>
            <div><img src={imagePreview.url} alt={imagePreview.name} /></div>
          </section>
        </div>
      )}
    </section>
  );
}

function SocialPlanner({ space, member }: { space: CollaborationSpace; member: Member }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<SocialPost>>({});

  async function refresh() {
    setPosts(await listSocialPosts(space.id));
  }

  useEffect(() => { void refresh(); }, [space.id]);

  function openEditor(post?: SocialPost) {
    const value = post ?? {
      id: "",
      spaceId: space.id,
      title: "",
      content: "",
      platforms: [],
      status: "idea" as const,
      scheduledFor: null,
      ownerId: member.id,
      createdAt: "",
      updatedAt: "",
    };
    setSelected(post ?? null);
    setDraft(value);
    setEditing(true);
  }

  const columns: { status: SocialPost["status"]; label: string }[] = [
    { status: "idea", label: "Ideias" },
    { status: "draft", label: "Produção" },
    { status: "review", label: "Em revisão" },
    { status: "scheduled", label: "Agendados" },
    { status: "published", label: "Publicados" },
  ];

  return (
    <section className="social-planner">
      <header>
        <div><span><Sparkles size={15} /></span><div><strong>Central de conteúdo</strong><small>Planeje o que será publicado em cada rede do {space.name}.</small></div></div>
        <button onClick={() => openEditor()}><Plus size={15} /> Nova publicação</button>
      </header>
      <div className="social-board">
        {columns.map((column) => (
          <section key={column.status} className="social-column">
            <header><strong>{column.label}</strong><span>{posts.filter((post) => post.status === column.status).length}</span></header>
            <div>
              {posts.filter((post) => post.status === column.status).map((post) => (
                <button key={post.id} onClick={() => openEditor(post)}>
                  <small>{post.platforms.length ? post.platforms.join(" · ") : "Rede a definir"}</small>
                  <strong>{post.title}</strong>
                  <p>{post.content || "Sem texto ainda."}</p>
                  {post.scheduledFor && <time><CalendarDays size={11} /> {new Date(post.scheduledFor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>}
                </button>
              ))}
              <button className="add-social-card" onClick={() => openEditor()}><Plus size={14} /> Adicionar</button>
            </div>
          </section>
        ))}
      </div>
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(false)}>
          <form className="work-modal social-editor" onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await saveSocialPost({
                id: selected?.id,
                spaceId: space.id,
                title: String(draft.title ?? ""),
                content: String(draft.content ?? ""),
                platforms: draft.platforms ?? [],
                status: draft.status ?? "idea",
                scheduledFor: draft.scheduledFor ?? null,
              }, member.id);
              setEditing(false);
              await refresh();
            } finally { setSaving(false); }
          }} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span><CalendarDays size={18} /></span><div><strong>{selected ? "Editar publicação" : "Nova publicação"}</strong><small>Planejamento editorial do {space.name}</small></div></div><button type="button" onClick={() => setEditing(false)}><X size={17} /></button></header>
            <label>Título<input required minLength={2} value={draft.title ?? ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Lançamento da nova versão" /></label>
            <label>Texto<textarea rows={6} value={draft.content ?? ""} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Escreva a legenda, roteiro ou ideia…" /></label>
            <div className="form-grid">
              <label>Etapa<select value={draft.status ?? "idea"} onChange={(event) => setDraft({ ...draft, status: event.target.value as SocialPost["status"] })}>{columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}</select></label>
              <label>Agendar para<input type="datetime-local" value={draft.scheduledFor?.slice(0, 16) ?? ""} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
            </div>
            <fieldset><legend>Redes</legend><div className="platform-options">{["instagram", "linkedin", "tiktok", "youtube", "x", "facebook", "threads"].map((platform) => <label key={platform}><input type="checkbox" checked={draft.platforms?.includes(platform) ?? false} onChange={() => setDraft({ ...draft, platforms: draft.platforms?.includes(platform) ? draft.platforms.filter((item) => item !== platform) : [...(draft.platforms ?? []), platform] })} />{platform}</label>)}</div></fieldset>
            <footer>
              {selected && <button type="button" className="danger-text" onClick={async () => { await deleteSocialPost(selected.id); setEditing(false); await refresh(); }}><Trash2 size={14} /> Excluir</button>}
              <button type="button" onClick={() => setEditing(false)}>Cancelar</button>
              <button className="primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} Salvar publicação</button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}

function VoiceRoom({
  channel,
  member,
  members,
  soundEnabled,
}: {
  channel: LabstarChannel;
  member: Member;
  members: Member[];
  soundEnabled: boolean;
}) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [testing, setTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [error, setError] = useState("");
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingDraft, setMeetingDraft] = useState({
    title: "",
    agenda: "",
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    durationMinutes: 45,
    attendeeIds: [] as string[],
  });
  const localStream = useRef<MediaStream | null>(null);
  const testStream = useRef<MediaStream | null>(null);
  const realtime = useRef<ReturnType<NonNullable<typeof supabaseClient>["channel"]> | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const meterContext = useRef<AudioContext | null>(null);
  const meterFrame = useRef<number | null>(null);
  const joinedRef = useRef(false);

  async function refreshMeetings() {
    try {
      setMeetings(await listMeetings(channel.id));
    } catch {
      setMeetings([]);
    }
  }

  useEffect(() => { void refreshMeetings(); }, [channel.id]);

  function sendSignal(payload: Record<string, unknown>) {
    void realtime.current?.send({ type: "broadcast", event: "signal", payload: { ...payload, from: member.id } });
  }

  function stopLevelMeter() {
    if (meterFrame.current !== null) window.cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    if (meterContext.current) void meterContext.current.close().catch(() => undefined);
    meterContext.current = null;
    setMicLevel(0);
  }

  function startLevelMeter(stream: MediaStream) {
    stopLevelMeter();
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    meterContext.current = context;
    const samples = new Uint8Array(analyser.fftSize);
    const measure = () => {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        total += normalized * normalized;
      }
      const rms = Math.sqrt(total / samples.length);
      const level = Math.min(1, Math.max(0, (rms - 0.008) * 8));
      setMicLevel((current) => current * 0.48 + level * 0.52);
      meterFrame.current = window.requestAnimationFrame(measure);
    };
    measure();
  }

  async function refreshAudioInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === "audioinput");
    const cameras = devices.filter((device) => device.kind === "videoinput");
    setAudioInputs(microphones);
    setVideoInputs(cameras);
    setSelectedDeviceId((current) => current || microphones[0]?.deviceId || "");
    setSelectedVideoDeviceId((current) => current || cameras[0]?.deviceId || "");
  }

  function audioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
    };
  }

  function videoConstraints(): MediaTrackConstraints {
    return {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
      ...(selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : {}),
    };
  }

  function stopMicTest(resetMeter = true) {
    testStream.current?.getTracks().forEach((track) => track.stop());
    testStream.current = null;
    setTesting(false);
    if (resetMeter) stopLevelMeter();
  }

  async function toggleMicTest() {
    if (testing) {
      stopMicTest();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
      testStream.current = stream;
      setTesting(true);
      startLevelMeter(stream);
      await refreshAudioInputs();
    } catch (testError) {
      setError(testError instanceof DOMException && testError.name === "NotAllowedError"
        ? "Permita o microfone no navegador para executar o teste."
        : "Não foi possível iniciar o teste do microfone.");
    }
  }

  function ensurePeer(peerId: string, initiate: boolean) {
    if (peers.current.has(peerId)) return peers.current.get(peerId)!;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    localStream.current?.getTracks().forEach((track) => peer.addTrack(track, localStream.current!));
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ to: peerId, kind: "candidate", candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => setRemoteStreams((current) => new Map(current).set(peerId, event.streams[0]));
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        peers.current.delete(peerId);
        setRemoteStreams((current) => {
          const next = new Map(current);
          next.delete(peerId);
          return next;
        });
      }
    };
    peers.current.set(peerId, peer);
    if (initiate) {
      void peer.createOffer().then(async (offer) => {
        await peer.setLocalDescription(offer);
        sendSignal({ to: peerId, kind: "offer", sdp: offer });
      });
    }
    return peer;
  }

  async function join(withVideo = false) {
    if (!supabaseClient || joining || joined) return;
    setError("");
    setJoining(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("microphone_unavailable");
      }
      stopMicTest();
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(),
        video: withVideo ? videoConstraints() : false,
      });
      setCameraOn(localStream.current.getVideoTracks().length > 0);
      startLevelMeter(localStream.current);
      await refreshAudioInputs();
      await supabaseClient.realtime.setAuth();
      const room = supabaseClient.channel(`voice:${channel.id}`, { config: { private: true, presence: { key: member.id } } });
      realtime.current = room;
      room
        .on("presence", { event: "sync" }, () => {
          const ids = Object.keys(room.presenceState()).filter((id) => id !== member.id);
          setParticipants([member.id, ...ids]);
          ids.forEach((id) => ensurePeer(id, member.id.localeCompare(id) < 0));
        })
        .on("broadcast", { event: "signal" }, async ({ payload }) => {
          if (payload.to !== member.id || payload.from === member.id) return;
          const peerId = String(payload.from);
          const peer = ensurePeer(peerId, false);
          if (payload.kind === "offer") {
            await peer.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSignal({ to: peerId, kind: "answer", sdp: answer });
          } else if (payload.kind === "answer") {
            await peer.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
          } else if (payload.kind === "candidate") {
            await peer.addIceCandidate(payload.candidate as RTCIceCandidateInit);
          }
        });
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("realtime_timeout")), 12000);
        room.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeout);
            await room.track({ memberId: member.id, name: member.name, joinedAt: new Date().toISOString() });
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            window.clearTimeout(timeout);
            reject(new Error(status));
          }
        });
      });
      setParticipants((current) => current.includes(member.id) ? current : [member.id, ...current]);
      setJoined(true);
      joinedRef.current = true;
      playVoiceCue("join", soundEnabled);
    } catch (joinError) {
      stopLevelMeter();
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      if (realtime.current && supabaseClient) void supabaseClient.removeChannel(realtime.current);
      realtime.current = null;
      setError(joinError instanceof DOMException && joinError.name === "NotAllowedError"
        ? "O microfone ou a câmera foi bloqueado. Clique no cadeado do navegador e permita o acesso para a Labstar."
        : "Não foi possível conectar à sala. Verifique a internet e tente novamente.");
    } finally {
      setJoining(false);
    }
  }

  function leave(withSound = true) {
    const wasJoined = joinedRef.current;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    stopMicTest(false);
    stopLevelMeter();
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    setRemoteStreams(new Map());
    if (realtime.current && supabaseClient) void supabaseClient.removeChannel(realtime.current);
    realtime.current = null;
    setParticipants([]);
    setJoined(false);
    joinedRef.current = false;
    setMuted(false);
    setDeafened(false);
    setCameraOn(false);
    if (wasJoined && withSound) playVoiceCue("leave", soundEnabled);
  }

  useEffect(() => () => leave(false), [channel.id]);

  function toggleMute() {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  function renegotiateVideo() {
    peers.current.forEach((peer, peerId) => {
      void peer.createOffer().then(async (offer) => {
        await peer.setLocalDescription(offer);
        sendSignal({ to: peerId, kind: "offer", sdp: offer });
      }).catch(() => undefined);
    });
  }

  async function toggleCamera() {
    setError("");
    if (cameraOn) {
      const videoTracks = localStream.current?.getVideoTracks() ?? [];
      videoTracks.forEach((track) => {
        localStream.current?.removeTrack(track);
        track.stop();
      });
      peers.current.forEach((peer) => {
        peer.getSenders().filter((sender) => sender.track?.kind === "video").forEach((sender) => peer.removeTrack(sender));
      });
      setCameraOn(false);
      renegotiateVideo();
      return;
    }
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints() });
      const track = cameraStream.getVideoTracks()[0];
      if (!track || !localStream.current) return;
      localStream.current.addTrack(track);
      peers.current.forEach((peer) => peer.addTrack(track, localStream.current!));
      setCameraOn(true);
      await refreshAudioInputs();
      renegotiateVideo();
    } catch (cameraError) {
      setError(cameraError instanceof DOMException && cameraError.name === "NotAllowedError"
        ? "A câmera foi bloqueada. Permita o acesso nas configurações do navegador."
        : "Não foi possível ligar a câmera.");
    }
  }

  return (
    <section className="voice-room">
      <div className="voice-hero">
        <span><Volume2 size={28} /></span>
        <small>SALA DE REUNIÃO</small>
        <h2>{channel.name}</h2>
        <p>{channel.description || "Converse por voz com as pessoas autorizadas para este espaço."}</p>
        {!joined && (
          <div className={`voice-test ${testing ? "active" : ""}`}>
            <div className="voice-test-heading"><AudioLines size={17} /><div><strong>Teste de voz</strong><small>{testing ? "Fale normalmente para conferir sua entrada." : "Confirme o microfone antes de entrar."}</small></div></div>
            <AudioLevelBars level={testing ? micLevel : 0} />
            <div className="voice-test-footer">
              <span>{testing ? (micLevel > .08 ? "Sua voz está sendo detectada" : "Aguardando sua voz…") : "O áudio não é gravado nem enviado."}</span>
              <button type="button" className={testing ? "stop" : ""} onClick={() => void toggleMicTest()}>{testing ? <X size={13} /> : <Mic size={13} />}{testing ? "Encerrar teste" : "Testar microfone"}</button>
            </div>
            {audioInputs.length > 1 && <label>Dispositivo de entrada<select value={selectedDeviceId} onChange={(event) => { stopMicTest(); setSelectedDeviceId(event.target.value); }}>{audioInputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>}
          </div>
        )}
        {!joined ? <div className="voice-entry-actions"><button onClick={() => void join(false)} disabled={joining}>{joining ? <LoaderCircle className="spin" size={17} /> : <Mic size={17} />} {joining ? "Conectando…" : "Entrar por voz"}</button><button onClick={() => void join(true)} disabled={joining}><Camera size={17} /> Entrar com vídeo</button><button className="secondary" onClick={() => setMeetingOpen(true)}><CalendarDays size={17} /> Agendar reunião</button></div> : (
          <>
            {cameraOn && localStream.current && <MeetingVideo stream={localStream.current} label={`${member.name} (você)`} local />}
            <div className="voice-live-level"><AudioLevelBars level={muted ? 0 : micLevel} compact /><span>{muted ? "Microfone silenciado" : micLevel > .08 ? "Sua voz está saindo" : "Microfone conectado"}</span></div>
            <div className="voice-controls">
              <button className={muted ? "danger" : ""} onClick={toggleMute}>{muted ? <MicOff size={18} /> : <Mic size={18} />}<span>{muted ? "Ativar microfone" : "Silenciar"}</span></button>
              <button className={cameraOn ? "" : "danger"} onClick={() => void toggleCamera()}>{cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}<span>{cameraOn ? "Desligar câmera" : "Ligar câmera"}</span></button>
              <button className={deafened ? "danger" : ""} onClick={() => setDeafened((value) => !value)}>{deafened ? <VolumeX size={18} /> : <Volume2 size={18} />}<span>{deafened ? "Ouvir áudio" : "Desativar áudio"}</span></button>
              <button className="leave" onClick={() => leave()}><X size={18} /><span>Sair</span></button>
            </div>
          </>
        )}
        {error && <em>{error}</em>}
      </div>
      <div className="voice-participants">
        <header><strong>Na sala</strong><span>{participants.length}</span></header>
        <div>
          {participants.map((id) => {
            const person = members.find((item) => item.id === id) ?? (id === member.id ? member : null);
            return person && <article key={id}><Avatar name={person.name} url={person.avatarUrl} size="lg" status={id === member.id ? undefined : "online"} /><strong>{person.name}{id === member.id ? " (você)" : ""}</strong><small>{person.jobRoles[0]?.name || person.jobTitle || "Membro"}</small>{id === member.id && muted ? <MicOff size={14} /> : <Mic size={14} />}</article>;
          })}
          {!participants.length && <p>Ninguém entrou ainda.</p>}
        </div>
      </div>
      {remoteStreams.size > 0 && (
        <section className="meeting-video-grid">
          {[...remoteStreams.entries()].map(([peerId, stream]) => {
            const person = members.find((item) => item.id === peerId);
            return <MeetingVideo key={peerId} stream={stream} label={person?.name || "Participante"} muted={deafened} />;
          })}
        </section>
      )}
      <section className="meeting-schedule">
        <header><div><strong>Próximas reuniões</strong><small>Horários salvos para este canal</small></div><button onClick={() => setMeetingOpen(true)}><Plus size={14} /> Agendar</button></header>
        <div>
          {meetings.map((meeting) => (
            <article key={meeting.id}>
              <time><b>{new Date(meeting.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</b><span>{new Date(meeting.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></time>
              <div><strong>{meeting.title}</strong><small>{meeting.agenda || `${meeting.durationMinutes} minutos`}</small></div>
              <span><Users size={13} /> {meeting.attendeeIds.length || members.filter((item) => item.status === "active").length}</span>
              <button onClick={() => void join(false)}><Mic size={14} /> Entrar</button>
              {(member.role === "owner" || member.role === "admin" || meeting.createdBy === member.id) && <button className="cancel-meeting" title="Cancelar reunião" onClick={async () => { await cancelMeeting(meeting.id); await refreshMeetings(); }}><Trash2 size={14} /></button>}
            </article>
          ))}
          {!meetings.length && <p>Nenhuma reunião agendada. Você ainda pode entrar na sala a qualquer momento.</p>}
        </div>
      </section>
      {meetingOpen && (
        <div className="modal-backdrop" onMouseDown={() => setMeetingOpen(false)}>
          <form className="work-modal meeting-modal" onSubmit={async (event) => {
            event.preventDefault();
            await createMeeting({
              channelId: channel.id,
              title: meetingDraft.title,
              agenda: meetingDraft.agenda,
              startsAt: new Date(meetingDraft.startsAt).toISOString(),
              durationMinutes: meetingDraft.durationMinutes,
              createdBy: member.id,
              attendeeIds: meetingDraft.attendeeIds,
            });
            setMeetingOpen(false);
            setMeetingDraft({ title: "", agenda: "", startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16), durationMinutes: 45, attendeeIds: [] });
            await refreshMeetings();
          }} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span><CalendarDays size={18} /></span><div><strong>Agendar reunião</strong><small>Todos os dados ficam vinculados a #{channel.name}</small></div></div><button type="button" onClick={() => setMeetingOpen(false)}><X size={17} /></button></header>
            <label>Título<input required minLength={2} value={meetingDraft.title} onChange={(event) => setMeetingDraft({ ...meetingDraft, title: event.target.value })} placeholder="Ex.: Revisão semanal do produto" /></label>
            <label>Pauta<textarea rows={3} value={meetingDraft.agenda} onChange={(event) => setMeetingDraft({ ...meetingDraft, agenda: event.target.value })} placeholder="Assuntos e decisões esperadas" /></label>
            <div className="form-grid"><label>Data e horário<input required type="datetime-local" value={meetingDraft.startsAt} onChange={(event) => setMeetingDraft({ ...meetingDraft, startsAt: event.target.value })} /></label><label>Duração<select value={meetingDraft.durationMinutes} onChange={(event) => setMeetingDraft({ ...meetingDraft, durationMinutes: Number(event.target.value) })}><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={45}>45 minutos</option><option value={60}>1 hora</option><option value={90}>1h30</option></select></label></div>
            <fieldset><legend>Participantes</legend><div className="meeting-attendees">{members.filter((item) => item.status === "active").map((person) => <label key={person.id}><input type="checkbox" checked={meetingDraft.attendeeIds.includes(person.id)} onChange={() => setMeetingDraft({ ...meetingDraft, attendeeIds: meetingDraft.attendeeIds.includes(person.id) ? meetingDraft.attendeeIds.filter((id) => id !== person.id) : [...meetingDraft.attendeeIds, person.id] })} /><Avatar name={person.name} url={person.avatarUrl} size="xs" /><span>{person.name}</span></label>)}</div></fieldset>
            <footer><button type="button" onClick={() => setMeetingOpen(false)}>Cancelar</button><button className="primary" type="submit"><CalendarDays size={14} /> Agendar e avisar</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}

function AudioLevelBars({ level, compact = false }: { level: number; compact?: boolean }) {
  const bars = compact ? 9 : 14;
  return (
    <div
      className={`audio-level-bars ${compact ? "compact" : ""}`}
      role="meter"
      aria-label="Nível de entrada do microfone"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
    >
      {Array.from({ length: bars }, (_, index) => {
        const energy = Math.max(.12, Math.min(1, level * bars - index + .22));
        return <i key={index} style={{ opacity: .2 + energy * .8, transform: `scaleY(${.28 + energy * .72})` }} />;
      })}
    </div>
  );
}

function playVoiceCue(kind: "join" | "leave", enabled: boolean) {
  if (!enabled) return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.setValueAtTime(.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.045, context.currentTime + .018);
  gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .28);
  gain.connect(context.destination);
  const notes = kind === "join" ? [660, 880] : [880, 590];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * .075);
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * .075);
    oscillator.stop(context.currentTime + .2 + index * .075);
  });
  window.setTimeout(() => void context.close(), 420);
}

function MeetingVideo({ stream, label, local = false, muted = false }: { stream: MediaStream; label: string; local?: boolean; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = stream.getVideoTracks().length > 0;
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  async function openPictureInPicture() {
    if (!ref.current || !hasVideo || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === ref.current) await document.exitPictureInPicture();
      else await ref.current.requestPictureInPicture();
    } catch {
      // O navegador pode recusar PiP sem um gesto válido ou enquanto o vídeo carrega.
    }
  }
  return (
    <article className={`meeting-video ${hasVideo ? "" : "audio-only"}`}>
      <video ref={ref} autoPlay playsInline muted={local || muted} />
      <div><strong>{label}</strong>{hasVideo && document.pictureInPictureEnabled && <button type="button" onClick={() => void openPictureInPicture()} title="Manter vídeo em uma janela flutuante"><PictureInPicture2 size={15} /> Janela flutuante</button>}</div>
    </article>
  );
}

function CollaborationModal({
  modal,
  spaces,
  member,
  onClose,
  onCreated,
}: {
  modal: Exclude<CreateModal, null>;
  spaces: CollaborationSpace[];
  member: Member;
  onClose: () => void;
  onCreated: () => void;
}) {
  const space = modal.type === "space-settings" ? spaces.find((item) => item.id === modal.spaceId) : null;
  const [name, setName] = useState(space?.name ?? "");
  const [description, setDescription] = useState(space?.description ?? "");
  const [kind, setKind] = useState<CollaborationSpace["kind"]>(space?.kind ?? "project");
  const [color, setColor] = useState(space?.color ?? "#8baeff");
  const [channelType, setChannelType] = useState<LabstarChannel["type"]>("text");
  const [logo, setLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const title = modal.type === "space" ? "Criar espaço" : modal.type === "category" ? "Nova categoria" : modal.type === "channel" ? "Criar canal" : "Configurar espaço";
  const subtitle = modal.type === "space" ? "Empresa, produto, projeto ou equipe" : modal.type === "category" ? "Agrupe canais por assunto" : modal.type === "channel" ? "Conversa, aviso, regras, voz ou social" : "Identidade e organização";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (modal.type === "space") {
        const created = await createSpace({ name, description, kind, color }, member.id);
        if (logo) await uploadSpaceLogo(String(created.id), logo);
      } else if (modal.type === "category") {
        await createCategory(modal.spaceId, name);
      } else if (modal.type === "channel") {
        await createChannel({ spaceId: modal.spaceId, categoryId: modal.categoryId, name, description, type: channelType, createdBy: member.id });
      } else {
        await updateSpace(modal.spaceId, { name, description, kind, color });
        if (logo) await uploadSpaceLogo(modal.spaceId, logo);
      }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="work-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>{modal.type === "category" ? <FolderPlus size={18} /> : modal.type === "channel" ? <Hash size={18} /> : <Star size={18} />}</span><div><strong>{title}</strong><small>{subtitle}</small></div></div>
          <button type="button" onClick={onClose}><X size={17} /></button>
        </header>
        {(modal.type === "space" || modal.type === "space-settings") && (
          <button type="button" className="logo-upload" onClick={() => logoRef.current?.click()}>
            <span style={{ "--space-color": color } as React.CSSProperties}>{logo ? <img src={URL.createObjectURL(logo)} alt="" /> : space?.logoUrl ? <img src={space.logoUrl} alt="" /> : <Star size={21} />}</span>
            <div><strong>{logo ? logo.name : "Logo do espaço"}</strong><small>PNG, JPG, GIF ou WebP · até 5 MB</small></div>
            <Upload size={16} />
            <input ref={logoRef} hidden type="file" accept="image/*" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} />
          </button>
        )}
        <label>{modal.type === "channel" ? "Nome do canal" : modal.type === "category" ? "Nome da categoria" : "Nome"}<input required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder={modal.type === "channel" ? "ex.: desenvolvimento" : "Nome"} /></label>
        {modal.type !== "category" && <label>Descrição<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explique a finalidade deste espaço…" /></label>}
        {(modal.type === "space" || modal.type === "space-settings") && <div className="form-grid"><label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as CollaborationSpace["kind"])}><option value="company">Empresa</option><option value="product">Produto</option><option value="project">Projeto</option><option value="team">Equipe</option></select></label><label>Cor<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div>}
        {modal.type === "channel" && <label>Tipo de canal<select value={channelType} onChange={(event) => setChannelType(event.target.value as LabstarChannel["type"])}><option value="text">Conversa</option><option value="announcement">Avisos</option><option value="rules">Regras</option><option value="voice">Reunião por voz</option><option value="social">Planejamento social</option></select></label>}
        <footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} {modal.type === "space-settings" ? "Salvar alterações" : "Criar"}</button></footer>
      </form>
    </div>
  );
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `hoje às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
