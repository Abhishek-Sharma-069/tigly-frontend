import { io } from "socket.io-client";

const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl && import.meta.env.PROD) {
  console.error(
    "[Tigly] VITE_API_URL is not set. Set it in your hosting (e.g. Vercel) to your backend URL (e.g. https://your-backend.onrender.com)."
  );
}

const socket = io(apiUrl || window.location.origin, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
});

export default socket;
