import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import usePartySocket from "partysocket/react";
import {
  CheckCircle2,
  CheckCheck,
  Copy,
  Eye,
  Lock,
  Link2,
  LockKeyhole,
  MoreVertical,
  Maximize2,
  Rocket,
  Settings,
  Star,
  Users,
} from "lucide-react";
import type {
  IncomingMessage,
  OutgoingMessage,
  PollChoiceQuestion,
  PollChoiceQuestionPublic,
  PollNumberQuestion,
  PollNumberQuestionPublic,
  PollRole,
} from "~/types";
import { QnAPanel } from "./qna";
import { ChatPanel } from "./chat";
import { WordCloudPanel } from "./word-cloud";
import { ReactionsPanel } from "./reactions";

type ViewMode = "audience" | "host" | "projector";

const PARTY_NAME = "poll-room";
const DEFAULT_ROOM = "main-stage";
const VOTER_STORAGE_KEY = "syntax-live-poll-voter-id";
const AUDIENCE_NAME_STORAGE_KEY = "syntax-live-audience-name";
const HOST_KEY_STORAGE_KEY = "syntax-live-host-key";

const phaseLabel: Record<string, string> = {
  idle: "Waiting to open voting",
  open: "Voting is open",
  closed: "Voting closed",
  revealed: "Answer revealed",
};

export function PollPage(props: { view: ViewMode; room?: string }) {
  const { view } = props;
  const room = props.room ?? DEFAULT_ROOM;
  const role: PollRole =
    view === "host"
      ? "host"
      : view === "projector"
        ? "projector"
        : "audience";

  const [showDebug, setShowDebug] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShowDebug(params.get("debug") === "1");
  }, []);

  const [hostKey, setHostKey] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const urlHostKey = params.get("hostKey") ?? params.get("key");
    if (urlHostKey) {
      saveHostKey(urlHostKey);
      return urlHostKey;
    }
    return readHostKey();
  });
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [numberGuessInput, setNumberGuessInput] = useState("");
  const [numberGuessError, setNumberGuessError] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stateMessage, setStateMessage] = useState<
    Extract<OutgoingMessage, { type: "state" }> | null
  >(null);

  const audienceVoterId = useMemo(
    () => (role === "audience" ? getOrCreateVoterId() : ""),
    [role]
  );
  const [audienceName, setAudienceName] = useState(() =>
    role === "audience" ? readAudienceName() : ""
  );
  const [pendingAudienceName, setPendingAudienceName] = useState(audienceName);
  const needsAudienceName = role === "audience" && audienceName.trim().length === 0;
  const canConnect =
    role === "host"
      ? hostKey.trim().length > 0
      : role === "audience"
        ? audienceName.trim().length > 0
        : true;

  const socket = usePartySocket({
    enabled: canConnect,
    room,
    party: PARTY_NAME,
    query: () => ({
      role,
      voterId: role === "audience" ? audienceVoterId : undefined,
      name: role === "audience" ? audienceName : undefined,
      hostKey: role === "host" ? hostKey.trim() : undefined,
    }),
    onOpen() {
      setStatus("connected");
      setErrorMessage(null);
    },
    onClose() {
      setStatus("disconnected");
    },
    onError() {
      setStatus("disconnected");
    },
    onMessage(event) {
      try {
        const message = JSON.parse(event.data as string) as OutgoingMessage;
        if (message.type === "error") {
          setErrorMessage(message.message);
          return;
        }
        setErrorMessage(null);
        setStateMessage(message);
      } catch {
        setErrorMessage("Received malformed payload from server.");
      }
    },
  });

  useEffect(() => {
    if (role !== "audience" || !stateMessage) {
      return;
    }
    if (stateMessage.question?.kind === "choice") {
      setSelectedOptionIds(stateMessage.yourVoteOptionIds);
      return;
    }
    setSelectedOptionIds([]);
    setNumberGuessInput(
      stateMessage.yourNumberGuess !== null ? String(stateMessage.yourNumberGuess) : ""
    );
  }, [role, stateMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlHostKey = params.get("hostKey") ?? params.get("key");
    if (!urlHostKey) return;
    setHostKey(urlHostKey);
    saveHostKey(urlHostKey);
  }, []);

  useEffect(() => {
    if (!hostKey.trim()) return;
    saveHostKey(hostKey.trim());
  }, [hostKey]);

  useEffect(() => {
    if (role !== "audience" || !needsAudienceName) return;

    let cancelled = false;

    void fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) throw new Error("bootstrap request failed");
        return (await response.json()) as { defaultAudienceName?: unknown };
      })
      .then((data) => {
        if (cancelled) return;
        const suggested =
          typeof data.defaultAudienceName === "string" && data.defaultAudienceName.trim().length > 0
            ? data.defaultAudienceName
            : "Anon from somewhere";
        setPendingAudienceName((current) => (current.trim().length > 0 ? current : suggested));
      })
      .catch(() => {
        if (cancelled) return;
        setPendingAudienceName((current) =>
          current.trim().length > 0 ? current : "Anon from somewhere"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [role, needsAudienceName]);

  const question = stateMessage?.question ?? null;
  const roomLinks = useMemo(() => getRoomLinks(room, hostKey.trim()), [room, hostKey]);

  function sendMessage(message: IncomingMessage) {
    if (socket.readyState !== WebSocket.OPEN) {
      setErrorMessage("Socket is not connected yet.");
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function onAudienceOptionToggle(optionId: string) {
    if (!question || question.kind !== "choice") return;
    let nextOptionIds: string[] = [];
    if (question.allowMultiple) {
      nextOptionIds = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId];
      setSelectedOptionIds(nextOptionIds);
    } else {
      nextOptionIds = selectedOptionIds[0] === optionId ? [] : [optionId];
      setSelectedOptionIds(nextOptionIds);
    }
    sendMessage({ type: "vote", optionIds: nextOptionIds });
  }

  function onNumberGuessInputChange(value: string) {
    setNumberGuessInput(value);
    if (numberGuessError) setNumberGuessError(null);
  }

  function submitNumberGuess() {
    if (!question || question.kind !== "number") return;

    const trimmed = numberGuessInput.trim();
    if (trimmed.length === 0) {
      setNumberGuessError(null);
      sendMessage({ type: "vote-number", value: null });
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setNumberGuessError("Enter a valid number.");
      return;
    }
    if (question.min !== undefined && parsed < question.min) {
      setNumberGuessError(`Enter a value of at least ${question.min}.`);
      return;
    }
    if (question.max !== undefined && parsed > question.max) {
      setNumberGuessError(`Enter a value of at most ${question.max}.`);
      return;
    }

    setNumberGuessError(null);
    sendMessage({ type: "vote-number", value: parsed });
  }

  function submitAudienceName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName =
      pendingAudienceName.replace(/\s+/g, " ").trim().slice(0, 80) || "Anon from somewhere";
    setAudienceName(nextName);
    setPendingAudienceName(nextName);
    saveAudienceName(nextName);
  }

  return (
    <main className={`app app-${view} app-shell`}>
      {needsAudienceName ? (
        <div className="name-overlay">
          <form className="name-modal" onSubmit={submitAudienceName}>
            <span className="name-modal-kicker">Identity check</span>
            <h2>Ready to sync?</h2>
            <p className="muted">Enter your display name to join room {room}.</p>
            <input
              className="text-input"
              value={pendingAudienceName}
              onChange={(event) => setPendingAudienceName(event.currentTarget.value)}
              placeholder="Anon from somewhere"
              autoFocus
            />
            <button type="submit">Join Session</button>
          </form>
        </div>
      ) : null}

      {stateMessage || errorMessage ? (
        <header className={`header-panel header-panel-compact ${view === "projector" ? "header-panel-projector" : ""}`}>
          <div className="header-top header-top-compact">
            {stateMessage ? (
              <div className="header-live-stats header-live-stats-design">
                <span className="live-chip live-chip-connected live-chip-compact" title="Participants">
                  <Users size={13} strokeWidth={2} aria-hidden />
                  <strong>{stateMessage.participants}</strong>
                </span>
              </div>
            ) : null}
          </div>
          {errorMessage ? <p className="error header-error">{errorMessage}</p> : null}
        </header>
      ) : null}

      {!stateMessage ? (
        <section className="panel">
          <p className="muted">Waiting for poll state...</p>
        </section>
      ) : null}

      {stateMessage && view === "audience" ? (
        <AudienceView
          stateMessage={stateMessage}
          selectedOptionIds={selectedOptionIds}
          onToggleOption={onAudienceOptionToggle}
          numberGuessInput={numberGuessInput}
          numberGuessError={numberGuessError}
          onNumberGuessInputChange={onNumberGuessInputChange}
          onSubmitNumberGuess={submitNumberGuess}
          sendMessage={sendMessage}
        />
      ) : null}

      {stateMessage && view === "host" ? (
        <HostView
          stateMessage={stateMessage}
          sendMessage={sendMessage}
          canControl={canConnect}
          hostKey={hostKey}
          onHostKeyChange={setHostKey}
          roomLinks={roomLinks}
        />
      ) : null}

      {stateMessage && view === "projector" ? (
        <ProjectorView stateMessage={stateMessage} room={room} sendMessage={sendMessage} />
      ) : null}

      <footer className="app-bottom-bar">
        <span className="app-bottom-left">SynHole</span>
        <div className="app-bottom-right">
          <span>Room: {room}</span>
          <span>Role: {view}</span>
          <span className="app-bottom-status">Status: {status}</span>
          <span>Phase: {phaseLabel[stateMessage?.phase ?? "idle"] ?? "unknown"}</span>
          {showDebug ? <span>debug</span> : null}
        </div>
      </footer>
    </main>
  );
}

// ── Question-kind-specific rendering ────────────────────────────

function QuestionInput(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
  sendMessage: (msg: IncomingMessage) => void;
  // Choice props
  selectedOptionIds: string[];
  onToggleOption: (optionId: string) => void;
  // Number props
  numberGuessInput: string;
  numberGuessError: string | null;
  onNumberGuessInputChange: (v: string) => void;
  onSubmitNumberGuess: () => void;
}) {
  const { stateMessage, sendMessage, selectedOptionIds, onToggleOption, numberGuessInput, numberGuessError, onNumberGuessInputChange, onSubmitNumberGuess } = props;
  const question = stateMessage.question;
  if (!question) return null;
  const votingOpen = stateMessage.phase === "open";

  switch (question.kind) {
    case "choice":
      return (
        <AudienceChoiceOptions
          question={question}
          voteCounts={stateMessage.voteCounts}
          totalResponses={stateMessage.totalResponses}
          selectedOptionIds={selectedOptionIds}
          revealCorrectOptionIds={stateMessage.reveal?.kind === "choice" ? stateMessage.reveal.correctOptionIds : []}
          showResults={stateMessage.resultsVisible}
          canInteract={votingOpen}
          onToggleOption={onToggleOption}
        />
      );
    case "number":
      return (
        <div className="panel audience-number-card">
          <div className="number-guess-row">
            <input
              type="number"
              className="text-input"
              min={question.min}
              max={question.max}
              step={question.step ?? 1}
              value={numberGuessInput}
              onChange={(e) => onNumberGuessInputChange(e.currentTarget.value)}
              placeholder="Enter your guess"
              disabled={!votingOpen}
            />
            <button type="button" onClick={onSubmitNumberGuess} disabled={!votingOpen}>
              Save guess
            </button>
          </div>
          {numberGuessError ? <p className="error">{numberGuessError}</p> : null}
          <NumberResults
            question={question}
            reveal={stateMessage.reveal}
            totalResponses={stateMessage.totalResponses}
            showResults={stateMessage.resultsVisible}
            yourNumberGuess={stateMessage.yourNumberGuess}
          />
        </div>
      );
    case "open_ended":
      return <OpenEndedInput stateMessage={stateMessage} sendMessage={sendMessage} />;
    case "numeric_scale":
    case "draggable_scale":
      return <ScaleInput stateMessage={stateMessage} sendMessage={sendMessage} />;
    case "rating":
      return <RatingInput stateMessage={stateMessage} sendMessage={sendMessage} />;
    case "ranking":
      return <RankingInput stateMessage={stateMessage} sendMessage={sendMessage} />;
    default:
      return null;
  }
}

function OpenEndedInput(props: { stateMessage: Extract<OutgoingMessage, { type: "state" }>; sendMessage: (msg: IncomingMessage) => void }) {
  const { stateMessage, sendMessage } = props;
  const [text, setText] = useState("");
  const votingOpen = stateMessage.phase === "open";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    sendMessage({ type: "submit-open-ended", text: text.trim() });
    setText("");
  }

  return (
    <div className="panel open-ended-card">
      <form className="open-ended-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="text-input"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder="Share your answer..."
          maxLength={200}
          disabled={!votingOpen}
        />
        <button type="submit" disabled={!votingOpen || !text.trim()}>Submit</button>
      </form>
      {stateMessage.openEndedEntries.length > 0 ? (
        <div className="open-ended-list">
          {stateMessage.openEndedEntries.map((entry) => (
            <div key={entry.id} className={`open-ended-entry ${stateMessage.yourOpenEndedVote === entry.id ? "is-voted" : ""}`}>
              <span className="open-ended-text">{entry.text}</span>
              <button
                type="button"
                className="open-ended-vote-btn"
                onClick={() => sendMessage({ type: "vote-open-ended", entryId: entry.id })}
                disabled={!votingOpen}
              >
                👍 {entry.voteCount}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No submissions yet.</p>
      )}
    </div>
  );
}

function ScaleInput(props: { stateMessage: Extract<OutgoingMessage, { type: "state" }>; sendMessage: (msg: IncomingMessage) => void }) {
  const { stateMessage, sendMessage } = props;
  const question = stateMessage.question;
  if (!question || (question.kind !== "numeric_scale" && question.kind !== "draggable_scale")) return null;

  const votingOpen = stateMessage.phase === "open";
  const currentValue = stateMessage.yourScaleValue;
  const [localValue, setLocalValue] = useState<number>(currentValue ?? Math.round((question.min + question.max) / 2));

  useEffect(() => {
    if (currentValue !== null) setLocalValue(currentValue);
  }, [currentValue]);

  return (
    <div className="panel scale-card">
      <div className="scale-labels">
        <span>{question.minLabel ?? question.min}</span>
        <span>{question.maxLabel ?? question.max}</span>
      </div>
      <input
        type="range"
        className="scale-slider"
        min={question.min}
        max={question.max}
        step={1}
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.currentTarget.value))}
        disabled={!votingOpen}
      />
      <div className="scale-value-row">
        <span className="scale-current-value">{localValue}</span>
        <button
          type="button"
          onClick={() => sendMessage({ type: "vote-scale", value: localValue })}
          disabled={!votingOpen}
        >
          {currentValue !== null ? "Update" : "Submit"}
        </button>
      </div>
      {stateMessage.resultsVisible && stateMessage.scaleDistribution ? (
        <ScaleDistribution distribution={stateMessage.scaleDistribution} min={question.min} max={question.max} />
      ) : null}
    </div>
  );
}

function ScaleDistribution(props: { distribution: Record<number, number>; min: number; max: number }) {
  const { distribution, min, max } = props;
  const maxCount = Math.max(...Object.values(distribution), 1);
  const total = Object.values(distribution).reduce((s, c) => s + c, 0);

  return (
    <div className="scale-distribution">
      <p className="muted">{total} response{total !== 1 ? "s" : ""}</p>
      <div className="scale-bars">
        {Array.from({ length: max - min + 1 }, (_, i) => {
          const val = min + i;
          const count = distribution[val] ?? 0;
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div key={val} className="scale-bar-col">
              <div className="scale-bar-track">
                <div className="scale-bar-fill" style={{ height: `${pct}%` }} />
              </div>
              <span className="scale-bar-label">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RatingInput(props: { stateMessage: Extract<OutgoingMessage, { type: "state" }>; sendMessage: (msg: IncomingMessage) => void }) {
  const { stateMessage, sendMessage } = props;
  const question = stateMessage.question;
  if (!question || question.kind !== "rating") return null;

  const votingOpen = stateMessage.phase === "open";
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const currentRating = stateMessage.yourRating;

  return (
    <div className="panel rating-card">
      <div className="rating-stars">
        {Array.from({ length: question.maxRating }, (_, i) => {
          const starValue = i + 1;
          const isFilled = hoveredStar !== null ? starValue <= hoveredStar : (currentRating !== null && starValue <= currentRating);
          return (
            <button
              key={starValue}
              type="button"
              className={`rating-star ${isFilled ? "is-filled" : ""}`}
              onMouseEnter={() => setHoveredStar(starValue)}
              onMouseLeave={() => setHoveredStar(null)}
              onClick={() => sendMessage({ type: "vote-rating", value: starValue })}
              disabled={!votingOpen}
              aria-label={`Rate ${starValue} of ${question.maxRating}`}
            >
              <Star size={28} strokeWidth={2} fill={isFilled ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
      {currentRating !== null ? <p className="muted">Your rating: {currentRating}/{question.maxRating}</p> : null}
      {stateMessage.resultsVisible && stateMessage.averageRating !== null ? (
        <div className="rating-results">
          <p className="muted">Average: {stateMessage.averageRating} / {question.maxRating}</p>
          <p className="muted">{stateMessage.totalResponses} rating{stateMessage.totalResponses !== 1 ? "s" : ""}</p>
        </div>
      ) : null}
    </div>
  );
}

function RankingInput(props: { stateMessage: Extract<OutgoingMessage, { type: "state" }>; sendMessage: (msg: IncomingMessage) => void }) {
  const { stateMessage, sendMessage } = props;
  const question = stateMessage.question;
  if (!question || question.kind !== "ranking") return null;

  const votingOpen = stateMessage.phase === "open";
  const [ranking, setRanking] = useState<string[]>(() =>
    stateMessage.yourRanking ?? question.items.map((i) => i.id)
  );

  useEffect(() => {
    if (stateMessage.yourRanking) setRanking(stateMessage.yourRanking);
  }, [stateMessage.yourRanking]);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...ranking];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setRanking(next);
  }

  function moveDown(index: number) {
    if (index >= ranking.length - 1) return;
    const next = [...ranking];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setRanking(next);
  }

  const itemMap = new Map(question.items.map((i) => [i.id, i.label]));

  return (
    <div className="panel ranking-card">
      <div className="ranking-list">
        {ranking.map((id, index) => (
          <div key={id} className="ranking-item">
            <span className="ranking-position">{index + 1}</span>
            <span className="ranking-label">{itemMap.get(id) ?? id}</span>
            <div className="ranking-buttons">
              <button type="button" onClick={() => moveUp(index)} disabled={!votingOpen || index === 0}>↑</button>
              <button type="button" onClick={() => moveDown(index)} disabled={!votingOpen || index >= ranking.length - 1}>↓</button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => sendMessage({ type: "vote-ranking", ranking })}
        disabled={!votingOpen}
      >
        {stateMessage.yourRanking ? "Update Ranking" : "Submit Ranking"}
      </button>
      {stateMessage.resultsVisible && stateMessage.rankingResults ? (
        <div className="ranking-results">
          <p className="muted">{stateMessage.totalResponses} response{stateMessage.totalResponses !== 1 ? "s" : ""}</p>
          {stateMessage.rankingResults.map((r) => (
            <div key={r.id} className="ranking-result-row">
              <span className="ranking-result-position">#{r.position}</span>
              <span className="ranking-result-label">{r.label}</span>
              <span className="ranking-result-avg">Avg: {r.averageRank}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Question results for host/projector ─────────────────────────

function QuestionResults(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
}) {
  const { stateMessage } = props;
  const question = stateMessage.question;
  if (!question) return null;

  switch (question.kind) {
    case "choice":
      return (
        <HostPreviewChoiceResults
          question={question}
          voteCounts={stateMessage.voteCounts}
          totalResponses={stateMessage.totalResponses}
          showResults={stateMessage.resultsVisible}
        />
      );
    case "number":
      return (
        <NumberResults
          question={question}
          reveal={stateMessage.reveal}
          totalResponses={stateMessage.totalResponses}
          showResults={stateMessage.resultsVisible}
          yourNumberGuess={null}
        />
      );
    case "open_ended":
      return (
        <div className="open-ended-results">
          {stateMessage.openEndedEntries.length > 0 ? (
            stateMessage.openEndedEntries.map((e) => (
              <div key={e.id} className="open-ended-entry">
                <span className="open-ended-text">{e.text}</span>
                <span className="open-ended-vote-count">👍 {e.voteCount}</span>
              </div>
            ))
          ) : (
            <p className="muted">No submissions yet.</p>
          )}
        </div>
      );
    case "numeric_scale":
    case "draggable_scale":
      return stateMessage.scaleDistribution ? (
        <ScaleDistribution distribution={stateMessage.scaleDistribution} min={question.min} max={question.max} />
      ) : (
        <p className="muted">No responses yet.</p>
      );
    case "rating":
      return (
        <div className="rating-results">
          {stateMessage.averageRating !== null ? (
            <>
              <p className="muted">Average: {stateMessage.averageRating} / {question.maxRating}</p>
              <p className="muted">{stateMessage.totalResponses} rating{stateMessage.totalResponses !== 1 ? "s" : ""}</p>
            </>
          ) : (
            <p className="muted">No ratings yet.</p>
          )}
        </div>
      );
    case "ranking":
      return stateMessage.rankingResults ? (
        <div className="ranking-results">
          {stateMessage.rankingResults.map((r) => (
            <div key={r.id} className="ranking-result-row">
              <span className="ranking-result-position">#{r.position}</span>
              <span className="ranking-result-label">{r.label}</span>
              <span className="ranking-result-avg">Avg: {r.averageRank}</span>
            </div>
          ))}
          <p className="muted">{stateMessage.totalResponses} response{stateMessage.totalResponses !== 1 ? "s" : ""}</p>
        </div>
      ) : (
        <p className="muted">No rankings yet.</p>
      );
    default:
      return null;
  }
}

// ── Social Interactions sidebar ─────────────────────────────────

function InteractionsSidebar(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
  sendMessage: (msg: IncomingMessage) => void;
  role: PollRole;
}) {
  const { stateMessage, sendMessage, role } = props;
  const [activeTab, setActiveTab] = useState<"qna" | "chat" | "wordcloud" | "reactions">("qna");

  return (
    <div className="interactions-sidebar">
      <div className="interactions-tabs">
        <button type="button" className={`tab-btn ${activeTab === "qna" ? "is-active" : ""}`} onClick={() => setActiveTab("qna")}>Q&A</button>
        <button type="button" className={`tab-btn ${activeTab === "chat" ? "is-active" : ""}`} onClick={() => setActiveTab("chat")}>Chat</button>
        <button type="button" className={`tab-btn ${activeTab === "wordcloud" ? "is-active" : ""}`} onClick={() => setActiveTab("wordcloud")}>Cloud</button>
        <button type="button" className={`tab-btn ${activeTab === "reactions" ? "is-active" : ""}`} onClick={() => setActiveTab("reactions")}>React</button>
      </div>
      <div className="interactions-content">
        {activeTab === "qna" ? (
          <QnAPanel
            role={role}
            questions={stateMessage.qna ?? []}
            onSubmitQuestion={(text) => sendMessage({ type: "submit-qna", text })}
            onUpvote={(questionId) => sendMessage({ type: "upvote-qna", questionId })}
            onMarkAnswered={(questionId) => sendMessage({ type: "mark-answered", questionId })}
          />
        ) : null}
        {activeTab === "chat" ? (
          <ChatPanel
            role={role}
            messages={stateMessage.chat ?? []}
            onSendMessage={(text) => sendMessage({ type: "send-chat", text })}
          />
        ) : null}
        {activeTab === "wordcloud" ? (
          <WordCloudPanel
            role={role}
            words={stateMessage.wordCloud ?? []}
            onSubmitWord={(word) => sendMessage({ type: "submit-word", word })}
          />
        ) : null}
        {activeTab === "reactions" ? (
          <ReactionsPanel
            role={role}
            reactions={stateMessage.reactions ?? []}
            onSubmitReaction={(emoji) => sendMessage({ type: "submit-reaction", emoji })}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Views ───────────────────────────────────────────────────────

function AudienceView(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
  selectedOptionIds: string[];
  onToggleOption: (optionId: string) => void;
  numberGuessInput: string;
  numberGuessError: string | null;
  onNumberGuessInputChange: (value: string) => void;
  onSubmitNumberGuess: () => void;
  sendMessage: (msg: IncomingMessage) => void;
}) {
  const {
    stateMessage,
    selectedOptionIds,
    onToggleOption,
    numberGuessInput,
    numberGuessError,
    onNumberGuessInputChange,
    onSubmitNumberGuess,
    sendMessage,
  } = props;
  const question = stateMessage.question;
  const votingOpen = stateMessage.phase === "open";

  return (
    <section className="audience-layout">
      <div className="audience-left">
        {question ? (
          <>
            <div className="audience-meta-row">
              <span className="question-pill">
                Question {stateMessage.currentQuestionIndex + 1}/{stateMessage.totalQuestions}
              </span>
              <span className="question-pill" style={{ background: "#e8e5e3", color: "#555" }}>
                {getQuestionKindLabel(question.kind)}
              </span>
              <span className={`audience-live-dot ${votingOpen ? "is-live" : ""}`}>
                {votingOpen ? "Live" : "Waiting"}
              </span>
              <span className="audience-answered-pill">
                {stateMessage.totalResponses} answered
              </span>
            </div>
            <h2 className="audience-hero">{renderAudiencePrompt(question.prompt)}</h2>
          </>
        ) : (
          <>
            <h2 className="audience-hero">Waiting for host</h2>
            <p className="muted">Host has not selected a question yet.</p>
          </>
        )}
        <InteractionsSidebar stateMessage={stateMessage} sendMessage={sendMessage} role="audience" />
      </div>

      <div className="audience-right">
        <QuestionInput
          stateMessage={stateMessage}
          sendMessage={sendMessage}
          selectedOptionIds={selectedOptionIds}
          onToggleOption={onToggleOption}
          numberGuessInput={numberGuessInput}
          numberGuessError={numberGuessError}
          onNumberGuessInputChange={onNumberGuessInputChange}
          onSubmitNumberGuess={onSubmitNumberGuess}
        />
        {question ? (
          <div className="audience-total-card">
            {stateMessage.totalResponses} total answers submitted
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HostView(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
  sendMessage: (message: IncomingMessage) => void;
  canControl: boolean;
  hostKey: string;
  onHostKeyChange: (value: string) => void;
  roomLinks: ReturnType<typeof getRoomLinks>;
}) {
  const {
    stateMessage,
    sendMessage,
    canControl,
    hostKey,
    onHostKeyChange,
    roomLinks,
  } = props;
  const hostQuestions = stateMessage.host?.questions ?? [];
  const question = stateMessage.question;
  const hasNextQuestion = stateMessage.currentQuestionIndex < stateMessage.totalQuestions - 1;
  const smartNextAction = getSmartNextAction(stateMessage.phase, hasNextQuestion);
  const smartNextLabel = getSmartNextLabel(smartNextAction);
  const smartNextDescription = getSmartNextDescription(smartNextAction);
  const [copiedLink, setCopiedLink] = useState<"audience" | "projector" | "host" | null>(null);
  const [showManual, setShowManual] = useState(false);

  function runSmartNext() {
    switch (smartNextAction) {
      case "open":
        sendMessage({ type: "open-voting" });
        return;
      case "close":
        sendMessage({ type: "close-voting" });
        return;
      case "reveal":
        sendMessage({ type: "reveal" });
        return;
      case "switch":
        sendMessage({ type: "set-question", questionIndex: stateMessage.currentQuestionIndex + 1 });
        return;
      case "none":
        return;
    }
  }

  function copyShareLink(target: "audience" | "projector" | "host", url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(target);
      window.setTimeout(() => setCopiedLink((current) => (current === target ? null : current)), 1200);
    });
  }

  return (
    <section className="host-layout">
      <div className="host-left-column">
        <section className="panel host-card">
          <div className="host-card-heading">
            <div>
              <h2>Control Panel</h2>
              <p className="muted">Manage room visibility and access</p>
            </div>
            <span className={`host-lock-chip ${canControl ? "host-lock-open" : "host-lock-closed"}`}>
              <LockKeyhole size={12} strokeWidth={2} aria-hidden />
              {canControl ? "Unlocked" : "Locked"}
            </span>
          </div>

          <label className="host-input-label">
            Host Access Key
            <div className="host-key-row">
              <input className="text-input" value={hostKey} onChange={(event) => onHostKeyChange(event.currentTarget.value)} placeholder="Host key" type="password" />
              <span className="host-key-eye" aria-hidden><Eye size={15} strokeWidth={2} /></span>
            </div>
          </label>

          <div className="button-row">
            <button type="button" className="host-secondary-btn" onClick={() => sendMessage({ type: "close-voting" })} disabled={!canControl}>
              <Lock size={14} strokeWidth={2} aria-hidden /> Lock Room
            </button>
            <button type="button" className="host-primary-btn" onClick={() => setShowManual((c) => !c)}>
              <Settings size={14} strokeWidth={2} aria-hidden /> Settings
            </button>
          </div>
        </section>

        <section className="panel host-card">
          <div className="host-card-heading">
            <div>
              <h3>Active Question</h3>
              <p className="muted">Select and launch polling phases</p>
            </div>
          </div>

          <label className="host-input-label">
            Select Question
            <select
              value={stateMessage.currentQuestionIndex}
              onChange={(e) => sendMessage({ type: "set-question", questionIndex: Number(e.currentTarget.value) })}
              disabled={!canControl}
            >
              {hostQuestions.map((item, index) => (
                <option key={item.id} value={index}>
                  Q{index + 1} [{item.kind}]: {item.prompt}
                </option>
              ))}
            </select>
          </label>

          <div className="host-next-phase-card">
            <span>Next Phase</span>
            <p>{smartNextLabel}</p>
            <small>{smartNextDescription}</small>
          </div>

          <button type="button" className="host-launch-btn" onClick={runSmartNext} disabled={!canControl || smartNextAction === "none"}>
            Next: {smartNextLabel}
            <Rocket size={15} strokeWidth={2} aria-hidden />
          </button>

          {showManual ? (
            <div className="host-manual-row">
              <button onClick={() => sendMessage({ type: "open-voting" })} disabled={!canControl}>Open</button>
              <button onClick={() => sendMessage({ type: "close-voting" })} disabled={!canControl}>Close</button>
              <button onClick={() => sendMessage({ type: "reveal" })} disabled={!canControl}>Reveal</button>
              <button onClick={() => sendMessage({ type: "reset-session" })} disabled={!canControl}>Reset</button>
            </div>
          ) : null}
        </section>

        <section className="panel nested-panel share-links-panel">
          <h3>Share Links</h3>
          <div className="link-rows">
            {(["audience", "projector", "host"] as const).map((target) => (
              <div className="link-row" key={target}>
                <span className="link-row-label">
                  <Link2 size={14} strokeWidth={2} aria-hidden />
                  {target.charAt(0).toUpperCase() + target.slice(1)}
                </span>
                <div className="link-row-actions">
                  <a href={roomLinks[target]} target="_blank" rel="noreferrer">Open</a>
                  <button className="copy-link-btn" onClick={() => copyShareLink(target, roomLinks[target])} type="button">
                    {copiedLink === target ? <CheckCheck size={14} strokeWidth={2} aria-hidden /> : <Copy size={14} strokeWidth={2} aria-hidden />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <InteractionsSidebar stateMessage={stateMessage} sendMessage={sendMessage} role="host" />
      </div>

      <div className="host-preview-card">
        <div className="host-preview-top">
          <span>Live Results Preview</span>
          <div className="host-preview-actions" aria-hidden>
            <Maximize2 size={14} strokeWidth={2} />
            <MoreVertical size={14} strokeWidth={2} />
          </div>
        </div>

        <span className="host-preview-question-count">
          Question {stateMessage.currentQuestionIndex + 1} of {stateMessage.totalQuestions}
          {question ? ` [${getQuestionKindLabel(question.kind)}]` : ""}
        </span>
        <h3>{question ? question.prompt : "Waiting for question"}</h3>

        {question ? <QuestionResults stateMessage={stateMessage} /> : null}

        <div className="host-preview-bottom">
          <div className="host-preview-stat">
            <small>Confidence</small>
            <strong>{getConfidenceLabel(stateMessage.totalResponses, stateMessage.participants)}</strong>
          </div>
          <div className="host-preview-stat">
            <small>Active users</small>
            <strong>{stateMessage.totalResponses}/{Math.max(1, stateMessage.participants)}</strong>
          </div>
          <span className="host-preview-phase">
            Phase: {phaseLabel[stateMessage.phase] ?? stateMessage.phase}
          </span>
        </div>
      </div>
    </section>
  );
}

function ProjectorView(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
  room: string;
  sendMessage: (msg: IncomingMessage) => void;
}) {
  const { stateMessage, room, sendMessage } = props;
  const question = stateMessage.question;

  const audienceUrl =
    typeof window === "undefined"
      ? `/r/${encodeURIComponent(room)}`
      : new URL(`/r/${encodeURIComponent(room)}`, window.location.origin).toString();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(audienceUrl)}`;
  const shortLink =
    typeof window === "undefined"
      ? audienceUrl
      : `${window.location.host}${new URL(audienceUrl).pathname}`;

  return (
    <section className="projector-shell">
      <div className="projector-head">
        {question ? (
          <>
            <div className="projector-meta-row">
              <span className="projector-kicker">Current Question</span>
              <span className="projector-answered-pill">
                {stateMessage.totalResponses} answered
              </span>
              <span className="projector-answered-pill">
                {getQuestionKindLabel(question.kind)}
              </span>
            </div>
            <h2 className="projector-title">{question.prompt}</h2>
          </>
        ) : (
          <>
            <h2 className="projector-title">Waiting for host</h2>
            <p className="muted">Host has not selected a question yet.</p>
          </>
        )}
      </div>

      <div className="projector-main-grid">
        <div className="projector-main-left">
          {question ? (
            question.kind === "choice" ? (
              <ProjectorChoiceResults
                question={question}
                voteCounts={stateMessage.voteCounts}
                totalResponses={stateMessage.totalResponses}
                showResults={stateMessage.resultsVisible}
              />
            ) : (
              <QuestionResults stateMessage={stateMessage} />
            )
          ) : null}

          {/* Show reactions on projector */}
          {stateMessage.reactions && stateMessage.reactions.length > 0 ? (
            <ReactionsPanel
              role="projector"
              reactions={stateMessage.reactions}
              onSubmitReaction={() => {}}
            />
          ) : null}
        </div>

        <aside className="projector-side">
          <div className="projector-qr-card">
            <img src={qrUrl} alt="Audience join QR code" className="projector-qr-image" />
            <p className="projector-qr-label">Join via QR or visit</p>
            <p className="projector-qr-link">{shortLink}</p>
          </div>
          {/* Show word cloud on projector */}
          {stateMessage.wordCloud && stateMessage.wordCloud.length > 0 ? (
            <WordCloudPanel
              role="projector"
              words={stateMessage.wordCloud}
              onSubmitWord={() => {}}
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}

// ── Reusable sub-components ─────────────────────────────────────

function ProjectorChoiceResults(props: {
  question: PollChoiceQuestionPublic | PollChoiceQuestion;
  voteCounts: Record<string, number>;
  totalResponses: number;
  showResults: boolean;
}) {
  const { question, voteCounts, totalResponses, showResults } = props;
  const denominator = Math.max(1, totalResponses);
  const maxVotes = Math.max(...question.options.map((option) => voteCounts[option.id] ?? 0), 0);

  return (
    <div className="projector-choice-results">
      {question.options.map((option, index) => {
        const votes = voteCounts[option.id] ?? 0;
        const percent = showResults ? Math.round((votes / denominator) * 100) : 0;
        const isLeading = votes > 0 && votes === maxVotes;
        return (
          <div className="projector-bar-row" key={option.id}>
            <div className="projector-bar-topline">
              <span>{option.label}</span>
              <span>{showResults ? `${percent}%` : "--"}</span>
            </div>
            <div className="projector-bar-track">
              <div
                className={`projector-bar-fill ${isLeading ? "is-leading" : ""}`}
                style={{ width: `${percent}%` }}
              >
                <span className="projector-bar-icon">{String.fromCharCode(97 + (index % 26))}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AudienceChoiceOptions(props: {
  question: PollChoiceQuestionPublic | PollChoiceQuestion;
  voteCounts: Record<string, number>;
  totalResponses: number;
  selectedOptionIds: string[];
  revealCorrectOptionIds: string[];
  showResults: boolean;
  canInteract: boolean;
  onToggleOption: (optionId: string) => void;
}) {
  const { question, voteCounts, totalResponses, selectedOptionIds, revealCorrectOptionIds, showResults, canInteract, onToggleOption } = props;
  const denominator = Math.max(1, totalResponses);

  return (
    <div className="audience-choice-list">
      {question.options.map((option, index) => {
        const votes = voteCounts[option.id] ?? 0;
        const percent = Math.round((votes / denominator) * 100);
        const checked = selectedOptionIds.includes(option.id);
        const isCorrectOption = revealCorrectOptionIds.includes(option.id);
        const feedback = revealCorrectOptionIds.length > 0 ? getAudienceOptionFeedback(checked, isCorrectOption) : null;
        const feedbackLabel = feedback === "missed-correct" ? "Correct" : feedback ? "Your choice" : null;
        return (
          <button
            type="button"
            key={option.id}
            className={`audience-option-card ${checked ? "is-selected" : ""} ${feedback ? `feedback-${feedback}` : ""} ${!canInteract ? "is-locked" : ""}`}
            onClick={() => onToggleOption(option.id)}
            disabled={!canInteract}
          >
            <div className="audience-option-left">
              <small>Option {String.fromCharCode(65 + (index % 26))}</small>
              <strong>{option.label}</strong>
            </div>
            <div className="audience-option-right">
              {showResults ? <span>{percent}%</span> : null}
              {feedback === "selected-correct" || feedback === "missed-correct" ? (
                <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden />
              ) : null}
              {feedbackLabel ? (
                <span className={`audience-option-badge badge-${feedback}`}>{feedbackLabel}</span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function HostPreviewChoiceResults(props: {
  question: PollChoiceQuestionPublic | PollChoiceQuestion;
  voteCounts: Record<string, number>;
  totalResponses: number;
  showResults: boolean;
}) {
  const { question, voteCounts, totalResponses, showResults } = props;
  const denominator = Math.max(1, totalResponses);
  const maxVotes = Math.max(...question.options.map((option) => voteCounts[option.id] ?? 0), 0);

  return (
    <div className="host-preview-results">
      {question.options.map((option) => {
        const votes = voteCounts[option.id] ?? 0;
        const percent = Math.round((votes / denominator) * 100);
        const leading = votes > 0 && votes === maxVotes;
        return (
          <div className="host-preview-result-row" key={option.id}>
            <div className="host-preview-result-top">
              <span>{option.label}</span>
              <span>{showResults ? `${votes} votes (${percent}%)` : "--"}</span>
            </div>
            <div className="host-preview-result-track">
              <div className={`host-preview-result-fill ${leading ? "is-leading" : ""}`} style={{ width: `${showResults ? percent : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumberResults(props: {
  question: PollNumberQuestionPublic | PollNumberQuestion;
  reveal: Extract<OutgoingMessage, { type: "state" }>["reveal"];
  totalResponses: number;
  showResults: boolean;
  yourNumberGuess: number | null;
}) {
  const { question, reveal, totalResponses, showResults, yourNumberGuess } = props;
  const numberReveal = reveal?.kind === "number" ? reveal : null;

  if (!showResults) {
    return <p className="muted">Results are hidden until reveal.</p>;
  }

  return (
    <div className="number-results">
      <p className="muted">{totalResponses} guess{totalResponses === 1 ? "" : "es"} submitted</p>
      {yourNumberGuess !== null ? <p className="muted">Your guess: {yourNumberGuess}</p> : null}
      {numberReveal ? (
        <div className="number-reveal-card">
          <p className="muted">Target number: {numberReveal.correctNumber}</p>
          {numberReveal.winningGuess === null ? (
            <p className="muted">No winners this round (all guesses were over).</p>
          ) : (
            <>
              <p className="muted">Winning guess: {numberReveal.winningGuess}</p>
              <p className="muted">Winner{numberReveal.winnerCount === 1 ? "" : "s"}: {numberReveal.winnerCount}</p>
            </>
          )}
          {numberReveal.isWinner ? <p className="host-lock-chip host-lock-open">You won</p> : null}
        </div>
      ) : (
        <p className="muted">Winning guess will appear after reveal.</p>
      )}
      {question.min !== undefined || question.max !== undefined ? (
        <p className="muted">Allowed range: {question.min ?? "-inf"} to {question.max ?? "+inf"}</p>
      ) : null}
    </div>
  );
}

function renderAudiencePrompt(prompt: string) {
  const words = prompt.trim().split(/\s+/);
  if (words.length < 2) return prompt;
  const last = words[words.length - 1];
  const head = words.slice(0, -1).join(" ");
  return (
    <>
      {head} <span className="audience-prompt-accent">{last}</span>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function getQuestionKindLabel(kind: string): string {
  switch (kind) {
    case "choice": return "Multiple Choice";
    case "number": return "Number Guess";
    case "open_ended": return "Open Ended";
    case "numeric_scale": return "Scale (1–10)";
    case "draggable_scale": return "Slider";
    case "rating": return "Rating";
    case "ranking": return "Ranking";
    default: return kind;
  }
}

function getAudienceOptionFeedback(
  isSelected: boolean,
  isCorrectOption: boolean
): "selected-correct" | "selected-wrong" | "missed-correct" | null {
  if (isSelected && isCorrectOption) return "selected-correct";
  if (isSelected && !isCorrectOption) return "selected-wrong";
  if (!isSelected && isCorrectOption) return "missed-correct";
  return null;
}

function getRoomLinks(room: string, hostKey: string) {
  const roomPath = `/r/${encodeURIComponent(room)}`;
  const hostPath = `${roomPath}/host`;
  if (typeof window === "undefined") {
    const host = hostKey ? `${hostPath}?hostKey=${encodeURIComponent(hostKey)}` : hostPath;
    return { audience: roomPath, projector: `${roomPath}/screen`, host };
  }
  const base = window.location.origin;
  const hostUrl = new URL(hostPath, base);
  if (hostKey) hostUrl.searchParams.set("hostKey", hostKey);
  return {
    audience: `${base}${roomPath}`,
    projector: `${base}${roomPath}/screen`,
    host: hostUrl.toString(),
  };
}

type SmartNextAction = "open" | "close" | "reveal" | "switch" | "none";

function getSmartNextAction(phase: string, hasNextQuestion: boolean): SmartNextAction {
  if (phase === "idle") return "open";
  if (phase === "open") return "close";
  if (phase === "closed") return "reveal";
  return hasNextQuestion ? "switch" : "none";
}

function getSmartNextLabel(action: SmartNextAction): string {
  switch (action) {
    case "open": return "Open";
    case "close": return "Close";
    case "reveal": return "Reveal";
    case "switch": return "Question";
    case "none": return "Done";
  }
}

function getSmartNextDescription(action: SmartNextAction): string {
  switch (action) {
    case "open": return "Allow participants to submit responses in real-time.";
    case "close": return "Pause new submissions and prepare the reveal.";
    case "reveal": return "Reveal correct answers and live aggregate results.";
    case "switch": return "Advance to the next question and reopen voting.";
    case "none": return "Session complete. Reset to run again.";
  }
}

function getConfidenceLabel(totalResponses: number, participants: number): string {
  const denominator = Math.max(1, participants);
  const ratio = totalResponses / denominator;
  if (ratio >= 0.7) return "High";
  if (ratio >= 0.35) return "Medium";
  return "Low";
}

function getOrCreateVoterId(): string {
  if (typeof window === "undefined") return "";
  const existingLocal = window.localStorage.getItem(VOTER_STORAGE_KEY);
  if (existingLocal) return existingLocal;
  const existingSession = window.sessionStorage.getItem(VOTER_STORAGE_KEY);
  if (existingSession) {
    window.localStorage.setItem(VOTER_STORAGE_KEY, existingSession);
    return existingSession;
  }
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `voter-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(VOTER_STORAGE_KEY, id);
  window.sessionStorage.setItem(VOTER_STORAGE_KEY, id);
  return id;
}

function saveAudienceName(value: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(AUDIENCE_NAME_STORAGE_KEY, value);
}

function readAudienceName() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUDIENCE_NAME_STORAGE_KEY) ?? "";
}

function saveHostKey(value: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(HOST_KEY_STORAGE_KEY, value);
}

function readHostKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(HOST_KEY_STORAGE_KEY) ?? "";
}
