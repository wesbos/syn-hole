import { createFileRoute } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Join Room | Syntax Live Polls" }],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  const navigate = Route.useNavigate();
  const [roomCode, setRoomCode] = useState("");

  const trimmedRoomCode = roomCode.trim();
  const audiencePathPreview = useMemo(
    () => (trimmedRoomCode ? `/r/${encodeURIComponent(trimmedRoomCode)}` : ""),
    [trimmedRoomCode]
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedRoomCode) return;
    void navigate({
      to: "/r/$room",
      params: { room: trimmedRoomCode },
    });
  }

  return (
    <main className="app join-room-app">
      <section className="panel join-room-panel">
        <p className="join-room-kicker">Syntax Live Polls</p>
        <h1>Join a room</h1>
        <p className="muted big">Enter your room code to jump into the audience view.</p>
        <form className="join-room-form" onSubmit={onSubmit}>
          <label className="join-room-label" htmlFor="roomCode">
            Room code
          </label>
          <div className="join-room-row">
            <input
              id="roomCode"
              className="text-input"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="e.g. main-stage"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" disabled={!trimmedRoomCode}>
              Join room
            </button>
          </div>
        </form>
        {audiencePathPreview ? (
          <p className="join-room-preview">
            You will be sent to <code>{audiencePathPreview}</code>
          </p>
        ) : null}
      </section>
    </main>
  );
}
