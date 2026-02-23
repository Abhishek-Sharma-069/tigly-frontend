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
  /** Ref so cleanup can stop tracks even when state is stale */
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

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
    };
  }, []);

  // When matched: create RTCPeerConnection, add local tracks, and run offer/answer signaling
  useEffect(() => {
    if (status !== "matched" || !roomId || !roomType || !localStream || pcRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    // When the other peer's media arrives, show it in the "Stranger" video
    pc.ontrack = (event) => {
      if (event.streams[0]) setRemoteStream(event.streams[0]);
    };

    // Send our camera/mic to the peer
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    // Answerer: receive offer from server → set remote desc → create answer → send answer
    const handleOffer = async ({ sdp }: { sdp: string }) => {
      if (!pcRef.current || roomType !== "receive-offer") return;
      try {
        await pcRef.current.setRemoteDescription({ type: "offer", sdp });
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit("answer", { roomId, sdp: pcRef.current.localDescription?.sdp });
      } catch (e) {
        console.error("Answer error:", e);
      }
    };

    // Offerer: receive answer from server → set remote desc to complete the connection
    const handleAnswer = async ({ sdp }: { sdp: string }) => {
      if (!pcRef.current || roomType !== "send-offer") return;
      try {
        await pcRef.current.setRemoteDescription({ type: "answer", sdp });
      } catch (e) {
        console.error("Set remote description error:", e);
      }
    };

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);

    // Offerer: create and send SDP offer to the other peer via server
    if (roomType === "send-offer") {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { roomId, sdp: pc.localDescription?.sdp });
        } catch (e) {
          console.error("Offer error:", e);
        }
      })();
    }

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
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
          {remoteStream && <VideoCard stream={remoteStream} muted={false} label="Stranger" />}
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
