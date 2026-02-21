import { useRef, useEffect } from "react";

interface VideoCardProps {
  /** Camera/mic stream to display (use srcObject, not src) */
  stream: MediaStream | null;
  muted?: boolean;
  label?: string;
}

/** Renders a single video from a MediaStream (local or remote). */
const VideoCard = ({ stream, muted = false, label }: VideoCardProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream to <video> via srcObject; clear on unmount or when stream changes
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="w-4xl overflow-hidden rounded-xl bg-neutral-900 shadow-lg">
      {label && (
        <span className="block bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white">
          {label}
        </span>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="aspect-video w-full object-cover"
      />
    </div>
  );
};

export default VideoCard;
