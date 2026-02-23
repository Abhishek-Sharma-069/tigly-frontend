import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import Landing from './component/Landing'
import Room from './page/Room'
import socket from './config/socket'

function App() {
  // Global socket listeners for connection status and optional debug logs
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to server");
    });

    socket.on("server_status", (msg) => {
      console.log("Server:", msg);
    });
    socket.on("new-room", ({ type, roomId }) => {
      console.log("New room:", type, roomId);
    });
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen antialiased">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room" element={<Room />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
