import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Send } from "lucide-react";
import type { ChatMessage } from "~/types";

export type ChatPanelProps = {
  role: "audience" | "host" | "projector";
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
};

export function ChatPanel({
  role,
  messages,
  onSendMessage,
}: ChatPanelProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = inputValue.replace(/\s+/g, " ").trim();
    if (!text) return;
    onSendMessage(text);
    setInputValue("");
  }

  return (
    <div className="chat-panel">
      <div ref={messagesRef} className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={
              msg.authorId === "host"
                ? "chat-msg is-host"
                : "chat-msg"
            }
          >
            <div className="chat-msg-author">{msg.authorName}</div>
            <div className="chat-msg-text">{msg.text}</div>
          </div>
        ))}
      </div>
      {role !== "projector" ? (
        <form className="chat-input-form" onSubmit={handleSubmit}>
          <input
            className="chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            maxLength={500}
            placeholder="Type a message…"
            aria-label="Chat message"
          />
          <button type="submit" aria-label="Send message">
            <Send aria-hidden />
          </button>
        </form>
      ) : null}
    </div>
  );
}
