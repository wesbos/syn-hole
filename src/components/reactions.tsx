const AUDIENCE_REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👏", "🔥", "😮"] as const;

export type ReactionsPanelProps = {
  role: "audience" | "host" | "projector";
  reactions: Array<{ emoji: string; count: number }>;
  onSubmitReaction: (emoji: string) => void;
};

export function ReactionsPanel(props: ReactionsPanelProps) {
  const { role, reactions, onSubmitReaction } = props;

  return (
    <section className="panel reactions-panel">
      {role === "audience" ? (
        <div className="reactions-buttons">
          {AUDIENCE_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-btn"
              onClick={() => onSubmitReaction(emoji)}
              aria-label={`Send ${emoji} reaction`}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <div className="reactions-display" aria-live="polite">
        {reactions.map((item, index) => (
          <span key={`${item.emoji}-${index}`} className="reaction-bubble">
            <span aria-hidden>{item.emoji}</span>
            <span>{item.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
