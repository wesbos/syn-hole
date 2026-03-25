import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, ChevronUp, MessageCircle } from "lucide-react";
import type { PollRole, QnAQuestion } from "~/types";

export type QnAProps = {
  role: PollRole;
  questions: QnAQuestion[];
  onSubmitQuestion: (text: string) => void;
  onUpvote: (questionId: string) => void;
  onMarkAnswered: (questionId: string) => void;
};

export function QnAPanel(props: QnAProps) {
  const { role, questions, onSubmitQuestion, onUpvote, onMarkAnswered } = props;
  const [draft, setDraft] = useState("");

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => b.upvoteCount - a.upvoteCount),
    [questions]
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSubmitQuestion(text);
    setDraft("");
  }

  return (
    <div className="qna-panel">
      <div className="qna-panel-header">
        <MessageCircle className="qna-panel-icon" aria-hidden />
        <span className="qna-panel-title">Q&amp;A</span>
      </div>

      {role === "audience" ? (
        <form className="qna-submit-form" onSubmit={handleSubmit}>
          <input
            className="text-input qna-submit-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question…"
            aria-label="Your question"
          />
          <button type="submit" disabled={!draft.trim()}>
            Ask
          </button>
        </form>
      ) : null}

      <ul className="qna-list" role="list">
        {sortedQuestions.map((q) => (
          <li key={q.id}>
            <article
              className={`qna-card${q.answered ? " is-answered" : ""}`}
              aria-label={q.answered ? "Answered question" : "Open question"}
            >
              <div className="qna-card-body">
                <div className="qna-meta">
                  <span className="qna-author">{q.authorName}</span>
                  {q.answered ? (
                    <span className="qna-answered-badge">
                      <CheckCircle2 size={14} aria-hidden />
                      Answered
                    </span>
                  ) : null}
                </div>
                <p className="qna-text">{q.text}</p>
              </div>
              <div className="qna-card-actions">
                {role === "audience" ? (
                  <button
                    type="button"
                    className={`qna-upvote-btn${q.yourUpvote ? " is-upvoted" : ""}`}
                    onClick={() => onUpvote(q.id)}
                    aria-pressed={q.yourUpvote}
                    aria-label={
                      q.yourUpvote
                        ? `Remove upvote, ${q.upvoteCount} votes`
                        : `Upvote, ${q.upvoteCount} votes`
                    }
                  >
                    <ChevronUp size={18} strokeWidth={2.5} aria-hidden />
                    <span className="qna-upvote-count">{q.upvoteCount}</span>
                  </button>
                ) : (
                  <span className="qna-upvote-readonly" aria-label={`${q.upvoteCount} upvotes`}>
                    <ChevronUp size={16} aria-hidden />
                    {q.upvoteCount}
                  </span>
                )}
                {role === "host" ? (
                  <button
                    type="button"
                    className="qna-mark-btn"
                    onClick={() => onMarkAnswered(q.id)}
                    aria-pressed={q.answered}
                    aria-label={
                      q.answered ? "Mark question as not answered" : "Mark question as answered"
                    }
                  >
                    <CheckCircle2 size={16} aria-hidden />
                    {q.answered ? "Answered" : "Mark answered"}
                  </button>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
