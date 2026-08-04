import {
  Camera,
  CameraOff,
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

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
  const [elapsed, setElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof subscribeDirectCall> | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const acceptedRef = useRef(direction === "outgoing");
  const closingRef = useRef(false);
  const otherMemberId = direction === "outgoing" ? session.recipientId : session.initiatorId;

  const attachRemoteStream = useCallback(() => {
    const stream = remoteStreamRef.current;
    if (session.kind === "video") {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
    } else if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== stream) {
      remoteAudioRef.current.srcObject = stream;
    }
  }, [session.kind]);

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
    for (const candidate of queued) {
      await peer.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const ensurePeer = useCallback(async () => {
    if (peerRef.current) return peerRef.current;
    const stream = await ensureLocalMedia();
    const peer = new RTCPeerConnection(rtcConfiguration);
    peerRef.current = peer;

    for (const track of stream.getTracks()) peer.addTrack(track, stream);

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendDirectCallSignal(
        session.id,
        otherMemberId,
        "ice",
        signalPayload(event.candidate.toJSON()),
      ).catch(() => setError("A conexão privada perdeu um candidato de rede."));
    };

    peer.ontrack = (event) => {
      const remote = remoteStreamRef.current;
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        if (!remote.getTracks().some((current) => current.id === track.id)) remote.addTrack(track);
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
      if (!peer.remoteDescription) await peer.setRemoteDescription(offer);
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
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: session.kind === "video" });
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
  }, [direction, ensurePeer, otherMemberId, session.id, session.kind]);

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
    <div className="private-call-backdrop" role="dialog" aria-modal="true" aria-label={`Chamada privada com ${contact.name}`}>
      <section className={`private-call-card ${session.kind} phase-${phase}`}>
        <header>
          <span><ShieldCheck size={14} /> Chamada privada</span>
          <button type="button" onClick={() => void hangUp()} title="Fechar chamada"><X size={16} /></button>
        </header>

        <div className="private-call-stage">
          {session.kind === "video" ? (
            <>
              <video ref={remoteVideoRef} className="private-call-remote-video" autoPlay playsInline />
              <video ref={localVideoRef} className="private-call-local-video" autoPlay playsInline muted />
              {phase !== "connected" && (
                <div className="private-call-video-placeholder">
                  <Avatar name={contact.name} url={contact.avatarUrl} size="xl" status={contactOnline ? "online" : "offline"} />
                </div>
              )}
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
          <div className="private-call-kind">{session.kind === "video" ? <Video size={16} /> : <Phone size={16} />}</div>
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
          <div className="private-call-controls">
            <button className={!micEnabled ? "off" : ""} type="button" onClick={toggleMicrophone} title={micEnabled ? "Silenciar microfone" : "Ativar microfone"}>{micEnabled ? <Mic size={19} /> : <MicOff size={19} />}</button>
            {session.kind === "video" && <button className={!cameraEnabled ? "off" : ""} type="button" onClick={toggleCamera} title={cameraEnabled ? "Desligar câmera" : "Ativar câmera"}>{cameraEnabled ? <Camera size={19} /> : <CameraOff size={19} />}</button>}
            <button className="hangup" type="button" onClick={() => void hangUp()} title="Encerrar chamada"><PhoneOff size={20} /></button>
          </div>
        )}

        {(phase === "preparing" || phase === "connecting") && <LoaderCircle className="private-call-loader spin" size={18} />}
      </section>
    </div>
  );
}
