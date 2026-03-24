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
        <ProjectorView stateMessage={stateMessage} room={room} />
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
    onSubmitNumberGuess,
  } = props;
  const question = stateMessage.question;
  if (!question) {
    return (
      <section className="panel audience-panel">
        <h2>Audience</h2>
        <p className="muted">Host has not selected a question yet.</p>
      </section>
    );
  }

  const votingOpen = stateMessage.phase === "open";
  const revealChoice = stateMessage.reveal?.kind === "choice" ? stateMessage.reveal : null;

  if (question.kind === "number") {
    return (
      <section className="audience-layout">
        <div className="audience-left">
          <div className="audience-meta-row">
            <span className="question-pill">
              Question {stateMessage.currentQuestionIndex + 1}/{stateMessage.totalQuestions}
            </span>
            <span className={`audience-live-dot ${votingOpen ? "is-live" : ""}`}>
              {votingOpen ? "Live" : "Waiting"}
            </span>
            <span className="audience-answered-pill">
              {stateMessage.totalResponses} answered
            </span>
          </div>
          <h2 className="audience-hero">{question.prompt}</h2>
        </div>

        <div className="audience-right">
          <div className="panel audience-number-card">
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
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="audience-layout">
      <div className="audience-left">
        <div className="audience-meta-row">
          <span className="question-pill">
            Question {stateMessage.currentQuestionIndex + 1}/{stateMessage.totalQuestions}
          </span>
          <span className={`audience-live-dot ${votingOpen ? "is-live" : ""}`}>
            {votingOpen ? "Live" : "Closed"}
          </span>
          <span className="audience-answered-pill">
            {stateMessage.totalResponses} answered
          </span>
        </div>
        <h2 className="audience-hero">{renderAudiencePrompt(question.prompt)}</h2>
      </div>

      <div className="audience-right">
        <AudienceChoiceOptions
          question={question}
          voteCounts={stateMessage.voteCounts}
          totalResponses={stateMessage.totalResponses}
          selectedOptionIds={selectedOptionIds}
          revealCorrectOptionIds={revealChoice?.correctOptionIds ?? []}
          showResults={stateMessage.resultsVisible}
          canInteract={votingOpen}
          onToggleOption={onToggleOption}
        />
        <div className="audience-total-card">
          {stateMessage.totalResponses} total answers submitted
        </div>
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
  const [copiedLink, setCopiedLink] = useState<"audience" | "projector" | "host" | null>(
    null
  );
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
        sendMessage({
          type: "set-question",
          questionIndex: stateMessage.currentQuestionIndex + 1,
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
              <input
                className="text-input"
                value={hostKey}
                onChange={(event) => onHostKeyChange(event.currentTarget.value)}
                placeholder="Host key"
                type="password"
              />
              <span className="host-key-eye" aria-hidden>
                <Eye size={15} strokeWidth={2} />
              </span>
            </div>
          </label>

          <div className="button-row">
            <button
              type="button"
              className="host-secondary-btn"
              onClick={() => sendMessage({ type: "close-voting" })}
              disabled={!canControl}
            >
              <Lock size={14} strokeWidth={2} aria-hidden />
              Lock Room
            </button>
            <button
              type="button"
              className="host-primary-btn"
              onClick={() => setShowManual((current) => !current)}
            >
              <Settings size={14} strokeWidth={2} aria-hidden />
              Settings
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
              onChange={(event) =>
                sendMessage({
                  type: "set-question",
                  questionIndex: Number(event.currentTarget.value),
                })
              }
              disabled={!canControl}
            >
              {hostQuestions.map((item, index) => (
                <option key={item.id} value={index}>
                  Q{index + 1}: {item.prompt}
                </option>
              ))}
            </select>
          </label>

          <div className="host-next-phase-card">
            <span>Next Phase</span>
            <p>{smartNextLabel}</p>
            <small>{smartNextDescription}</small>
          </div>

          <button
            type="button"
            className="host-launch-btn"
            onClick={runSmartNext}
            disabled={!canControl || smartNextAction === "none"}
          >
            Next: {smartNextLabel}
            <Rocket size={15} strokeWidth={2} aria-hidden />
          </button>

          {showManual ? (
            <div className="host-manual-row">
              <button onClick={() => sendMessage({ type: "open-voting" })} disabled={!canControl}>
                Open
              </button>
              <button onClick={() => sendMessage({ type: "close-voting" })} disabled={!canControl}>
                Close
              </button>
              <button onClick={() => sendMessage({ type: "reveal" })} disabled={!canControl}>
                Reveal
              </button>
              <button onClick={() => sendMessage({ type: "reset-session" })} disabled={!canControl}>
                Reset
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel nested-panel share-links-panel">
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
        </span>
        <h3>{question ? question.prompt : "Waiting for question"}</h3>

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
            <HostPreviewChoiceResults
              question={question}
              voteCounts={stateMessage.voteCounts}
              totalResponses={stateMessage.totalResponses}
              showResults={stateMessage.resultsVisible}
            />
          )
        ) : null}

        <div className="host-preview-bottom">
          <div className="host-preview-stat">
            <small>Confidence</small>
            <strong>{getConfidenceLabel(stateMessage.totalResponses, stateMessage.participants)}</strong>
          </div>
          <div className="host-preview-stat">
            <small>Active users</small>
            <strong>
              {stateMessage.totalResponses}/{Math.max(1, stateMessage.participants)}
            </strong>
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
}) {
  const { stateMessage, room } = props;
  const question = stateMessage.question;

  if (!question) {
    return (
      <section className="projector-shell">
        <h2>Projector</h2>
        <p className="muted">Waiting for host to select a question.</p>
      </section>
    );
  }

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
        <div className="projector-meta-row">
          <span className="projector-kicker">Current Question</span>
          <span className="projector-answered-pill">
            {stateMessage.totalResponses} answered
          </span>
        </div>
        <h2 className="projector-title">{question.prompt}</h2>
      </div>

      <div className="projector-main-grid">
        <div className="projector-main-left">
          {question.kind === "number" ? (
            <NumberResults
              question={question}
              reveal={stateMessage.reveal}
              totalResponses={stateMessage.totalResponses}
              showResults={stateMessage.resultsVisible}
              yourNumberGuess={null}
            />
          ) : (
            <ProjectorChoiceResults
              question={question}
              voteCounts={stateMessage.voteCounts}
              totalResponses={stateMessage.totalResponses}
              showResults={stateMessage.resultsVisible}
            />
          )}
        </div>

        <aside className="projector-side">
          <div className="projector-qr-card">
            <img src={qrUrl} alt="Audience join QR code" className="projector-qr-image" />
            <p className="projector-qr-label">Join via QR or visit</p>
            <p className="projector-qr-link">{shortLink}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

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
  const {
    question,
    voteCounts,
    totalResponses,
    selectedOptionIds,
    revealCorrectOptionIds,
    showResults,
    canInteract,
    onToggleOption,
  } = props;
  const denominator = Math.max(1, totalResponses);

  return (
    <div className="audience-choice-list">
      {question.options.map((option, index) => {
        const votes = voteCounts[option.id] ?? 0;
        const percent = Math.round((votes / denominator) * 100);
        const checked = selectedOptionIds.includes(option.id);
        const isCorrectOption = revealCorrectOptionIds.includes(option.id);
        const feedback =
          revealCorrectOptionIds.length > 0 ? getAudienceOptionFeedback(checked, isCorrectOption) : null;
        const feedbackLabel = feedback === "missed-correct" ? "Correct" : feedback ? "Your choice" : null;
        return (
          <button
            type="button"
            key={option.id}
            className={`audience-option-card ${checked ? "is-selected" : ""} ${
              feedback ? `feedback-${feedback}` : ""
            } ${!canInteract ? "is-locked" : ""}`}
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
              <div
                className={`host-preview-result-fill ${leading ? "is-leading" : ""}`}
                style={{ width: `${showResults ? percent : 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderAudiencePrompt(prompt: string) {
  const words = prompt.trim().split(/\s+/);
  if (words.length < 2) {
    return prompt;
  }
  const last = words[words.length - 1];
  const head = words.slice(0, -1).join(" ");
  return (
    <>
      {head} <span className="audience-prompt-accent">{last}</span>
    </>
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
    showAudienceFeedback = false,
  } = props;
  if (!showResults && !showOptionsWhenHidden) {
    return <p className="muted">Results are hidden until reveal.</p>;
  }
  const denominator = Math.max(1, totalResponses);

  return (
    <div className="results">
      {question.options.map((option, optionIndex) => {
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
            } ${feedback ? `feedback-${feedback}` : ""} ${checked ? "row-selected" : ""}`}
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
                  <span className="option-index">
                    {String.fromCharCode(65 + (optionIndex % 26))}
                  </span>
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
  if (isSelected && isCorrectOption) return "selected-correct";
  if (isSelected && !isCorrectOption) return "selected-wrong";
  if (!isSelected && isCorrectOption) return "missed-correct";
  return null;
}

function getRoomLinks(room: string, hostKey: string) {
  const roomPath = `/r/${encodeURIComponent(room)}`;
  const hostPath = `${roomPath}/host`;
  if (typeof window === "undefined") {
    const host = hostKey
      ? `${hostPath}?hostKey=${encodeURIComponent(hostKey)}`
      : hostPath;
    return {
      audience: roomPath,
      projector: `${roomPath}/screen`,
      host,
    };
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

function getSmartNextAction(
  phase: Extract<OutgoingMessage, { type: "state" }>["phase"],
  hasNextQuestion: boolean
): SmartNextAction {
  if (phase === "idle") return "open";
  if (phase === "open") return "close";
  if (phase === "closed") return "reveal";
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

function getSmartNextDescription(action: SmartNextAction): string {
  switch (action) {
    case "open":
      return "Allow participants to submit responses in real-time.";
    case "close":
      return "Pause new submissions and prepare the reveal.";
    case "reveal":
      return "Reveal correct answers and live aggregate results.";
    case "switch":
      return "Advance to the next question and reopen voting.";
    case "none":
      return "Session complete. Reset to run again.";
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
