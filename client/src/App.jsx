import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

export default function App() {
  const [roomId, setRoomId] = useState("general");
  const [username, setUsername] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);

  const socket = useMemo(() => {
    return io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
    });
  }, []);

  const scrollerRef = useRef(null);

  useEffect(() => {
    function handleConnect() {
      setConnected(true);
      socket.emit("join_room", { roomId });
    }

    function handleDisconnect() {
      setConnected(false);
    }

    function handleMessages(serverMessages) {
      setMessages(serverMessages || []);
    }

    function handleNewMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("messages", handleMessages);
    socket.on("new_message", handleNewMessage);

    // If we connect after the initial render, ensure the current room is joined.
    if (socket.connected) socket.emit("join_room", { roomId });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("messages", handleMessages);
      socket.off("new_message", handleNewMessage);
    };
  }, [roomId, socket]);

  useEffect(() => {
    // Keep the latest messages in view.
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  function onSend() {
    const nextUsername = username.trim();
    const nextContent = draft.trim();
    if (!nextUsername || !nextContent) return;

    socket.emit("send_message", {
      roomId,
      username: nextUsername,
      content: nextContent,
    });
    setDraft("");
  }

  return (
    <div className="wrap">
      <h1>Chatroom</h1>

      <div className="row">
        <label>
          Room
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="general"
          />
        </label>
      </div>

      <div className="row">
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. alice"
          />
        </label>
      </div>

      <div className="status">{connected ? "Connected" : "Connecting..."}</div>

      <div className="messages" ref={scrollerRef}>
        {messages.map((m) => (
          <div key={m._id} className="msg">
            <div className="meta">
              <span className="user">{m.username}</span>
              <span className="time">
                {m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ""}
              </span>
            </div>
            <div className="text">{m.content}</div>
          </div>
        ))}
      </div>

      <div className="composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message and press Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
        />
        <button onClick={onSend} disabled={!draft.trim() || !username.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

