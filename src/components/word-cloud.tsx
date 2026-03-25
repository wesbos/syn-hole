import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

export type WordCloudPanelProps = {
  role: "audience" | "host" | "projector";
  words: Array<{ word: string; count: number }>;
  onSubmitWord: (word: string) => void;
};

function fontSizeRemForCount(count: number, allCounts: number[]): string {
  if (allCounts.length === 0) return "1rem";
  const min = Math.min(...allCounts);
  const max = Math.max(...allCounts);
  if (max <= min) return "1.4rem";
  const t = (count - min) / (max - min);
  const rem = 0.8 + t * (3 - 0.8);
  return `${rem}rem`;
}

export function WordCloudPanel(props: WordCloudPanelProps) {
  const { role, words, onSubmitWord } = props;
  const [draft, setDraft] = useState("");
  const counts = words.map((w) => w.count);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.replace(/\s+/g, " ").trim();
    if (next.length === 0) return;
    onSubmitWord(next);
    setDraft("");
  }

  return (
    <section className="panel word-cloud-panel">
      {role === "audience" ? (
        <form className="word-cloud-form" onSubmit={onSubmit}>
          <input
            type="text"
            className="text-input"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder="Add a word"
            maxLength={120}
            aria-label="Word to add"
          />
          <button type="submit">
            <Plus size={16} strokeWidth={2} aria-hidden />
            Add Word
          </button>
        </form>
      ) : null}
      <div className="word-cloud-display" aria-live="polite">
        {words.map((item, index) => (
          <span
            key={`${item.word}-${index}`}
            className="word-cloud-word"
            style={{ fontSize: fontSizeRemForCount(item.count, counts) }}
          >
            {item.word}
          </span>
        ))}
      </div>
    </section>
  );
}
