import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import socket from "../config/socket";
import VideoCard from "../component/VideoCard";
import ControlCard from "../component/ControlCard";
/** Whether we're still in queue or already matched with a peer */
type RoomStatus = "searching" | "matched";
/** WebRTC role: we create the offer (send-offer) or we answer the other peer's offer (receive-offer) */
type RoomType = "send-offer" | "receive-offer";

const Room = () => {
  const [searchParams] = useSearchParams();
  const name = searchParams.get("name");

  // --- Room / matching state (from server) ---
  const [status, setStatus] = useState<RoomStatus>("searching");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<RoomType | null>(null);

  // --- Media & WebRTC ---
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  /** Increment when remote stream gets a new track so VideoCard re-attaches and plays */
  const [remoteStreamKey, setRemoteStreamKey] = useState(0);
  /** Ref so cleanup can stop tracks even when state is stale */
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  /** Queue ICE candidates until remote description is set */
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  /** So we only send the offer once (avoids duplicate in Strict Mode) */
  const offerSentRef = useRef(false);
  /** Answerer: offer may arrive before PC is ready; buffer it */
  const pendingOfferRef = useRef<string | null>(null);
  /** Single remote stream we add all remote tracks to (so we don't overwrite with a single track) */
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // Join queue on mount; listen for "new-room" when we're matched with another user
  useEffect(() => {
    if (!name) return;

    socket.emit("join_room", { name });

    const onNewRoom = (payload: { type: string; roomId: string }) => {
      setRoomId(payload.roomId);
      setRoomType(payload.type as RoomType);
      setStatus("matched");
    };

    socket.on("new-room", onNewRoom);

    return () => {
      socket.off("new-room", onNewRoom);
      socket.emit("leave_room", { name });
    };
  }, [name]);

  /** Request camera + microphone and store the stream for local video and for sending to the peer */
  const initializeMediaStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (e) {
      console.error("getUserMedia failed", e);
    }
  };

  // Get user media on mount; on unmount stop all tracks and close the peer connection
  useEffect(() => {
    initializeMediaStream();
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      pcRef.current?.close();
      pcRef.current = null;
      offerSentRef.current = false;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
    };
  }, []);

  // Answerer: listen for offer as soon as we're matched so we don't miss it if PC isn't ready yet
  useEffect(() => {
    if (status !== "matched" || roomType !== "receive-offer" || !roomId) return;
    const onOffer = ({ sdp }: { sdp: string }) => {
      pendingOfferRef.current = sdp;
    };
    socket.on("offer", onOffer);
    return () => {
      socket.off("offer", onOffer);
    };
  }, [status, roomType, roomId]);

  // When matched: create RTCPeerConnection (once), add local tracks, and run offer/answer signaling.
  // Handlers are re-registered every run so they survive React Strict Mode cleanup.
  useEffect(() => {
    if (status !== "matched" || !roomId || !roomType || !localStream) return;

    let pc = pcRef.current;
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;
      setRemoteStream(null);
      remoteStreamRef.current = null;

      pc.onconnectionstatechange = () => {
        console.log("[WebRTC] connectionState:", pc?.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        console.log("[WebRTC] iceConnectionState:", pc?.iceConnectionState);
      };
      pc.onicegatheringstatechange = () => {
        console.log("[WebRTC] iceGatheringState:", pc?.iceGatheringState);
      };

      pc.ontrack = (event) => {
        console.log("[WebRTC] ontrack:", event.track.kind);
        const track = event.track;
        if (!track) return;
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
          setRemoteStream(remoteStreamRef.current);
        }
        remoteStreamRef.current.addTrack(track);
        setRemoteStreamKey((k) => k + 1);
      };

      localStream.getTracks().forEach((track) => pc!.addTrack(track, localStream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.toJSON?.() ?? event.candidate;
          console.log("[WebRTC] Sending ICE candidate");
          socket.emit("ice-candidate", { roomId, candidate });
        }
      };
    }

    console.log("[WebRTC] Socket connected:", socket.connected, "roomId:", roomId, "roomType:", roomType);

    const addIceCandidate = async (candidate: RTCIceCandidateInit) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("addIceCandidate error:", e);
      }
    };

    const flushPendingIceCandidates = async () => {
      const conn = pcRef.current;
      if (!conn || pendingIceRef.current.length === 0) return;
      for (const c of pendingIceRef.current) {
        try {
          await conn.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.error("addIceCandidate (pending) error:", e);
        }
      }
      pendingIceRef.current = [];
    };

    const handleIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (!candidate) return;
      const conn = pcRef.current;
      if (!conn) return;
      console.log("[WebRTC] Received ICE candidate");
      if (conn.remoteDescription) {
        await addIceCandidate(candidate);
      } else {
        pendingIceRef.current.push(candidate);
      }
    };

    const applyOffer = async (sdp: string) => {
      if (!pcRef.current || roomType !== "receive-offer") return;
      try {
        console.log("[WebRTC] Received offer, setting remote description and sending answer");
        await pcRef.current.setRemoteDescription({ type: "offer", sdp });
        await flushPendingIceCandidates();
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit("answer", { roomId, sdp: pcRef.current.localDescription?.sdp });
        console.log("[WebRTC] Answer sent");
      } catch (e) {
        console.error("Answer error:", e);
      }
    };

    const handleOffer = async ({ sdp }: { sdp: string }) => {
      pendingOfferRef.current = sdp;
      if (pcRef.current && roomType === "receive-offer") {
        const sdpToApply = pendingOfferRef.current;
        pendingOfferRef.current = null;
        await applyOffer(sdpToApply);
      }
    };

    const handleAnswer = async ({ sdp }: { sdp: string }) => {
      if (!pcRef.current || roomType !== "send-offer") return;
      try {
        console.log("[WebRTC] Received answer, setting remote description");
        await pcRef.current.setRemoteDescription({ type: "answer", sdp });
        await flushPendingIceCandidates();
      } catch (e) {
        console.error("Set remote description error:", e);
      }
    };

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    if (roomType === "send-offer" && !offerSentRef.current) {
      offerSentRef.current = true;
      (async () => {
        try {
          console.log("[WebRTC] Creating and sending offer");
          const offer = await pc!.createOffer();
          await pc!.setLocalDescription(offer);
          socket.emit("offer", { roomId, sdp: pc!.localDescription?.sdp });
        } catch (e) {
          console.error("Offer error:", e);
        }
      })();
    }

    if (roomType === "receive-offer" && pendingOfferRef.current && pcRef.current) {
      const sdpToApply = pendingOfferRef.current;
      pendingOfferRef.current = null;
      applyOffer(sdpToApply);
    }

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [status, roomId, roomType, localStream]);

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-xl font-semibold">Hi {name}</h1>
        {status === "searching" && (
          <p className="text-amber-400">Searching for a stranger...</p>
        )}
        {status === "matched" && (
          <p className="text-emerald-400">You're connected! Room: {roomId}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {localStream && <VideoCard stream={localStream} muted={true} label="You" />}
          {remoteStream && (
            <VideoCard
              key={remoteStreamKey}
              stream={remoteStream}
              muted={false}
              label="Stranger"
            />
          )}
        </div>
        {localStream && (
          <div className="flex justify-center">
            <ControlCard localStream={localStream} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Room;
