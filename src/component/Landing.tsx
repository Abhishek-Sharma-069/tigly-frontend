import { useState } from "react";
import { Link } from "react-router-dom";

const Landing = () => {
  const [name, setName] = useState("");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-neutral-900 p-8 shadow-xl">
        <h1 className="text-center text-2xl font-bold text-white">Tigly</h1>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 text-white placeholder-neutral-500 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        />
        <Link
          to={`/room?name=${encodeURIComponent(name)}`}
          className="block rounded-lg bg-amber-500 px-4 py-3 text-center font-semibold text-neutral-900 transition hover:bg-amber-400"
        >
          Join Room
        </Link>
      </div>
    </div>
  );
};

export default Landing;
