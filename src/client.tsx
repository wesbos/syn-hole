import "./styles.css";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import usePartySocket from "partysocket/react";
import { Check, CheckCheck, Copy, Eye, Link2, LockKeyhole, Trophy, Users } from "lucide-react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams
} from "react-router-dom";
import type {
  IncomingMessage,
  OutgoingMessage,
  PollChoiceQuestion,
  PollChoiceQuestionPublic,
  PollNumberQuestion,
  PollNumberQuestionPublic,
  PollRole
} from "./types";

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
  revealed: "Answer revealed"
};

function PollPage(props: { view: ViewMode }) {
  const { view } = props;
  const params = useParams<{ room: string }>();
  const room = params.room ?? DEFAULT_ROOM;
  const [searchParams] = useSearchParams();
  const role: PollRole =
    view === "host"
      ? "host"
      : view === "projector"
        ? "projector"
        : "audience";
  const showDebug = searchParams.get("debug") === "1";

  const [hostKey, setHostKey] = useState(() => {
    const urlHostKey = searchParams.get("hostKey") ?? searchParams.get("key");
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
      hostKey: role === "host" ? hostKey.trim() : undefined
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
    }
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
    const urlHostKey = searchParams.get("hostKey") ?? searchParams.get("key");
    if (!urlHostKey) {
      return;
    }
    setHostKey(urlHostKey);
    saveHostKey(urlHostKey);
  }, [searchParams]);

  useEffect(() => {
    if (!hostKey.trim()) {
      return;
    }
    saveHostKey(hostKey.trim());
  }, [hostKey]);

  useEffect(() => {
    if (role !== "audience" || !needsAudienceName) {
      return;
    }

    let cancelled = false;

    void fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("bootstrap request failed");
        }
        return (await response.json()) as { defaultAudienceName?: unknown };
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        const suggested =
          typeof data.defaultAudienceName === "string" && data.defaultAudienceName.trim().length > 0
            ? data.defaultAudienceName
            : "Anon from somewhere";
        setPendingAudienceName((current) => (current.trim().length > 0 ? current : suggested));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
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
    if (!question || question.kind !== "choice") {
      return;
    }
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

    sendMessage({
      type: "vote",
      optionIds: nextOptionIds
    });
  }

  function onNumberGuessInputChange(value: string) {
    setNumberGuessInput(value);
    if (numberGuessError) {
      setNumberGuessError(null);
    }
  }

  function submitNumberGuess() {
    if (!question || question.kind !== "number") {
      return;
    }

    const trimmed = numberGuessInput.trim();
    if (trimmed.length === 0) {
      setNumberGuessError(null);
      sendMessage({
        type: "vote-number",
        value: null
      });
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
    sendMessage({
      type: "vote-number",
      value: parsed
    });
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
    <main className={`app app-${view}`}>
      {needsAudienceName ? (
        <div className="name-overlay">
          <form className="name-modal" onSubmit={submitAudienceName}>
            <h2>What should we call you?</h2>
            <input
              className="text-input"
              value={pendingAudienceName}
              onChange={(event) => setPendingAudienceName(event.currentTarget.value)}
              placeholder="Anon from somewhere"
              autoFocus
            />
            <button type="submit">Join</button>
          </form>
        </div>
      ) : null}

      <header className="panel header-panel">
        <div className="header-top">
          <h1>Syntax Live Polls</h1>
          {stateMessage ? (
            <div className="header-live-stats">
              <span className="live-chip" title="Connected">
                <Users size={14} strokeWidth={2} aria-hidden />
                <strong>{stateMessage.participants}</strong>
              </span>
              <span className="live-chip" title="Answered">
                <Check size={14} strokeWidth={2} aria-hidden />
                <strong>{stateMessage.totalResponses}</strong>
              </span>
              {view === "audience" && stateMessage.score ? (
                <span className="live-chip" title="Score">
                  <Trophy size={14} strokeWidth={2} aria-hidden />
                  <strong>
                    {stateMessage.score.correct}/{stateMessage.score.answered}
                  </strong>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </header>

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
        <ProjectorView stateMessage={stateMessage} />
      ) : null}

      {showDebug ? (
        <footer className="debug-footer">
          Room {room} | Role {view} | {status} | Phase{" "}
          {phaseLabel[stateMessage?.phase ?? "idle"] ?? "Unknown"}
        </footer>
      ) : null}
    </main>
  );
}

function AudienceView(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
  selectedOptionIds: string[];
  onToggleOption: (optionId: string) => void;
  numberGuessInput: string;
  numberGuessError: string | null;
  onNumberGuessInputChange: (value: string) => void;
  onSubmitNumberGuess: () => void;
}) {
  const {
    stateMessage,
    selectedOptionIds,
    onToggleOption,
    numberGuessInput,
    numberGuessError,
    onNumberGuessInputChange,
    onSubmitNumberGuess
  } = props;
  const question = stateMessage.question;
  if (!question) {
    return (
      <section className="panel">
        <h2>Audience</h2>
        <p className="muted">Host has not selected a question yet.</p>
      </section>
    );
  }

  const votingOpen = stateMessage.phase === "open";

  if (question.kind === "number") {
    return (
      <section className="panel">
        <h2>{question.prompt}</h2>
        <div className="number-guess-row">
          <input
            type="number"
            className="text-input"
            min={question.min}
            max={question.max}
            step={question.step ?? 1}
            value={numberGuessInput}
            onChange={(event) => onNumberGuessInputChange(event.currentTarget.value)}
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
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{question.prompt}</h2>

      <ResultsList
        question={question}
        voteCounts={stateMessage.voteCounts}
        totalResponses={stateMessage.totalResponses}
        revealCorrectOptionIds={
          stateMessage.reveal?.kind === "choice" ? stateMessage.reveal.correctOptionIds : []
        }
        showResults={stateMessage.resultsVisible}
        showOptionsWhenHidden
        selectable
        selectedOptionIds={selectedOptionIds}
        inputType={question.allowMultiple ? "checkbox" : "radio"}
        selectionName="audience-option"
        canInteract={votingOpen}
        onToggleOption={onToggleOption}
        showAudienceFeedback
      />
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
    roomLinks
  } = props;
  const hostQuestions = stateMessage.host?.questions ?? [];
  const question = stateMessage.question;
  const hasNextQuestion = stateMessage.currentQuestionIndex < stateMessage.totalQuestions - 1;
  const smartNextAction = getSmartNextAction(stateMessage.phase, hasNextQuestion);
  const [copiedLink, setCopiedLink] = useState<"audience" | "projector" | "host" | null>(
    null
  );

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
        sendMessage({
          type: "set-question",
          questionIndex: stateMessage.currentQuestionIndex + 1
        });
        return;
      case "none":
        return;
    }
  }

  function copyShareLink(
    target: "audience" | "projector" | "host",
    url: string
  ) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(target);
      window.setTimeout(() => {
        setCopiedLink((current) => (current === target ? null : current));
      }, 1200);
    });
  }

  return (
    <section className="panel">
      <h2>Host Controls</h2>

      <div className="host-key-row">
        <input
          className="text-input"
          value={hostKey}
          onChange={(event) => onHostKeyChange(event.currentTarget.value)}
          placeholder="Host key"
        />
      </div>

      <p className={`host-lock-chip ${canControl ? "host-lock-open" : "host-lock-closed"}`}>
        <LockKeyhole size={12} strokeWidth={2} aria-hidden />
        {canControl ? "Unlocked" : "Locked"}
      </p>

      <div className="host-controls">
        <label>
          Current question
          <select
            value={stateMessage.currentQuestionIndex}
            onChange={(event) =>
              sendMessage({
                type: "set-question",
                questionIndex: Number(event.currentTarget.value)
              })
            }
            disabled={!canControl}
          >
            {hostQuestions.map((item, index) => (
              <option key={item.id} value={index}>
                {index + 1}. {item.prompt}
              </option>
            ))}
          </select>
        </label>

        <div className="button-row">
          <button
            onClick={runSmartNext}
            disabled={!canControl || smartNextAction === "none"}
          >
            Next: {getSmartNextLabel(smartNextAction)}
          </button>
          <button
            onClick={() => sendMessage({ type: "reset-session" })}
            disabled={!canControl}
          >
            Reset
          </button>
        </div>

        <details className="manual-controls">
          <summary>Manual controls</summary>
          <div className="button-row">
            <button
              onClick={() => sendMessage({ type: "open-voting" })}
              disabled={!canControl}
            >
              Open
            </button>
            <button
              onClick={() => sendMessage({ type: "close-voting" })}
              disabled={!canControl}
            >
              Close
            </button>
            <button
              onClick={() => sendMessage({ type: "reveal" })}
              disabled={!canControl}
            >
              Reveal
            </button>
          </div>
        </details>
      </div>

      {question ? (
        question.kind === "number" ? (
          <NumberResults
            question={question}
            reveal={stateMessage.reveal}
            totalResponses={stateMessage.totalResponses}
            showResults={stateMessage.resultsVisible}
            yourNumberGuess={null}
          />
        ) : (
          <ResultsList
            question={question}
            voteCounts={stateMessage.voteCounts}
            totalResponses={stateMessage.totalResponses}
            revealCorrectOptionIds={
              stateMessage.reveal?.kind === "choice" ? stateMessage.reveal.correctOptionIds : []
            }
            showResults={stateMessage.resultsVisible}
          />
        )
      ) : null}

      <section className="panel nested-panel">
        <h3>Share Links</h3>
        <div className="link-rows">
          <div className="link-row">
            <span className="link-row-label">
              <Link2 size={14} strokeWidth={2} aria-hidden />
              Audience
            </span>
            <div className="link-row-actions">
              <a href={roomLinks.audience} target="_blank" rel="noreferrer">
                Open
              </a>
              <button
                className="copy-link-btn"
                onClick={() => copyShareLink("audience", roomLinks.audience)}
                type="button"
              >
                {copiedLink === "audience" ? (
                  <CheckCheck size={14} strokeWidth={2} aria-hidden />
                ) : (
                  <Copy size={14} strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
          </div>
          <div className="link-row">
            <span className="link-row-label">
              <Link2 size={14} strokeWidth={2} aria-hidden />
              Projector
            </span>
            <div className="link-row-actions">
              <a href={roomLinks.projector} target="_blank" rel="noreferrer">
                Open
              </a>
              <button
                className="copy-link-btn"
                onClick={() => copyShareLink("projector", roomLinks.projector)}
                type="button"
              >
                {copiedLink === "projector" ? (
                  <CheckCheck size={14} strokeWidth={2} aria-hidden />
                ) : (
                  <Copy size={14} strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
          </div>
          <div className="link-row">
            <span className="link-row-label">
              <Link2 size={14} strokeWidth={2} aria-hidden />
              Host
            </span>
            <div className="link-row-actions">
              <a href={roomLinks.host} target="_blank" rel="noreferrer">
                Open
              </a>
              <button
                className="copy-link-btn"
                onClick={() => copyShareLink("host", roomLinks.host)}
                type="button"
              >
                {copiedLink === "host" ? (
                  <CheckCheck size={14} strokeWidth={2} aria-hidden />
                ) : (
                  <Copy size={14} strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function ProjectorView(props: {
  stateMessage: Extract<OutgoingMessage, { type: "state" }>;
}) {
  const { stateMessage } = props;
  const question = stateMessage.question;

  if (!question) {
    return (
      <section className="panel projector">
        <h2>Projector</h2>
        <p className="muted">Waiting for host to select a question.</p>
      </section>
    );
  }

  return (
    <section className="panel projector">
      <h2>{question.prompt}</h2>
      <p className="muted big">
        {stateMessage.totalResponses} response
        {stateMessage.totalResponses === 1 ? "" : "s"}
      </p>
      {question.kind === "number" ? (
        <NumberResults
          question={question}
          reveal={stateMessage.reveal}
          totalResponses={stateMessage.totalResponses}
          showResults={stateMessage.resultsVisible}
          yourNumberGuess={null}
        />
      ) : (
        <ResultsList
          question={question}
          voteCounts={stateMessage.voteCounts}
          totalResponses={stateMessage.totalResponses}
          revealCorrectOptionIds={
            stateMessage.reveal?.kind === "choice" ? stateMessage.reveal.correctOptionIds : []
          }
          showResults={stateMessage.resultsVisible}
          showOptionsWhenHidden
        />
      )}
    </section>
  );
}

function ResultsList(props: {
  question: PollChoiceQuestionPublic | PollChoiceQuestion;
  voteCounts: Record<string, number>;
  totalResponses: number;
  revealCorrectOptionIds: string[];
  showResults: boolean;
  showOptionsWhenHidden?: boolean;
  selectable?: boolean;
  selectedOptionIds?: string[];
  inputType?: "checkbox" | "radio";
  selectionName?: string;
  canInteract?: boolean;
  onToggleOption?: (optionId: string) => void;
  showAudienceFeedback?: boolean;
}) {
  const {
    question,
    voteCounts,
    totalResponses,
    revealCorrectOptionIds,
    showResults,
    showOptionsWhenHidden = false,
    selectable = false,
    selectedOptionIds = [],
    inputType = "radio",
    selectionName = "poll-option",
    canInteract = false,
    onToggleOption,
    showAudienceFeedback = false
  } = props;
  if (!showResults && !showOptionsWhenHidden) {
    return <p className="muted">Results are hidden until reveal.</p>;
  }
  const denominator = Math.max(1, totalResponses);

  return (
    <div className="results">
      {question.options.map((option) => {
        const votes = voteCounts[option.id] ?? 0;
        const percent = showResults ? Math.round((votes / denominator) * 100) : 0;
        const isCorrect = revealCorrectOptionIds.includes(option.id);
        const checked = selectedOptionIds.includes(option.id);
        const isInteractive = selectable && typeof onToggleOption === "function";
        const feedback =
          showAudienceFeedback && revealCorrectOptionIds.length > 0
            ? getAudienceOptionFeedback(checked, isCorrect)
            : null;
        return (
          <label
            className={`result-row ${isCorrect ? "correct" : ""} ${
              isInteractive ? "result-row-interactive" : ""
            } ${feedback ? `feedback-${feedback}` : ""}`}
            key={option.id}
          >
            {isInteractive ? (
              <input
                type={inputType}
                checked={checked}
                name={selectionName}
                onChange={() => onToggleOption(option.id)}
                disabled={!canInteract}
              />
            ) : null}
            <div className="result-content">
              <div className="result-meta">
                <span className="result-label-wrap">
                  <span>{option.label}</span>
                  {feedback ? (
                    <span className={`result-feedback-chip feedback-chip-${feedback}`}>
                      {feedback === "missed-correct" ? "Correct" : "Your choice"}
                    </span>
                  ) : null}
                </span>
                <span>
                  {showResults ? (
                    `${votes} (${percent}%)`
                  ) : (
                    <Eye
                      className="hidden-eye-icon"
                      size={16}
                      strokeWidth={2}
                      aria-label="Hidden result"
                    />
                  )}
                </span>
              </div>
              <div className="result-bar">
                <div
                  key={`${option.id}-${votes}`}
                  className="result-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </label>
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
      <p className="muted">
        {totalResponses} guess{totalResponses === 1 ? "" : "es"} submitted
      </p>
      {yourNumberGuess !== null ? <p className="muted">Your guess: {yourNumberGuess}</p> : null}
      {numberReveal ? (
        <div className="number-reveal-card">
          <p className="muted">Target number: {numberReveal.correctNumber}</p>
          {numberReveal.winningGuess === null ? (
            <p className="muted">No winners this round (all guesses were over).</p>
          ) : (
            <>
              <p className="muted">Winning guess: {numberReveal.winningGuess}</p>
              <p className="muted">
                Winner{numberReveal.winnerCount === 1 ? "" : "s"}: {numberReveal.winnerCount}
              </p>
            </>
          )}
          {numberReveal.isWinner ? <p className="host-lock-chip host-lock-open">You won</p> : null}
        </div>
      ) : (
        <p className="muted">Winning guess will appear after reveal.</p>
      )}
      {question.min !== undefined || question.max !== undefined ? (
        <p className="muted">
          Allowed range: {question.min ?? "-inf"} to {question.max ?? "+inf"}
        </p>
      ) : null}
    </div>
  );
}

function getAudienceOptionFeedback(
  isSelected: boolean,
  isCorrectOption: boolean
): "selected-correct" | "selected-wrong" | "missed-correct" | null {
  if (isSelected && isCorrectOption) {
    return "selected-correct";
  }
  if (isSelected && !isCorrectOption) {
    return "selected-wrong";
  }
  if (!isSelected && isCorrectOption) {
    return "missed-correct";
  }
  return null;
}

function getRoomLinks(room: string, hostKey: string) {
  const base = window.location.origin;
  const roomPath = `/r/${encodeURIComponent(room)}`;
  const hostUrl = new URL(`${base}${roomPath}/host`);
  if (hostKey) {
    hostUrl.searchParams.set("hostKey", hostKey);
  }

  return {
    audience: `${base}${roomPath}`,
    projector: `${base}${roomPath}/screen`,
    host: hostUrl.toString()
  };
}

type SmartNextAction = "open" | "close" | "reveal" | "switch" | "none";

function getSmartNextAction(
  phase: Extract<OutgoingMessage, { type: "state" }>["phase"],
  hasNextQuestion: boolean
): SmartNextAction {
  if (phase === "idle") {
    return "open";
  }
  if (phase === "open") {
    return "close";
  }
  if (phase === "closed") {
    return "reveal";
  }
  return hasNextQuestion ? "switch" : "none";
}

function getSmartNextLabel(action: SmartNextAction): string {
  switch (action) {
    case "open":
      return "Open";
    case "close":
      return "Close";
    case "reveal":
      return "Reveal";
    case "switch":
      return "Question";
    case "none":
      return "Done";
  }
}

function getOrCreateVoterId(): string {
  const existingLocal = window.localStorage.getItem(VOTER_STORAGE_KEY);
  if (existingLocal) {
    return existingLocal;
  }
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
  window.localStorage.setItem(AUDIENCE_NAME_STORAGE_KEY, value);
}

function readAudienceName() {
  return window.localStorage.getItem(AUDIENCE_NAME_STORAGE_KEY) ?? "";
}

function saveHostKey(value: string) {
  window.localStorage.setItem(HOST_KEY_STORAGE_KEY, value);
}

function readHostKey() {
  return window.localStorage.getItem(HOST_KEY_STORAGE_KEY) ?? "";
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/r/${DEFAULT_ROOM}`} replace />} />
        <Route path="/host" element={<Navigate to={`/r/${DEFAULT_ROOM}/host`} replace />} />
        <Route
          path="/screen"
          element={<Navigate to={`/r/${DEFAULT_ROOM}/screen`} replace />}
        />
        <Route path="/r/:room" element={<PollPage view="audience" />} />
        <Route path="/r/:room/host" element={<PollPage view="host" />} />
        <Route path="/r/:room/screen" element={<PollPage view="projector" />} />
        <Route path="*" element={<Navigate to={`/r/${DEFAULT_ROOM}`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<AppRouter />);
