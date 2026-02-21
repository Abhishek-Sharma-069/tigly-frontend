import { useState, useEffect } from "react";
import { IoVideocam, IoVideocamOff, IoMic, IoMicOff } from "react-icons/io5";

interface ControlCardProps {
  //Local camera + mic stream; controls are disabled when null
  localStream: MediaStream | null;
}

// Local media controls: pause/resume video and mute/unmute microphone.
// Toggles the `enabled` state of the stream tracks so the peer sees the change.

const ControlCard = ({ localStream }: ControlCardProps) => {
  const [videoOn, setVideoOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];
    setVideoOn(videoTrack?.enabled ?? true);
    setMicOn(audioTrack?.enabled ?? true);
  }, [localStream]);

  const toggleVideo = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setVideoOn(t.enabled);
    });
  };

  const toggleMic = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setMicOn(t.enabled);
    });
  };

  if (!localStream) return null;

  return (
    <div
      className="inline-flex gap-3 rounded-xl bg-black/80 px-4 py-3 shadow-lg"
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border-0 px-4 py-2 text-sm font-medium outline-none transition-colors focus:ring-2 focus:ring-white/30"
        onClick={toggleVideo}
        title={videoOn ? "Turn camera off" : "Turn camera on"}
        aria-pressed={!videoOn}
      >
        {videoOn ? (
          <IoVideocam className="h-5 w-5 shrink-0" aria-hidden />
        ) : (
          <IoVideocamOff className="h-5 w-5 shrink-0" aria-hidden />
        )}
        <span>{videoOn ? "Camera on" : "Camera off"}</span>
      </button>

      <button
        type="button"
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border-0 px-4 py-2 text-sm font-medium outline-none transition-colors focus:ring-2 focus:ring-white/30"
        onClick={toggleMic}
        title={micOn ? "Mute microphone" : "Unmute microphone"}
        aria-pressed={!micOn}
      >
        {micOn ? (
          <IoMic className="h-5 w-5 shrink-0" aria-hidden />
        ) : (
          <IoMicOff className="h-5 w-5 shrink-0" aria-hidden />
        )}
        <span>{micOn ? "Mic on" : "Mic off"}</span>
      </button>
    </div>
  )
};

export default ControlCard;
