import {
  Bell,
  Camera,
  Check,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mic2,
  Palette,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_APP_SETTINGS,
  resetAppSettings,
  saveAppSettings,
  type AppSettings,
} from "../lib/app-settings";
import { secureSignOut } from "../lib/access";
import {
  removeOwnAvatar,
  updateOwnProfile,
  uploadOwnAvatar,
  type Member,
} from "../lib/supabase";
import { Avatar } from "./Avatar";

type SettingsTab = "general" | "account" | "appearance" | "notifications" | "media" | "security";

type Props = {
  member: Member;
  settings: AppSettings;
  onClose: () => void;
  onSettingsChanged: (settings: AppSettings) => void;
  onMemberUpdated: (member: Member) => void;
  onSoundChanged: (enabled: boolean) => void;
  onNavigate: (view: "mapa" | "visao" | "colaboracao" | "equipe") => void;
};

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings }> = [
  { id: "general", label: "Geral", icon: Settings },
  { id: "account", label: "Conta e perfil", icon: UserRound },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "media", label: "Áudio e vídeo", icon: Video },
  { id: "security", label: "Segurança", icon: ShieldCheck },
];

export function GlobalSettings({
  member,
  settings,
  onClose,
  onSettingsChanged,
  onMemberUpdated,
  onSoundChanged,
  onNavigate,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [draft, setDraft] = useState(settings);
  const [profileName, setProfileName] = useState(member.name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [mediaStatus, setMediaStatus] = useState("");
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => setProfileName(member.name), [member.name]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function persist(next = draft) {
    setSaving(true);
    setStatus("Salvando configurações...");
    try {
      const saved = await saveAppSettings(next);
      setDraft(saved);
      onSettingsChanged(saved);
      onSoundChanged(saved.interfaceSounds);
      setStatus("Configurações salvas");
    } catch {
      setStatus("Não foi possível salvar as configurações");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setStatus("Salvando perfil...");
    try {
      const updated = await updateOwnProfile(member.id, profileName);
      onMemberUpdated(updated);
      setStatus("Perfil atualizado");
    } catch {
      setStatus("Não foi possível atualizar o perfil");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setSaving(true);
    setStatus("Enviando nova foto...");
    try {
      const updated = await uploadOwnAvatar(member.id, file);
      onMemberUpdated(updated);
      setStatus("Foto atualizada");
    } catch (error) {
      setStatus((error as Error)?.message === "image_too_large"
        ? "A imagem deve ter no máximo 5 MB"
        : "Não foi possível atualizar a foto");
    } finally {
      setSaving(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!member.avatarPath) return;
    setSaving(true);
    setStatus("Removendo foto...");
    try {
      const updated = await removeOwnAvatar(member.id, member.avatarPath);
      onMemberUpdated(updated);
      setStatus("Foto removida");
    } catch {
      setStatus("Não foi possível remover a foto");
    } finally {
      setSaving(false);
    }
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      setStatus("Este dispositivo não oferece notificações do navegador");
      return;
    }
    const result = await Notification.requestPermission();
    const next = { ...draft, desktopNotifications: result === "granted" };
    setDraft(next);
    await persist(next);
    setStatus(result === "granted" ? "Notificações do dispositivo liberadas" : "Notificações do dispositivo não foram liberadas");
  }

  async function loadMediaDevices() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaStatus("Este dispositivo não oferece acesso de mídia compatível");
      return;
    }
    setMediaStatus("Solicitando permissão para microfone e câmera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter((device) => device.kind === "audioinput"));
      setCameras(devices.filter((device) => device.kind === "videoinput"));
      setMediaStatus("Dispositivos detectados");
    } catch {
      setMediaStatus("Permissão de microfone/câmera negada ou dispositivo indisponível");
    }
  }

  async function testDevice(kind: "audio" | "video") {
    if (!navigator.mediaDevices?.getUserMedia) return;
    setMediaStatus(kind === "audio" ? "Testando microfone..." : "Testando câmera...");
    const deviceId = kind === "audio" ? draft.preferredMicrophone : draft.preferredCamera;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: kind === "audio" ? (deviceId ? { deviceId: { exact: deviceId } } : true) : false,
        video: kind === "video" ? (deviceId ? { deviceId: { exact: deviceId } } : true) : false,
      });
      const track = kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
      const label = track?.label || (kind === "audio" ? "Microfone" : "Câmera");
      stream.getTracks().forEach((item) => item.stop());
      setMediaStatus(`${label} respondeu corretamente`);
    } catch {
      setMediaStatus(kind === "audio" ? "O microfone selecionado não respondeu" : "A câmera selecionada não respondeu");
    }
  }

  async function resetPreferences() {
    setSaving(true);
    setStatus("Restaurando preferências...");
    try {
      const restored = await resetAppSettings();
      setDraft(restored);
      onSettingsChanged(restored);
      onSoundChanged(restored.interfaceSounds);
      setStatus("Preferências restauradas");
    } catch {
      setStatus("Não foi possível restaurar as preferências");
    } finally {
      setSaving(false);
    }
  }

  async function clearInterfaceCache() {
    setStatus("Limpando cache de interface...");
    try {
      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }
      setStatus("Cache de interface limpo. A sessão foi preservada.");
    } catch {
      setStatus("Não foi possível limpar todo o cache de interface");
    }
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="global-settings-backdrop" onMouseDown={onClose}>
      <section className="global-settings" role="dialog" aria-modal="true" aria-label="Configurações do Labstar" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="global-settings-nav">
          <div className="global-settings-brand"><span>★</span><div><strong>LABSTAR</strong><small>Configurações</small></div></div>
          <nav>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} className={tab === id ? "active" : ""} type="button" onClick={() => setTab(id)}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
          <div className="global-settings-nav-foot">
            <button type="button" onClick={() => { onNavigate("colaboracao"); onClose(); }}><LayoutDashboard size={15} /> Central de trabalho</button>
          </div>
        </aside>

        <main className="global-settings-content">
          <header className="global-settings-head">
            <div><small>CONFIGURAÇÃO GLOBAL</small><h2>{tabs.find((item) => item.id === tab)?.label}</h2></div>
            <button type="button" onClick={onClose} aria-label="Fechar configurações"><X size={18} /></button>
          </header>

          {tab === "general" && (
            <div className="settings-sections">
              <SettingsSection title="Inicialização" description="Defina onde o Labstar abre e como ações importantes se comportam.">
                <SettingsField label="Tela inicial">
                  <select value={draft.startView} onChange={(event) => update("startView", event.target.value as AppSettings["startView"])}>
                    <option value="colaboracao">Central de trabalho</option>
                    <option value="visao">Visão geral</option>
                    <option value="mapa">Mapa da organização</option>
                    <option value="equipe">Equipe</option>
                  </select>
                </SettingsField>
                <Toggle label="Confirmar ações destrutivas" description="Pedir confirmação antes de exclusões e ações irreversíveis." checked={draft.confirmDestructiveActions} onChange={(value) => update("confirmDestructiveActions", value)} />
              </SettingsSection>
              <SettingsSection title="Som da interface" description="Preferência global para feedback sonoro do aplicativo.">
                <Toggle label="Sons da interface" description="Cliques, entrada em salas e feedbacks do Labstar." checked={draft.interfaceSounds} onChange={(value) => update("interfaceSounds", value)} icon={<Volume2 size={15} />} />
                <Toggle label="Sons de mensagens" description="Alertas de mensagens e menções." checked={draft.messageSounds} onChange={(value) => update("messageSounds", value)} />
              </SettingsSection>
            </div>
          )}

          {tab === "account" && (
            <div className="settings-sections">
              <SettingsSection title="Perfil" description="Estas informações representam você em todo o Labstar.">
                <div className="settings-profile-row">
                  <Avatar name={member.name} url={member.avatarUrl} size="xl" />
                  <div><strong>{member.name}</strong><span>{member.email}</span><small>{member.jobTitle || member.role} · {member.area || "Área não definida"}</small></div>
                  <div className="settings-profile-actions">
                    <input ref={avatarInput} hidden type="file" accept="image/*" onChange={(event) => void uploadAvatar(event.target.files?.[0])} />
                    <button type="button" onClick={() => avatarInput.current?.click()} disabled={saving}><Upload size={14} /> Trocar foto</button>
                    <button type="button" onClick={() => void removeAvatar()} disabled={saving || !member.avatarPath}><Trash2 size={14} /> Remover</button>
                  </div>
                </div>
                <SettingsField label="Nome exibido"><input value={profileName} maxLength={100} onChange={(event) => setProfileName(event.target.value)} /></SettingsField>
                <SettingsField label="E-mail"><input value={member.email} readOnly /></SettingsField>
                <div className="settings-inline-actions"><button type="button" onClick={() => void saveProfile()} disabled={saving || profileName.trim().length < 2}><Save size={14} /> Salvar perfil</button></div>
              </SettingsSection>
            </div>
          )}

          {tab === "appearance" && (
            <div className="settings-sections">
              <SettingsSection title="Interface" description="Ajustes visuais aplicados no aplicativo inteiro.">
                <SettingsField label="Densidade">
                  <select value={draft.density} onChange={(event) => update("density", event.target.value as AppSettings["density"])}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></select>
                </SettingsField>
                <SettingsField label="Nebulosas">
                  <select value={draft.nebulaIntensity} onChange={(event) => update("nebulaIntensity", event.target.value as AppSettings["nebulaIntensity"])}><option value="off">Desativadas</option><option value="subtle">Discretas</option><option value="visible">Mais visíveis</option></select>
                </SettingsField>
                <Toggle label="Reduzir movimento" description="Desativa animações decorativas e loaders animados quando possível." checked={draft.reducedMotion} onChange={(value) => update("reducedMotion", value)} />
              </SettingsSection>
            </div>
          )}

          {tab === "notifications" && (
            <div className="settings-sections">
              <SettingsSection title="Alertas" description="Controle o que pode chamar sua atenção fora da conversa atual.">
                <Toggle label="Notificações do dispositivo" description="Permite alertas nativos quando o sistema autorizar." checked={draft.desktopNotifications} onChange={(value) => update("desktopNotifications", value)} />
                <Toggle label="Menções" description="Destacar notificações que citam você diretamente." checked={draft.mentionNotifications} onChange={(value) => update("mentionNotifications", value)} />
                <div className="settings-inline-actions"><button type="button" onClick={() => void requestNotificationPermission()}><Bell size={14} /> Verificar permissão do dispositivo</button></div>
              </SettingsSection>
            </div>
          )}

          {tab === "media" && (
            <div className="settings-sections">
              <SettingsSection title="Dispositivos" description="Escolha e teste microfone e câmera antes de entrar em uma sala.">
                <div className="settings-inline-actions"><button type="button" onClick={() => void loadMediaDevices()}><Camera size={14} /> Detectar dispositivos</button></div>
                <SettingsField label="Microfone">
                  <select value={draft.preferredMicrophone} onChange={(event) => update("preferredMicrophone", event.target.value)}>
                    <option value="">Padrão do sistema</option>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}
                  </select>
                </SettingsField>
                <SettingsField label="Câmera">
                  <select value={draft.preferredCamera} onChange={(event) => update("preferredCamera", event.target.value)}>
                    <option value="">Padrão do sistema</option>{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}
                  </select>
                </SettingsField>
                <div className="settings-inline-actions"><button type="button" onClick={() => void testDevice("audio")}><Mic2 size={14} /> Testar microfone</button><button type="button" onClick={() => void testDevice("video")}><Video size={14} /> Testar câmera</button></div>
                {mediaStatus && <p className="settings-status">{mediaStatus}</p>}
              </SettingsSection>
            </div>
          )}

          {tab === "security" && (
            <div className="settings-sections">
              <SettingsSection title="Sessão e dados locais" description="Ações de segurança do dispositivo atual.">
                <div className="settings-security-card"><LockKeyhole size={18} /><div><strong>Sessão protegida</strong><span>Autorização de equipe validada pelo backend Rust. Limpar cache não apaga sua sessão.</span></div></div>
                <div className="settings-inline-actions"><button type="button" onClick={() => void clearInterfaceCache()}><RotateCcw size={14} /> Limpar cache de interface</button><button type="button" onClick={() => void resetPreferences()}><RotateCcw size={14} /> Restaurar preferências</button></div>
                <button className="settings-danger" type="button" onClick={() => void secureSignOut()}><LogOut size={14} /> Sair desta conta</button>
              </SettingsSection>
            </div>
          )}

          <footer className="global-settings-footer">
            <span className={status.includes("Não") ? "error" : ""}>{status || "Alterações de preferências são salvas somente quando você confirmar."}</span>
            {tab !== "account" && tab !== "security" && <button type="button" onClick={() => void persist()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Salvar configurações</button>}
          </footer>
        </main>
      </section>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="settings-section"><header><strong>{title}</strong><p>{description}</p></header><div className="settings-section-body">{children}</div></section>;
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="settings-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, description, checked, onChange, icon }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; icon?: React.ReactNode }) {
  return <label className="settings-toggle"><span className="settings-toggle-copy">{icon}<span><strong>{label}</strong><small>{description}</small></span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
