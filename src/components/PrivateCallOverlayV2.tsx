import {
  Camera,
  CameraOff,
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  PictureInPicture2,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "../meeting-room-v2.css";
import {
  listDirectCallSignals,
  sendDirectCallSignal,
  setDirectCallStatus,
  subscribeDirectCall,
  unsubscribeDirectCall,
  type DirectCallSession,
  type DirectCallSignal,
} from "../lib/directCalls";
import type { Member } from "../lib/supabase";
import { Avatar } from "./Avatar";

type Props = {
  member: Member;
  contact: Member;
  session: DirectCallSession;
  direction: "incoming" | "outgoing";
  contactOnline: boolean;
  onFinished: () => void;
};

type CallPhase = "ringing" | "preparing" | "connecting" | "connected" | "finished" | "error";

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

function signalPayload(value: RTCSessionDescriptionInit | RTCIceCandidateInit) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function PrivateCallOverlay({
  member,
  contact,
  session,
  direction,
  contactOnline,
  onFinished,
}: Props) {
  const [phase, setPhase] = useState<CallPhase>(direction === "incoming" ? "ringing" : "preparing");
  const [error, setError] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(session.kind === "video");
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(session.kind === "video");
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof subscribeDirectCall> | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const acceptedRef = useRef(direction === "outgoing");
  const closingRef = useRef(false);
  const otherMemberId = direction === "outgoing" ? session.recipientId : session.initiatorId;
  const visualStage = session.kind === "video" || remoteHasVideo || screenSharing;

  const attachRemoteStream = useCallback(() => {
    const stream = remoteStreamRef.current;
    if (visualStage) {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) remoteVideoRef.current.srcObject = stream;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    } else if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== stream) {
      remoteAudioRef.current.srcObject = stream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    }
  }, [visualStage]);

  useEffect(() => {
    attachRemoteStream();
  }, [attachRemoteStream, remoteHasVideo]);

  const finish = useCallback((message = "Chamada encerrada") => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("finished");
    setError(message);
    window.setTimeout(onFinished, 900);
  }, [onFinished]);

  const ensureLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("media_devices_unavailable");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: session.kind === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, [session.kind]);

  const flushPendingIce = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer?.remoteDescription) return;
    const queued = pendingIceRef.current.splice(0);
    for (const candidate of queued) await peer.addIceCandidate(candidate).catch(() => undefined);
  }, []);

  const ensurePeer = useCallback(async () => {
    if (peerRef.current) return peerRef.current;
    const stream = await ensureLocalMedia();
    const peer = new RTCPeerConnection(rtcConfiguration());
    peerRef.current = peer;

    for (const track of stream.getTracks()) peer.addTrack(track, stream);

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendDirectCallSignal(session.id, otherMemberId, "ice", signalPayload(event.candidate.toJSON()))
        .catch(() => setError("A conexão privada perdeu um candidato de rede."));
    };

    peer.ontrack = (event) => {
      const remote = remoteStreamRef.current;
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        if (!remote.getTracks().some((current) => current.id === track.id)) remote.addTrack(track);
        if (track.kind === "video") {
          setRemoteHasVideo(true);
          track.addEventListener("ended", () => setRemoteHasVideo(remote.getVideoTracks().some((item) => item.readyState === "live")), { once: true });
        }
      }
      attachRemoteStream();
      setPhase("connected");
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setPhase("connected");
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        finish(peer.connectionState === "failed" ? "A ligação perdeu a conexão." : "Chamada encerrada");
      }
    };

    return peer;
  }, [attachRemoteStream, ensureLocalMedia, finish, otherMemberId, session.id]);

  const handleSignal = useCallback(async (signal: DirectCallSignal) => {
    if (signal.senderId === member.id || processedSignalsRef.current.has(signal.id)) return;
    processedSignalsRef.current.add(signal.id);

    if (signal.signalType === "hangup") {
      finish("A outra pessoa encerrou a chamada.");
      return;
    }
    if (signal.signalType === "reject") {
      finish("A chamada não foi atendida.");
      return;
    }

    if (signal.signalType === "offer") {
      const offer = signal.payload as unknown as RTCSessionDescriptionInit;
      if (!acceptedRef.current) {
        pendingOfferRef.current = offer;
        return;
      }
      const peer = await ensurePeer();
      if (!peer.remoteDescription || peer.signalingState === "stable") await peer.setRemoteDescription(offer);
      await flushPendingIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendDirectCallSignal(session.id, otherMemberId, "answer", signalPayload(answer));
      setPhase("connecting");
      return;
    }

    if (signal.signalType === "answer") {
      const peer = await ensurePeer();
      if (!peer.remoteDescription) {
        await peer.setRemoteDescription(signal.payload as unknown as RTCSessionDescriptionInit);
        await flushPendingIce();
      }
      setPhase("connecting");
      return;
    }

    if (signal.signalType === "ice") {
      const candidate = signal.payload as unknown as RTCIceCandidateInit;
      const peer = peerRef.current;
      if (peer?.remoteDescription) await peer.addIceCandidate(candidate).catch(() => undefined);
      else pendingIceRef.current.push(candidate);
    }
  }, [ensurePeer, finish, flushPendingIce, member.id, otherMemberId, session.id]);

  useEffect(() => {
    const subscription = subscribeDirectCall(
      session.id,
      (updated) => {
        if (updated.status === "accepted") setPhase((current) => current === "connected" ? current : "connecting");
        if (updated.status === "rejected") finish("A chamada não foi atendida.");
        if (updated.status === "ended" || updated.status === "missed") finish(updated.status === "missed" ? "Chamada não atendida." : "Chamada encerrada");
      },
      (signal) => void handleSignal(signal).catch(() => setError("Falha ao processar a conexão privada.")),
    );
    subscriptionRef.current = subscription;

    void listDirectCallSignals(session.id)
      .then((signals) => Promise.all(signals.map((signal) => handleSignal(signal))))
      .catch(() => setError("Não foi possível recuperar a sinalização da chamada."));

    return () => {
      unsubscribeDirectCall(subscriptionRef.current);
      subscriptionRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      for (const track of localStreamRef.current?.getTracks() ?? []) track.stop();
      localStreamRef.current = null;
      for (const track of remoteStreamRef.current.getTracks()) track.stop();
    };
  }, [finish, handleSignal, session.id]);

  useEffect(() => {
    if (direction !== "outgoing") return;
    let cancelled = false;
    void (async () => {
      try {
        setPhase("preparing");
        const peer = await ensurePeer();
        if (cancelled) return;
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await peer.setLocalDescription(offer);
        await sendDirectCallSignal(session.id, otherMemberId, "offer", signalPayload(offer));
        setPhase("ringing");
      } catch {
        setPhase("error");
        setError("Não foi possível acessar câmera/microfone ou iniciar a ligação.");
        await setDirectCallStatus(session.id, "ended").catch(() => undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [direction, ensurePeer, otherMemberId, session.id]);

  useEffect(() => {
    if (direction !== "outgoing" || phase !== "ringing") return;
    const timeout = window.setTimeout(() => {
      void setDirectCallStatus(session.id, "missed");
      void sendDirectCallSignal(session.id, otherMemberId, "hangup", { reason: "timeout" });
      finish("Chamada não atendida.");
    }, 35_000);
    return () => window.clearTimeout(timeout);
  }, [direction, finish, otherMemberId, phase, session.id]);

  useEffect(() => {
    if (phase !== "connected") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function accept() {
    try {
      acceptedRef.current = true;
      setPhase("preparing");
      await ensurePeer();
      await setDirectCallStatus(session.id, "accepted");
      const offer = pendingOfferRef.current;
      if (offer) {
        pendingOfferRef.current = null;
        await handleSignal({
          id: `pending-${session.id}`,
          callId: session.id,
          senderId: otherMemberId,
          recipientId: member.id,
          signalType: "offer",
          payload: offer as unknown as Record<string, unknown>,
          createdAt: new Date().toISOString(),
        });
      } else {
        const signals = await listDirectCallSignals(session.id);
        for (const signal of signals) await handleSignal(signal);
      }
      setPhase("connecting");
    } catch {
      setPhase("error");
      setError("Permita o uso de câmera e microfone para atender.");
    }
  }

  async function reject() {
    await setDirectCallStatus(session.id, "rejected").catch(() => undefined);
    await sendDirectCallSignal(session.id, otherMemberId, "reject", { reason: "declined" }).catch(() => undefined);
    finish("Chamada recusada.");
  }

  async function hangUp() {
    await setDirectCallStatus(session.id, "ended").catch(() => undefined);
    await sendDirectCallSignal(session.id, otherMemberId, "hangup", { reason: "local_hangup" }).catch(() => undefined);
    finish("Chamada encerrada.");
  }

  function toggleMicrophone() {
    const next = !micEnabled;
    setMicEnabled(next);
    for (const track of localStreamRef.current?.getAudioTracks() ?? []) track.enabled = next;
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    for (const track of localStreamRef.current?.getVideoTracks() ?? []) track.enabled = next;
  }

  function findVideoSender(peer: RTCPeerConnection) {
    return peer.getSenders().find((sender) => sender.track?.kind === "video")
      ?? peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === "video")?.sender
      ?? null;
  }

  async function renegotiate() {
    const peer = peerRef.current;
    if (!peer || peer.signalingState !== "stable") return;
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await peer.setLocalDescription(offer);
    await sendDirectCallSignal(session.id, otherMemberId, "offer", signalPayload(offer));
  }

  async function stopScreenShare() {
    const display = screenStreamRef.current;
    screenStreamRef.current = null;
    display?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    const peer = peerRef.current;
    const cameraTrack = cameraEnabled ? localStreamRef.current?.getVideoTracks().find((track) => track.readyState === "live") ?? null : null;
    if (peer) {
      const sender = findVideoSender(peer);
      if (sender) await sender.replaceTrack(cameraTrack);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    setScreenSharing(false);
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("display_media_unavailable");
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
      const track = display.getVideoTracks()[0];
      if (!track) throw new Error("display_track_missing");
      track.contentHint = "detail";
      screenStreamRef.current = display;
      const peer = await ensurePeer();
      const sender = findVideoSender(peer);
      if (sender) await sender.replaceTrack(track);
      else {
        peer.addTrack(track, display);
        await renegotiate();
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = display;
      setScreenSharing(true);
      track.onended = () => void stopScreenShare();
    } catch (shareError) {
      if (!(shareError instanceof DOMException && shareError.name === "NotAllowedError")) setError("Não foi possível compartilhar a tela.");
    }
  }

  async function openPictureInPicture() {
    const candidate = remoteHasVideo ? remoteVideoRef.current : screenSharing ? localVideoRef.current : null;
    if (!candidate || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === candidate) await document.exitPictureInPicture();
      else await candidate.requestPictureInPicture();
    } catch {
      setError("O navegador não conseguiu abrir a janela flutuante agora.");
    }
  }

  const statusText = phase === "connected"
    ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
    : phase === "preparing"
      ? "Preparando conexão segura…"
      : phase === "connecting"
        ? "Conectando…"
        : phase === "ringing"
          ? direction === "incoming" ? "Chamada privada recebida" : contactOnline ? "Chamando…" : "Chamando — contato offline"
          : error || "Chamada encerrada";

  return (
    <div className={`private-call-backdrop ${minimized ? "private-call-minimized" : ""}`} role="dialog" aria-modal={!minimized} aria-label={`Chamada privada com ${contact.name}`}>
      <section className={`private-call-card private-call-v2 ${session.kind} phase-${phase} ${minimized ? "minimized" : ""}`}>
        <header>
          <span><ShieldCheck size={14} /> Chamada privada</span>
          <div className="private-call-v2-head-actions">
            {phase === "connected" && visualStage && document.pictureInPictureEnabled && <button type="button" onClick={() => void openPictureInPicture()} title="Manter vídeo sobre outros aplicativos"><PictureInPicture2 size={15} /></button>}
            {phase === "connected" && <button type="button" onClick={() => setMinimized((value) => !value)} title={minimized ? "Expandir chamada" : "Minimizar chamada"}>{minimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}</button>}
            <button type="button" onClick={() => void hangUp()} title="Encerrar chamada"><X size={16} /></button>
          </div>
        </header>

        <div className={`private-call-stage ${visualStage ? "visual" : "audio"}`}>
          {visualStage ? (
            <>
              <video ref={remoteVideoRef} className="private-call-remote-video" autoPlay playsInline />
              <video ref={localVideoRef} className="private-call-local-video" autoPlay playsInline muted />
              {!remoteHasVideo && phase !== "connected" && (
                <div className="private-call-video-placeholder"><Avatar name={contact.name} url={contact.avatarUrl} size="xl" status={contactOnline ? "online" : "offline"} /></div>
              )}
              {screenSharing && <span className="private-call-sharing-badge"><MonitorUp size={13} /> Você está compartilhando a tela</span>}
            </>
          ) : (
            <div className="private-call-audio-person">
              <Avatar name={contact.name} url={contact.avatarUrl} size="xl" status={contactOnline ? "online" : "offline"} />
              <span className="private-call-rings" aria-hidden="true" />
            </div>
          )}
          <audio ref={remoteAudioRef} autoPlay />
        </div>

        <div className="private-call-copy">
          <div className="private-call-kind">{visualStage ? <Video size={16} /> : <Phone size={16} />}</div>
          <h2>{contact.name}</h2>
          <p>{statusText}</p>
          {error && phase !== "finished" && <small>{error}</small>}
        </div>

        {direction === "incoming" && phase === "ringing" ? (
          <div className="private-call-answer-actions">
            <button className="reject" type="button" onClick={() => void reject()}><PhoneOff size={19} /><span>Recusar</span></button>
            <button className="accept" type="button" onClick={() => void accept()}>{session.kind === "video" ? <Video size={19} /> : <Phone size={19} />}<span>Atender</span></button>
          </div>
        ) : (
          <div className="private-call-controls private-call-v2-controls">
            <button className={!micEnabled ? "off" : ""} type="button" onClick={toggleMicrophone} title={micEnabled ? "Silenciar microfone" : "Ativar microfone"}>{micEnabled ? <Mic size={19} /> : <MicOff size={19} />}</button>
            {session.kind === "video" && <button className={!cameraEnabled ? "off" : ""} type="button" onClick={toggleCamera} title={cameraEnabled ? "Desligar câmera" : "Ativar câmera"}>{cameraEnabled ? <Camera size={19} /> : <CameraOff size={19} />}</button>}
            {phase === "connected" && <button className={screenSharing ? "sharing" : ""} type="button" onClick={() => void toggleScreenShare()} title={screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}><MonitorUp size={19} /></button>}
            <button className="hangup" type="button" onClick={() => void hangUp()} title="Encerrar chamada"><PhoneOff size={20} /></button>
          </div>
        )}

        {(phase === "preparing" || phase === "connecting") && <LoaderCircle className="private-call-loader spin" size={18} />}
      </section>
    </div>
  );
}
