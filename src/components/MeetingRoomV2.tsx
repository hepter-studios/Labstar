import {
  AudioLines,
  CalendarDays,
  Camera,
  CameraOff,
  Check,
  Copy,
  Crown,
  Hand,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PictureInPicture2,
  Send,
  ShieldCheck,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelMeeting,
  createMeeting,
  listMeetings,
  supabaseClient,
  type LabstarChannel,
  type Member,
  type ScheduledMeeting,
} from "../lib/supabase";
import { Avatar } from "./Avatar";

type Props = {
  channel: LabstarChannel;
  member: Member;
  members: Member[];
  soundEnabled: boolean;
};

type PresenceInfo = {
  memberId: string;
  name: string;
  joinedAt: string;
  muted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  handRaised: boolean;
};

type RoomMessage = {
  id: string;
  memberId: string;
  name: string;
  body: string;
  createdAt: string;
};

type RoomControlAction = "mute" | "remove";

const TURN_URL = String(import.meta.env.VITE_WEBRTC_TURN_URL ?? "").trim();
const TURN_USERNAME = String(import.meta.env.VITE_WEBRTC_TURN_USERNAME ?? "").trim();
const TURN_CREDENTIAL = String(import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL ?? "").trim();

function rtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  if (TURN_URL) {
    iceServers.push({
      urls: TURN_URL.split(",").map((value) => value.trim()).filter(Boolean),
      ...(TURN_USERNAME ? { username: TURN_USERNAME } : {}),
      ...(TURN_CREDENTIAL ? { credential: TURN_CREDENTIAL } : {}),
    });
  }
  return { iceServers };
}

async function copyText(value: string) {
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

function AudioLevelBars({ level, compact = false }: { level: number; compact?: boolean }) {
  const bars = compact ? 8 : 13;
  return (
    <div className={`meeting-v2-level ${compact ? "compact" : ""}`} role="meter" aria-label="Nível do microfone" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: bars }, (_, index) => {
        const energy = Math.max(.1, Math.min(1, level * bars - index + .18));
        return <i key={index} style={{ opacity: .18 + energy * .82, transform: `scaleY(${.25 + energy * .75})` }} />;
      })}
    </div>
  );
}

function VideoTile({
  stream,
  person,
  local = false,
  muted = false,
  sharing = false,
  host = false,
  handRaised = false,
}: {
  stream: MediaStream;
  person: Pick<Member, "name" | "avatarUrl">;
  local?: boolean;
  muted?: boolean;
  sharing?: boolean;
  host?: boolean;
  handRaised?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = stream.getVideoTracks().some((track) => track.readyState === "live");

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream;
  }, [stream]);

  async function openPiP() {
    const video = videoRef.current;
    if (!video || !hasVideo || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Alguns navegadores exigem que o vídeo já esteja reproduzindo.
    }
  }

  return (
    <article className={`meeting-v2-tile ${sharing ? "sharing" : ""} ${hasVideo ? "has-video" : "audio-only"}`}>
      <video ref={videoRef} autoPlay playsInline muted={local || muted} />
      {!hasVideo && (
        <div className="meeting-v2-avatar-fallback">
          <Avatar name={person.name} url={person.avatarUrl} size="xl" status="online" />
        </div>
      )}
      <div className="meeting-v2-tile-meta">
        <span>
          <strong>{person.name}{local ? " (você)" : ""}</strong>
          {sharing && <em><MonitorUp size={11} /> compartilhando tela</em>}
          {host && <em><Crown size={11} /> anfitrião</em>}
          {handRaised && <em><Hand size={11} /> mão levantada</em>}
        </span>
        {hasVideo && document.pictureInPictureEnabled && (
          <button type="button" onClick={() => void openPiP()} title="Abrir vídeo sobre outros aplicativos">
            <PictureInPicture2 size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

export function MeetingRoomV2({ channel, member, members, soundEnabled }: Props) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [compact, setCompact] = useState(false);
  const [testing, setTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [presence, setPresence] = useState<Map<string, PresenceInfo>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [roomMessages, setRoomMessages] = useState<RoomMessage[]>([]);
  const [roomDraft, setRoomDraft] = useState("");
  const [notice, setNotice] = useState("");
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
  const screenStream = useRef<MediaStream | null>(null);
  const testStream = useRef<MediaStream | null>(null);
  const realtime = useRef<ReturnType<NonNullable<typeof supabaseClient>["channel"]> | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const meterContext = useRef<AudioContext | null>(null);
  const meterFrame = useRef<number | null>(null);
  const joinedRef = useRef(false);
  const hostRef = useRef("");
  const localPresence = useRef<PresenceInfo>({
    memberId: member.id,
    name: member.name,
    joinedAt: "",
    muted: false,
    cameraOn: false,
    screenSharing: false,
    handRaised: false,
  });

  const participantIds = useMemo(() => {
    const ids = [...presence.keys()];
    if (joined && !ids.includes(member.id)) ids.unshift(member.id);
    return ids;
  }, [joined, member.id, presence]);

  const hostId = useMemo(() => {
    if (!participantIds.length) return "";
    const rank = (id: string) => {
      const person = members.find((item) => item.id === id) ?? (id === member.id ? member : null);
      return person?.role === "owner" ? 0 : person?.role === "admin" ? 1 : 2;
    };
    return [...participantIds].sort((a, b) => {
      const roleDiff = rank(a) - rank(b);
      if (roleDiff) return roleDiff;
      const aTime = Date.parse(presence.get(a)?.joinedAt || "9999-12-31");
      const bTime = Date.parse(presence.get(b)?.joinedAt || "9999-12-31");
      if (aTime !== bTime) return aTime - bTime;
      return a.localeCompare(b);
    })[0] ?? "";
  }, [member, members, participantIds, presence]);

  const isHost = joined && hostId === member.id;

  useEffect(() => {
    hostRef.current = hostId;
  }, [hostId]);

  async function refreshMeetings() {
    try {
      setMeetings(await listMeetings(channel.id));
    } catch {
      setMeetings([]);
    }
  }

  useEffect(() => { void refreshMeetings(); }, [channel.id]);

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
    analyser.smoothingTimeConstant = .7;
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
      const level = Math.min(1, Math.max(0, (rms - .008) * 8));
      setMicLevel((current) => current * .45 + level * .55);
      meterFrame.current = window.requestAnimationFrame(measure);
    };
    measure();
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((item) => item.kind === "audioinput");
    const cameras = devices.filter((item) => item.kind === "videoinput");
    setAudioInputs(microphones);
    setVideoInputs(cameras);
    setSelectedAudioDeviceId((current) => current || microphones[0]?.deviceId || "");
    setSelectedVideoDeviceId((current) => current || cameras[0]?.deviceId || "");
  }

  function audioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : {}),
    };
  }

  function videoConstraints(): MediaTrackConstraints {
    return {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
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
      await refreshDevices();
    } catch (testError) {
      setError(testError instanceof DOMException && testError.name === "NotAllowedError"
        ? "Permita o microfone para fazer o teste."
        : "Não foi possível iniciar o teste do microfone.");
    }
  }

  function publishPresence(patch: Partial<PresenceInfo> = {}) {
    localPresence.current = { ...localPresence.current, ...patch };
    if (realtime.current && joinedRef.current) void realtime.current.track(localPresence.current);
  }

  function syncPresence(room: NonNullable<typeof realtime.current>) {
    const raw = room.presenceState() as Record<string, Array<Record<string, unknown>>>;
    const next = new Map<string, PresenceInfo>();
    Object.entries(raw).forEach(([id, rows]) => {
      const row = rows.at(-1) ?? {};
      next.set(id, {
        memberId: String(row.memberId ?? id),
        name: String(row.name ?? members.find((item) => item.id === id)?.name ?? "Participante"),
        joinedAt: String(row.joinedAt ?? ""),
        muted: Boolean(row.muted),
        cameraOn: Boolean(row.cameraOn),
        screenSharing: Boolean(row.screenSharing),
        handRaised: Boolean(row.handRaised),
      });
    });
    setPresence(next);
  }

  function sendSignal(payload: Record<string, unknown>) {
    void realtime.current?.send({ type: "broadcast", event: "signal", payload: { ...payload, from: member.id } });
  }

  function videoSender(peer: RTCPeerConnection) {
    return peer.getSenders().find((sender) => sender.track?.kind === "video")
      ?? peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === "video")?.sender
      ?? null;
  }

  function activeOutgoingVideo() {
    return screenStream.current?.getVideoTracks().find((track) => track.readyState === "live")
      ?? localStream.current?.getVideoTracks().find((track) => track.readyState === "live")
      ?? null;
  }

  function renegotiateVideo() {
    peers.current.forEach((peer, peerId) => {
      void peer.createOffer().then(async (offer) => {
        await peer.setLocalDescription(offer);
        sendSignal({ to: peerId, kind: "offer", sdp: offer });
      }).catch(() => undefined);
    });
  }

  function ensurePeer(peerId: string, initiate: boolean) {
    if (peers.current.has(peerId)) return peers.current.get(peerId)!;
    const peer = new RTCPeerConnection(rtcConfiguration());
    localStream.current?.getAudioTracks().forEach((track) => peer.addTrack(track, localStream.current!));
    const outgoingVideo = activeOutgoingVideo();
    if (outgoingVideo) peer.addTrack(outgoingVideo, screenStream.current ?? localStream.current!);

    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ to: peerId, kind: "candidate", candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      setRemoteStreams((current) => {
        const next = new Map(current);
        const stream = next.get(peerId) ?? new MediaStream();
        if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
        next.set(peerId, stream);
        return next;
      });
      event.track.addEventListener("ended", () => {
        setRemoteStreams((current) => {
          const next = new Map(current);
          const stream = next.get(peerId);
          stream?.removeTrack(event.track);
          if (!stream?.getTracks().length) next.delete(peerId);
          return next;
        });
      }, { once: true });
    };
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
      }).catch(() => undefined);
    }
    return peer;
  }

  async function join(withVideo = false) {
    if (!supabaseClient || joining || joined) return;
    setError("");
    setNotice("");
    setJoining(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("media_unavailable");
      stopMicTest();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(),
        video: withVideo ? videoConstraints() : false,
      });
      localStream.current = stream;
      const hasCamera = stream.getVideoTracks().length > 0;
      setCameraOn(hasCamera);
      startLevelMeter(stream);
      await refreshDevices();
      await supabaseClient.realtime.setAuth();

      const room = supabaseClient.channel(`voice:${channel.id}`, {
        config: { private: true, presence: { key: member.id } },
      });
      realtime.current = room;

      room
        .on("presence", { event: "sync" }, () => {
          syncPresence(room);
          const ids = Object.keys(room.presenceState()).filter((id) => id !== member.id);
          ids.forEach((id) => ensurePeer(id, member.id.localeCompare(id) < 0));
        })
        .on("broadcast", { event: "signal" }, async ({ payload }) => {
          if (payload.to !== member.id || payload.from === member.id) return;
          const peerId = String(payload.from);
          const peer = ensurePeer(peerId, false);
          try {
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
          } catch {
            setNotice("A sala está ajustando a conexão de um participante.");
          }
        })
        .on("broadcast", { event: "control" }, ({ payload }) => {
          if (String(payload.target ?? "") !== member.id) return;
          if (!hostRef.current || String(payload.from ?? "") !== hostRef.current) return;
          const action = String(payload.action ?? "") as RoomControlAction;
          if (action === "mute") {
            localStream.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
            setMuted(true);
            publishPresence({ muted: true });
            setNotice("O anfitrião silenciou seu microfone.");
          } else if (action === "remove") {
            setNotice("O anfitrião encerrou sua participação nesta sala.");
            leave(false);
          }
        })
        .on("broadcast", { event: "room-chat" }, ({ payload }) => {
          const message = payload as RoomMessage;
          if (!message?.id || message.memberId === member.id || !message.body) return;
          setRoomMessages((current) => [...current.slice(-49), message]);
        });

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("realtime_timeout")), 12_000);
        room.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeout);
            const joinedAt = new Date().toISOString();
            localPresence.current = {
              memberId: member.id,
              name: member.name,
              joinedAt,
              muted: false,
              cameraOn: hasCamera,
              screenSharing: false,
              handRaised: false,
            };
            joinedRef.current = true;
            await room.track(localPresence.current);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            window.clearTimeout(timeout);
            reject(new Error(status));
          }
        });
      });

      setJoined(true);
      playVoiceCue("join", soundEnabled);
    } catch (joinError) {
      stopLevelMeter();
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      if (realtime.current && supabaseClient) void supabaseClient.removeChannel(realtime.current);
      realtime.current = null;
      joinedRef.current = false;
      setError(joinError instanceof DOMException && joinError.name === "NotAllowedError"
        ? "O microfone ou a câmera foi bloqueado. Permita o acesso e tente novamente."
        : "Não foi possível conectar à sala. Verifique a internet e tente novamente.");
    } finally {
      setJoining(false);
    }
  }

  function stopScreenShare(updatePresence = true) {
    const current = screenStream.current;
    screenStream.current = null;
    current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    const cameraTrack = cameraOn ? localStream.current?.getVideoTracks().find((track) => track.readyState === "live") ?? null : null;
    peers.current.forEach((peer) => {
      const sender = videoSender(peer);
      if (sender) void sender.replaceTrack(cameraTrack);
      else if (cameraTrack && localStream.current) peer.addTrack(cameraTrack, localStream.current);
    });
    setScreenSharing(false);
    if (updatePresence) publishPresence({ screenSharing: false });
    renegotiateVideo();
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      stopScreenShare();
      return;
    }
    setError("");
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("display_media_unavailable");
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true,
      });
      const displayTrack = display.getVideoTracks()[0];
      if (!displayTrack) throw new Error("display_track_missing");
      displayTrack.contentHint = "detail";
      screenStream.current = display;
      let addedSender = false;
      for (const peer of peers.current.values()) {
        const sender = videoSender(peer);
        if (sender) await sender.replaceTrack(displayTrack);
        else {
          peer.addTrack(displayTrack, display);
          addedSender = true;
        }
      }
      setScreenSharing(true);
      publishPresence({ screenSharing: true });
      if (addedSender) renegotiateVideo();
      displayTrack.onended = () => stopScreenShare();
    } catch (shareError) {
      if (!(shareError instanceof DOMException && shareError.name === "NotAllowedError")) {
        setError("Não foi possível iniciar o compartilhamento de tela.");
      }
    }
  }

  function leave(withSound = true) {
    const wasJoined = joinedRef.current;
    stopScreenShare(false);
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    stopMicTest(false);
    stopLevelMeter();
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    setRemoteStreams(new Map());
    if (realtime.current && supabaseClient) void supabaseClient.removeChannel(realtime.current);
    realtime.current = null;
    setPresence(new Map());
    setJoined(false);
    joinedRef.current = false;
    setMuted(false);
    setDeafened(false);
    setCameraOn(false);
    setScreenSharing(false);
    setHandRaised(false);
    setCompact(false);
    if (wasJoined && withSound) playVoiceCue("leave", soundEnabled);
  }

  useEffect(() => () => leave(false), [channel.id]);

  function toggleMute() {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    publishPresence({ muted: next });
  }

  async function toggleCamera() {
    setError("");
    if (cameraOn) {
      const tracks = localStream.current?.getVideoTracks() ?? [];
      tracks.forEach((track) => {
        localStream.current?.removeTrack(track);
        track.stop();
      });
      if (!screenSharing) {
        peers.current.forEach((peer) => {
          const sender = videoSender(peer);
          if (sender) void sender.replaceTrack(null);
        });
      }
      setCameraOn(false);
      publishPresence({ cameraOn: false });
      return;
    }

    try {
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints() });
      const track = camera.getVideoTracks()[0];
      if (!track || !localStream.current) return;
      localStream.current.addTrack(track);
      if (!screenSharing) {
        let added = false;
        for (const peer of peers.current.values()) {
          const sender = videoSender(peer);
          if (sender) await sender.replaceTrack(track);
          else {
            peer.addTrack(track, localStream.current);
            added = true;
          }
        }
        if (added) renegotiateVideo();
      }
      setCameraOn(true);
      publishPresence({ cameraOn: true });
      await refreshDevices();
    } catch (cameraError) {
      setError(cameraError instanceof DOMException && cameraError.name === "NotAllowedError"
        ? "A câmera foi bloqueada. Permita o acesso nas configurações do navegador."
        : "Não foi possível ligar a câmera.");
    }
  }

  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    publishPresence({ handRaised: next });
  }

  function moderate(target: string, action: RoomControlAction) {
    if (!isHost || !realtime.current || target === member.id) return;
    void realtime.current.send({
      type: "broadcast",
      event: "control",
      payload: { from: member.id, target, action },
    });
  }

  function sendRoomMessage(event: React.FormEvent) {
    event.preventDefault();
    const body = roomDraft.trim();
    if (!body || !joined) return;
    const message: RoomMessage = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      memberId: member.id,
      name: member.name,
      body: body.slice(0, 800),
      createdAt: new Date().toISOString(),
    };
    setRoomMessages((current) => [...current.slice(-49), message]);
    setRoomDraft("");
    void realtime.current?.send({ type: "broadcast", event: "room-chat", payload: message });
  }

  async function copyRoomReference() {
    await copyText(`${window.location.origin} · ${channel.name}`);
    setNotice("Referência da sala copiada.");
    window.setTimeout(() => setNotice(""), 2200);
  }

  const localPreviewStream = screenStream.current ?? localStream.current;

  return (
    <section className={`meeting-room-v2 ${joined ? "joined" : "lobby"} ${compact ? "compact" : ""}`}>
      <header className="meeting-v2-topbar">
        <div>
          <span className="meeting-v2-room-icon"><ShieldCheck size={16} /></span>
          <div><strong>{channel.name}</strong><small>{joined ? `${participantIds.length} na sala` : "Sala de reunião do Labstar"}</small></div>
        </div>
        <div className="meeting-v2-top-actions">
          <button type="button" onClick={() => void copyRoomReference()} title="Copiar referência da sala"><Copy size={15} /></button>
          {joined && <button type="button" onClick={() => setCompact((value) => !value)} title={compact ? "Expandir sala" : "Modo compacto"}>{compact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}</button>}
        </div>
      </header>

      {!joined ? (
        <div className="meeting-v2-lobby">
          <div className="meeting-v2-lobby-copy">
            <span><Volume2 size={30} /></span>
            <small>REUNIÃO DE EQUIPE</small>
            <h2>{channel.name}</h2>
            <p>{channel.description || "Entre por voz, ligue a câmera quando precisar e compartilhe sua tela durante revisão de código ou apresentação."}</p>
          </div>

          <section className={`meeting-v2-device-test ${testing ? "active" : ""}`}>
            <header><AudioLines size={17} /><div><strong>Antes de entrar</strong><small>Confira microfone e escolha seus dispositivos.</small></div></header>
            <AudioLevelBars level={testing ? micLevel : 0} />
            <div className="meeting-v2-test-actions">
              <span>{testing ? (micLevel > .08 ? "Sua voz está sendo detectada" : "Fale para testar…") : "O áudio de teste não é enviado."}</span>
              <button type="button" onClick={() => void toggleMicTest()}>{testing ? <X size={13} /> : <Mic size={13} />}{testing ? "Parar teste" : "Testar microfone"}</button>
            </div>
            {(audioInputs.length > 1 || videoInputs.length > 1) && (
              <div className="meeting-v2-device-grid">
                {audioInputs.length > 1 && <label>Microfone<select value={selectedAudioDeviceId} onChange={(event) => { stopMicTest(); setSelectedAudioDeviceId(event.target.value); }}>{audioInputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>}
                {videoInputs.length > 1 && <label>Câmera<select value={selectedVideoDeviceId} onChange={(event) => setSelectedVideoDeviceId(event.target.value)}>{videoInputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}</select></label>}
              </div>
            )}
          </section>

          <div className="meeting-v2-entry-actions">
            <button type="button" className="primary" onClick={() => void join(false)} disabled={joining}>{joining ? <LoaderCircle className="spin" size={17} /> : <Mic size={17} />}{joining ? "Conectando…" : "Entrar por voz"}</button>
            <button type="button" onClick={() => void join(true)} disabled={joining}><Camera size={17} /> Entrar com vídeo</button>
            <button type="button" onClick={() => setMeetingOpen(true)}><CalendarDays size={17} /> Agendar reunião</button>
          </div>
          {error && <p className="meeting-v2-error">{error}</p>}
        </div>
      ) : (
        <>
          <div className="meeting-v2-live">
            <main className="meeting-v2-stage">
              {localPreviewStream && (cameraOn || screenSharing) && (
                <VideoTile
                  stream={localPreviewStream}
                  person={member}
                  local
                  sharing={screenSharing}
                  host={isHost}
                  handRaised={handRaised}
                />
              )}
              {[...remoteStreams.entries()].map(([peerId, stream]) => {
                const person = members.find((item) => item.id === peerId) ?? { name: presence.get(peerId)?.name || "Participante", avatarUrl: "" };
                const state = presence.get(peerId);
                return (
                  <VideoTile
                    key={peerId}
                    stream={stream}
                    person={person}
                    muted={deafened}
                    sharing={Boolean(state?.screenSharing)}
                    host={peerId === hostId}
                    handRaised={Boolean(state?.handRaised)}
                  />
                );
              })}
              {!remoteStreams.size && !cameraOn && !screenSharing && (
                <div className="meeting-v2-stage-empty">
                  <Avatar name={member.name} url={member.avatarUrl} size="xl" status="online" />
                  <strong>Você está na sala</strong>
                  <span>A câmera está desligada. Sua voz continua conectada.</span>
                </div>
              )}
            </main>

            <aside className="meeting-v2-side">
              <section className="meeting-v2-participants">
                <header><div><Users size={15} /><strong>Participantes</strong></div><span>{participantIds.length}</span></header>
                <div className="meeting-v2-participant-list">
                  {participantIds.map((id) => {
                    const person = members.find((item) => item.id === id) ?? (id === member.id ? member : null);
                    if (!person) return null;
                    const state = presence.get(id) ?? (id === member.id ? localPresence.current : null);
                    return (
                      <article key={id}>
                        <Avatar name={person.name} url={person.avatarUrl} size="sm" status="online" />
                        <span><strong>{person.name}{id === member.id ? " (você)" : ""}</strong><small>{id === hostId ? "Anfitrião" : state?.screenSharing ? "Compartilhando tela" : state?.handRaised ? "Mão levantada" : "Na reunião"}</small></span>
                        <div className="meeting-v2-participant-state">
                          {state?.handRaised && <Hand size={13} />}
                          {id === hostId && <Crown size={13} />}
                          {state?.muted ? <MicOff size={13} /> : <Mic size={13} />}
                        </div>
                        {isHost && id !== member.id && (
                          <div className="meeting-v2-host-actions">
                            <button type="button" onClick={() => moderate(id, "mute")} title="Silenciar participante"><MicOff size={12} /></button>
                            <button type="button" className="danger" onClick={() => moderate(id, "remove")} title="Remover da sala"><UserMinus size={12} /></button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="meeting-v2-chat">
                <header><MessageSquareText size={15} /><strong>Chat da reunião</strong></header>
                <div className="meeting-v2-chat-scroll">
                  {roomMessages.map((message) => <p key={message.id}><b>{message.name}</b><span>{message.body}</span></p>)}
                  {!roomMessages.length && <div><MessageSquareText size={20} /><span>Links, decisões rápidas e observações podem ficar aqui durante a chamada.</span></div>}
                </div>
                <form onSubmit={sendRoomMessage}>
                  <input value={roomDraft} onChange={(event) => setRoomDraft(event.target.value)} maxLength={800} placeholder="Mensagem para a reunião" />
                  <button type="submit" disabled={!roomDraft.trim()} aria-label="Enviar mensagem"><Send size={14} /></button>
                </form>
              </section>
            </aside>
          </div>

          <div className="meeting-v2-live-status">
            <AudioLevelBars level={muted ? 0 : micLevel} compact />
            <span>{muted ? "Microfone silenciado" : micLevel > .08 ? "Sua voz está saindo" : "Conectado"}</span>
            {isHost && <em><Crown size={12} /> Você é o anfitrião</em>}
            {notice && <b>{notice}</b>}
          </div>

          <footer className="meeting-v2-controls">
            <button type="button" className={muted ? "off" : ""} onClick={toggleMute}>{muted ? <MicOff size={18} /> : <Mic size={18} />}<span>{muted ? "Ativar" : "Silenciar"}</span></button>
            <button type="button" className={!cameraOn ? "off" : ""} onClick={() => void toggleCamera()}>{cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}<span>{cameraOn ? "Câmera" : "Ligar câmera"}</span></button>
            <button type="button" className={screenSharing ? "active share" : ""} onClick={() => void toggleScreenShare()}><MonitorUp size={18} /><span>{screenSharing ? "Parar tela" : "Compartilhar tela"}</span></button>
            <button type="button" className={handRaised ? "active" : ""} onClick={toggleHand}><Hand size={18} /><span>{handRaised ? "Baixar mão" : "Levantar mão"}</span></button>
            <button type="button" className={deafened ? "off" : ""} onClick={() => setDeafened((value) => !value)}>{deafened ? <VolumeX size={18} /> : <Volume2 size={18} />}<span>{deafened ? "Ouvir" : "Áudio"}</span></button>
            <button type="button" className="leave" onClick={() => leave()}><X size={18} /><span>Sair</span></button>
          </footer>
          {error && <p className="meeting-v2-error live">{error}</p>}
        </>
      )}

      {!compact && (
        <section className="meeting-v2-schedule">
          <header><div><strong>Próximas reuniões</strong><small>Agenda vinculada a #{channel.name}</small></div><button type="button" onClick={() => setMeetingOpen(true)}><CalendarDays size={14} /> Agendar</button></header>
          <div>
            {meetings.map((meeting) => (
              <article key={meeting.id}>
                <time><b>{new Date(meeting.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</b><span>{new Date(meeting.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></time>
                <span><strong>{meeting.title}</strong><small>{meeting.agenda || `${meeting.durationMinutes} minutos`}</small></span>
                <em><Users size={12} /> {meeting.attendeeIds.length || members.filter((item) => item.status === "active").length}</em>
                <button type="button" onClick={() => void join(false)}><Mic size={13} /> Entrar</button>
                {(member.role === "owner" || member.role === "admin" || meeting.createdBy === member.id) && <button type="button" className="danger" onClick={async () => { await cancelMeeting(meeting.id); await refreshMeetings(); }} title="Cancelar reunião"><X size={13} /></button>}
              </article>
            ))}
            {!meetings.length && <p>Nenhuma reunião agendada. A sala continua disponível a qualquer momento.</p>}
          </div>
        </section>
      )}

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
            <header><div><span><CalendarDays size={18} /></span><div><strong>Agendar reunião</strong><small>O convite fica vinculado a #{channel.name}</small></div></div><button type="button" onClick={() => setMeetingOpen(false)}><X size={17} /></button></header>
            <label>Título<input required minLength={2} value={meetingDraft.title} onChange={(event) => setMeetingDraft({ ...meetingDraft, title: event.target.value })} placeholder="Ex.: Revisão semanal do produto" /></label>
            <label>Pauta<textarea rows={3} value={meetingDraft.agenda} onChange={(event) => setMeetingDraft({ ...meetingDraft, agenda: event.target.value })} placeholder="Assuntos e decisões esperadas" /></label>
            <div className="form-grid"><label>Data e horário<input required type="datetime-local" value={meetingDraft.startsAt} onChange={(event) => setMeetingDraft({ ...meetingDraft, startsAt: event.target.value })} /></label><label>Duração<select value={meetingDraft.durationMinutes} onChange={(event) => setMeetingDraft({ ...meetingDraft, durationMinutes: Number(event.target.value) })}><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={45}>45 minutos</option><option value={60}>1 hora</option><option value={90}>1h30</option><option value={120}>2 horas</option></select></label></div>
            <fieldset><legend>Participantes</legend><div className="meeting-attendees">{members.filter((item) => item.status === "active").map((person) => <label key={person.id}><input type="checkbox" checked={meetingDraft.attendeeIds.includes(person.id)} onChange={() => setMeetingDraft({ ...meetingDraft, attendeeIds: meetingDraft.attendeeIds.includes(person.id) ? meetingDraft.attendeeIds.filter((id) => id !== person.id) : [...meetingDraft.attendeeIds, person.id] })} /><Avatar name={person.name} url={person.avatarUrl} size="xs" /><span>{person.name}</span></label>)}</div></fieldset>
            <footer><button type="button" onClick={() => setMeetingOpen(false)}>Cancelar</button><button className="primary" type="submit"><Check size={14} /> Agendar e avisar</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}
