import { Server } from "partyserver";
import type { Connection, ConnectionContext } from "partyserver";
import { eq, and, sql } from "drizzle-orm";
import questionsJson from "./data/questions.json";
import { runMigrations, schema } from "./db";
import type { AppDb } from "./db";
import type {
  ChatMessage,
  IncomingMessage,
  OpenEndedEntry,
  OutgoingMessage,
  PollPhase,
  PollQuestion,
  PollQuestionPublic,
  PollRole,
  QnAQuestion,
  RankingResult,
  ReactionBurst,
  SurveyState,
  VoteCounts,
  WordCloudWord,
} from "./types";

type PollConnectionState = {
  role: PollRole;
  voterId: string | null;
  displayName: string | null;
};

const QUESTIONS = validateQuestions(questionsJson);

export class PollRoom extends Server<Env> {
  static options = { hibernate: true };

  private currentQuestionIndex = 0;
  private readonly phaseByQuestionIndex = new Map<number, PollPhase>();
  private readonly votesByQuestionIndex = new Map<number, Map<string, string[]>>();
  private stateLoaded = false;
  private loadStatePromise: Promise<void> | null = null;
  private db: AppDb | null = null;

  // ── In-memory caches for social interactions ──────────────────
  private qnaQuestions: Array<{
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    upvoteCount: number;
    answered: boolean;
    createdAt: string;
  }> = [];
  private qnaUpvotes = new Map<string, Set<string>>(); // questionId → Set<voterId>
  private chatMessages: ChatMessage[] = [];
  private wordCloudEntries: Array<{ id: string; authorId: string; word: string }> = [];
  private reactionEntries: Array<{ emoji: string; authorId: string; createdAt: string }> = [];
  // Open-ended submissions per question index
  private openEndedByQuestion = new Map<number, Array<{ id: string; text: string; authorId: string; votes: Set<string> }>>();
  // Scale/rating values per question index: voterId → value
  private scaleByQuestion = new Map<number, Map<string, number>>();
  // Ranking per question index: voterId → ranking array
  private rankingByQuestion = new Map<number, Map<string, string[]>>();

  private getDb(): AppDb {
    if (!this.db) {
      this.db = runMigrations(this.ctx.storage);
    }
    return this.db;
  }

  async onRequest(request: Request): Promise<Response> {
    await this.ensureStateLoaded();
    const url = new URL(request.url);

    if (url.pathname.endsWith("/stats") && request.method === "GET") {
      const connections = Array.from(this.getConnections<PollConnectionState>());
      let audienceCount = 0;
      let hostCount = 0;
      let projectorCount = 0;
      for (const conn of connections) {
        if (conn.state?.role === "audience") audienceCount++;
        else if (conn.state?.role === "host") hostCount++;
        else if (conn.state?.role === "projector") projectorCount++;
      }

      const questionStats: Array<{
        index: number;
        id: string;
        prompt: string;
        kind: string;
        phase: string;
        totalVotes: number;
      }> = [];
      for (let i = 0; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        const votes = this.votesByQuestionIndex.get(i);
        const scaleVotes = this.scaleByQuestion.get(i);
        const rankVotes = this.rankingByQuestion.get(i);
        const oeEntries = this.openEndedByQuestion.get(i);
        const totalVotes = (votes?.size ?? 0) + (scaleVotes?.size ?? 0) + (rankVotes?.size ?? 0) + (oeEntries?.length ?? 0);
        questionStats.push({
          index: i,
          id: q.id,
          prompt: q.prompt,
          kind: q.kind,
          phase: this.phaseByQuestionIndex.get(i) ?? "idle",
          totalVotes,
        });
      }

      return Response.json({
        room: this.name,
        currentQuestionIndex: this.currentQuestionIndex,
        totalQuestions: QUESTIONS.length,
        participants: this.getConnectedParticipantCount(),
        audienceCount,
        hostCount,
        projectorCount,
        questions: questionStats,
      });
    }

    if (url.pathname.endsWith("/reset") && request.method === "POST") {
      this.currentQuestionIndex = 0;
      this.phaseByQuestionIndex.clear();
      this.votesByQuestionIndex.clear();
      this.openEndedByQuestion.clear();
      this.scaleByQuestion.clear();
      this.rankingByQuestion.clear();
      this.qnaQuestions = [];
      this.qnaUpvotes.clear();
      this.chatMessages = [];
      this.wordCloudEntries = [];
      this.reactionEntries = [];
      this.clearPersistedState();
      this.broadcastState();
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }

  async onConnect(conn: Connection<PollConnectionState>, ctx: ConnectionContext) {
    await this.ensureStateLoaded();

    const url = new URL(ctx.request.url);
    const role = getRole(url.searchParams.get("role"));
    const voterId =
      role === "audience"
        ? getSafeVoterId(url.searchParams.get("voterId"), conn.id)
        : null;
    const displayName =
      role === "audience" ? sanitizeAudienceName(url.searchParams.get("name")) : null;

    conn.setState({ role, voterId, displayName });
    this.broadcastState();
  }

  async onMessage(
    conn: Connection<PollConnectionState>,
    message: string | ArrayBuffer | ArrayBufferView
  ) {
    await this.ensureStateLoaded();

    if (typeof message !== "string") return;

    const incoming = parseIncomingMessage(message);
    if (!incoming) {
      this.sendError(conn, "Invalid message payload.");
      return;
    }

    if (isHostMessage(incoming) && conn.state?.role !== "host") {
      this.sendError(conn, "Only host connections may send this command.");
      return;
    }

    switch (incoming.type) {
      case "vote":
        this.handleChoiceVote(conn, incoming.optionIds);
        return;
      case "vote-number":
        this.handleNumberVote(conn, incoming.value);
        return;
      case "vote-scale":
        this.handleScaleVote(conn, incoming.value);
        return;
      case "vote-rating":
        this.handleScaleVote(conn, incoming.value);
        return;
      case "vote-ranking":
        this.handleRankingVote(conn, incoming.ranking);
        return;
      case "submit-open-ended":
        this.handleOpenEndedSubmit(conn, incoming.text);
        return;
      case "vote-open-ended":
        this.handleOpenEndedVote(conn, incoming.entryId);
        return;
      case "submit-qna":
        this.handleQnASubmit(conn, incoming.text);
        return;
      case "upvote-qna":
        this.handleQnAUpvote(conn, incoming.questionId);
        return;
      case "mark-answered":
        this.handleQnAMarkAnswered(conn, incoming.questionId);
        return;
      case "send-chat":
        this.handleChatSend(conn, incoming.text);
        return;
      case "submit-word":
        this.handleWordCloudSubmit(conn, incoming.word);
        return;
      case "submit-reaction":
        this.handleReactionSubmit(conn, incoming.emoji);
        return;
      case "submit-survey":
        // Survey responses tracked per-question as votes
        return;
      default:
        this.handleHostCommand(incoming as Exclude<IncomingMessage, { type: "vote" | "vote-number" | "vote-scale" | "vote-rating" | "vote-ranking" | "submit-open-ended" | "vote-open-ended" | "submit-qna" | "upvote-qna" | "mark-answered" | "send-chat" | "submit-word" | "submit-reaction" | "submit-survey" }>);
        return;
    }
  }

  onClose(
    _conn: Connection<PollConnectionState>,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): void {
    this.broadcastState();
  }

  onError(_conn: Connection<PollConnectionState>, _error: unknown): void {
    this.broadcastState();
  }

  // ── Poll handlers ─────────────────────────────────────────────

  private handleChoiceVote(conn: Connection<PollConnectionState>, optionIds: string[]) {
    if (conn.state?.role !== "audience") {
      this.sendError(conn, "Only audience clients can submit votes.");
      return;
    }
    const phase = this.getCurrentPhase();
    if (phase !== "open") {
      this.sendError(conn, "Voting is currently closed.");
      return;
    }
    const question = this.getCurrentQuestion();
    if (!question || !conn.state.voterId) {
      this.sendError(conn, "Unable to register vote for current question.");
      return;
    }
    if (question.kind !== "choice") {
      this.sendError(conn, "This question expects a different input type.");
      return;
    }
    const validated = this.validateChoiceSelection(question, optionIds);
    if (validated.ok === false) {
      this.sendError(conn, validated.message);
      return;
    }
    const votesForQuestion = this.getVotesForQuestion(this.currentQuestionIndex);
    if (validated.optionIds.length === 0) {
      votesForQuestion.delete(conn.state.voterId);
    } else {
      votesForQuestion.set(conn.state.voterId, validated.optionIds);
    }
    this.persistVote(this.currentQuestionIndex, conn.state.voterId, validated.optionIds);
    this.broadcastState();
  }

  private handleNumberVote(conn: Connection<PollConnectionState>, value: number | null) {
    if (conn.state?.role !== "audience") {
      this.sendError(conn, "Only audience clients can submit votes.");
      return;
    }
    const phase = this.getCurrentPhase();
    if (phase !== "open") {
      this.sendError(conn, "Voting is currently closed.");
      return;
    }
    const question = this.getCurrentQuestion();
    if (!question || !conn.state.voterId) {
      this.sendError(conn, "Unable to register vote for current question.");
      return;
    }
    if (question.kind !== "number") {
      this.sendError(conn, "This question expects a different input type.");
      return;
    }
    const validated = this.validateNumberGuess(question, value);
    if (validated.ok === false) {
      this.sendError(conn, validated.message);
      return;
    }
    const votesForQuestion = this.getVotesForQuestion(this.currentQuestionIndex);
    if (validated.value === null) {
      votesForQuestion.delete(conn.state.voterId);
      this.persistVote(this.currentQuestionIndex, conn.state.voterId, []);
      this.broadcastState();
      return;
    }
    const storedSelection = [String(validated.value)];
    votesForQuestion.set(conn.state.voterId, storedSelection);
    this.persistVote(this.currentQuestionIndex, conn.state.voterId, storedSelection);
    this.broadcastState();
  }

  private handleScaleVote(conn: Connection<PollConnectionState>, value: number | null) {
    if (conn.state?.role !== "audience") {
      this.sendError(conn, "Only audience clients can submit votes.");
      return;
    }
    const phase = this.getCurrentPhase();
    if (phase !== "open") {
      this.sendError(conn, "Voting is currently closed.");
      return;
    }
    const question = this.getCurrentQuestion();
    if (!question || !conn.state.voterId) {
      this.sendError(conn, "Unable to register vote.");
      return;
    }
    if (question.kind !== "numeric_scale" && question.kind !== "draggable_scale" && question.kind !== "rating") {
      this.sendError(conn, "This question expects a different input type.");
      return;
    }

    const scaleMap = this.getScaleForQuestion(this.currentQuestionIndex);
    if (value === null) {
      scaleMap.delete(conn.state.voterId);
    } else {
      const min = question.kind === "rating" ? 1 : question.min;
      const max = question.kind === "rating" ? question.maxRating : question.max;
      if (value < min || value > max) {
        this.sendError(conn, `Value must be between ${min} and ${max}.`);
        return;
      }
      scaleMap.set(conn.state.voterId, value);
    }
    // Persist as a vote row with the value
    this.persistVote(this.currentQuestionIndex, conn.state.voterId, value !== null ? [String(value)] : []);
    this.broadcastState();
  }

  private handleRankingVote(conn: Connection<PollConnectionState>, ranking: string[]) {
    if (conn.state?.role !== "audience") {
      this.sendError(conn, "Only audience clients can submit votes.");
      return;
    }
    const phase = this.getCurrentPhase();
    if (phase !== "open") {
      this.sendError(conn, "Voting is currently closed.");
      return;
    }
    const question = this.getCurrentQuestion();
    if (!question || !conn.state.voterId || question.kind !== "ranking") {
      this.sendError(conn, "Unable to register ranking.");
      return;
    }
    const validIds = new Set(question.items.map((item) => item.id));
    if (ranking.length !== question.items.length || !ranking.every((id) => validIds.has(id))) {
      this.sendError(conn, "Invalid ranking: must include all items exactly once.");
      return;
    }
    const rankMap = this.getRankingForQuestion(this.currentQuestionIndex);
    rankMap.set(conn.state.voterId, ranking);
    this.persistVote(this.currentQuestionIndex, conn.state.voterId, ranking);
    this.broadcastState();
  }

  private handleOpenEndedSubmit(conn: Connection<PollConnectionState>, text: string) {
    if (conn.state?.role !== "audience" || !conn.state.voterId) {
      this.sendError(conn, "Only audience clients can submit.");
      return;
    }
    const phase = this.getCurrentPhase();
    if (phase !== "open") {
      this.sendError(conn, "Submissions are currently closed.");
      return;
    }
    const question = this.getCurrentQuestion();
    if (!question || question.kind !== "open_ended") {
      this.sendError(conn, "This question expects a different input type.");
      return;
    }
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!cleaned) {
      this.sendError(conn, "Text cannot be empty.");
      return;
    }
    const entries = this.getOpenEndedForQuestion(this.currentQuestionIndex);
    // Only one submission per voter
    const existing = entries.find((e) => e.authorId === conn.state!.voterId);
    if (existing) {
      existing.text = cleaned;
    } else {
      const id = `oe-${this.currentQuestionIndex}-${conn.state.voterId}`;
      entries.push({ id, text: cleaned, authorId: conn.state.voterId, votes: new Set() });
    }
    // Persist as vote row
    this.persistVote(this.currentQuestionIndex, conn.state.voterId, [cleaned]);
    this.broadcastState();
  }

  private handleOpenEndedVote(conn: Connection<PollConnectionState>, entryId: string) {
    if (conn.state?.role !== "audience" || !conn.state.voterId) {
      this.sendError(conn, "Only audience clients can vote.");
      return;
    }
    const phase = this.getCurrentPhase();
    if (phase !== "open") {
      this.sendError(conn, "Voting is currently closed.");
      return;
    }
    const entries = this.getOpenEndedForQuestion(this.currentQuestionIndex);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      this.sendError(conn, "Entry not found.");
      return;
    }
    // Toggle vote
    if (entry.votes.has(conn.state.voterId)) {
      entry.votes.delete(conn.state.voterId);
    } else {
      entry.votes.add(conn.state.voterId);
    }
    this.broadcastState();
  }

  // ── Q&A handlers ──────────────────────────────────────────────

  private handleQnASubmit(conn: Connection<PollConnectionState>, text: string) {
    if (!conn.state?.voterId) {
      this.sendError(conn, "Must be an audience member to ask questions.");
      return;
    }
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!cleaned) {
      this.sendError(conn, "Question text cannot be empty.");
      return;
    }
    const id = `qna-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const displayName = conn.state.displayName ?? "Anonymous";
    const entry = {
      id,
      text: cleaned,
      authorId: conn.state.voterId,
      authorName: displayName,
      upvoteCount: 0,
      answered: false,
      createdAt: new Date().toISOString(),
    };
    this.qnaQuestions.push(entry);
    this.qnaUpvotes.set(id, new Set());

    // Persist to DB
    const db = this.getDb();
    db.insert(schema.qnaQuestions)
      .values({
        id,
        authorId: conn.state.voterId,
        authorName: displayName,
        text: cleaned,
        upvoteCount: 0,
        answered: 0,
        createdAt: entry.createdAt,
      })
      .run();

    this.broadcastState();
  }

  private handleQnAUpvote(conn: Connection<PollConnectionState>, questionId: string) {
    if (!conn.state?.voterId) {
      this.sendError(conn, "Must be an audience member to upvote.");
      return;
    }
    const upvoters = this.qnaUpvotes.get(questionId);
    const question = this.qnaQuestions.find((q) => q.id === questionId);
    if (!upvoters || !question) {
      this.sendError(conn, "Question not found.");
      return;
    }
    // Toggle upvote
    const db = this.getDb();
    if (upvoters.has(conn.state.voterId)) {
      upvoters.delete(conn.state.voterId);
      question.upvoteCount = Math.max(0, question.upvoteCount - 1);
      db.delete(schema.qnaUpvotes)
        .where(and(eq(schema.qnaUpvotes.questionId, questionId), eq(schema.qnaUpvotes.voterId, conn.state.voterId)))
        .run();
    } else {
      upvoters.add(conn.state.voterId);
      question.upvoteCount += 1;
      db.insert(schema.qnaUpvotes)
        .values({ questionId, voterId: conn.state.voterId })
        .onConflictDoNothing()
        .run();
    }
    // Update count in DB
    db.update(schema.qnaQuestions)
      .set({ upvoteCount: question.upvoteCount })
      .where(eq(schema.qnaQuestions.id, questionId))
      .run();

    this.broadcastState();
  }

  private handleQnAMarkAnswered(conn: Connection<PollConnectionState>, questionId: string) {
    if (conn.state?.role !== "host") {
      this.sendError(conn, "Only host can mark questions as answered.");
      return;
    }
    const question = this.qnaQuestions.find((q) => q.id === questionId);
    if (!question) {
      this.sendError(conn, "Question not found.");
      return;
    }
    question.answered = !question.answered;
    const db = this.getDb();
    db.update(schema.qnaQuestions)
      .set({ answered: question.answered ? 1 : 0 })
      .where(eq(schema.qnaQuestions.id, questionId))
      .run();
    this.broadcastState();
  }

  // ── Chat handlers ─────────────────────────────────────────────

  private handleChatSend(conn: Connection<PollConnectionState>, text: string) {
    if (!conn.state?.voterId && conn.state?.role !== "host") {
      this.sendError(conn, "Must be connected to send messages.");
      return;
    }
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!cleaned) return;

    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const authorId = conn.state?.voterId ?? "host";
    const authorName = conn.state?.displayName ?? (conn.state?.role === "host" ? "Host" : "Anonymous");
    const msg: ChatMessage = {
      id,
      text: cleaned,
      authorId,
      authorName,
      createdAt: new Date().toISOString(),
    };
    this.chatMessages.push(msg);
    // Keep only last 200 messages in memory
    if (this.chatMessages.length > 200) {
      this.chatMessages = this.chatMessages.slice(-200);
    }

    const db = this.getDb();
    db.insert(schema.chatMessages)
      .values({
        id,
        authorId,
        authorName,
        text: cleaned,
        createdAt: msg.createdAt,
      })
      .run();

    this.broadcastState();
  }

  // ── Word Cloud handlers ───────────────────────────────────────

  private handleWordCloudSubmit(conn: Connection<PollConnectionState>, word: string) {
    if (!conn.state?.voterId) {
      this.sendError(conn, "Must be an audience member to submit words.");
      return;
    }
    const cleaned = word.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 50);
    if (!cleaned) {
      this.sendError(conn, "Word cannot be empty.");
      return;
    }

    const id = `wc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.wordCloudEntries.push({ id, authorId: conn.state.voterId, word: cleaned });

    const db = this.getDb();
    db.insert(schema.wordCloudEntries)
      .values({
        id,
        authorId: conn.state.voterId,
        word: cleaned,
        createdAt: new Date().toISOString(),
      })
      .run();

    this.broadcastState();
  }

  // ── Reaction handlers ─────────────────────────────────────────

  private handleReactionSubmit(conn: Connection<PollConnectionState>, emoji: string) {
    if (!conn.state?.voterId) {
      this.sendError(conn, "Must be an audience member to react.");
      return;
    }
    const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "👏", "🔥", "😮"];
    if (!ALLOWED_EMOJIS.includes(emoji)) {
      this.sendError(conn, "Invalid emoji.");
      return;
    }

    this.reactionEntries.push({
      emoji,
      authorId: conn.state.voterId,
      createdAt: new Date().toISOString(),
    });
    // Keep last 500 reactions
    if (this.reactionEntries.length > 500) {
      this.reactionEntries = this.reactionEntries.slice(-500);
    }

    const db = this.getDb();
    const id = `rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.insert(schema.reactionEntries)
      .values({
        id,
        authorId: conn.state.voterId,
        emoji,
        createdAt: new Date().toISOString(),
      })
      .run();

    this.broadcastState();
  }

  // ── Host commands ─────────────────────────────────────────────

  private handleHostCommand(
    message: Extract<IncomingMessage, { type: "set-question" | "open-voting" | "close-voting" | "reveal" | "reset-session" }>
  ) {
    switch (message.type) {
      case "set-question": {
        if (!Number.isInteger(message.questionIndex)) return;
        if (message.questionIndex < 0 || message.questionIndex >= QUESTIONS.length) return;
        this.currentQuestionIndex = message.questionIndex;
        this.phaseByQuestionIndex.set(this.currentQuestionIndex, "open");
        this.persistCurrentQuestionIndex();
        this.persistPhase(this.currentQuestionIndex, "open");
        this.broadcastState();
        return;
      }
      case "open-voting": {
        this.phaseByQuestionIndex.set(this.currentQuestionIndex, "open");
        this.persistPhase(this.currentQuestionIndex, "open");
        this.broadcastState();
        return;
      }
      case "close-voting": {
        this.phaseByQuestionIndex.set(this.currentQuestionIndex, "closed");
        this.persistPhase(this.currentQuestionIndex, "closed");
        this.broadcastState();
        return;
      }
      case "reveal": {
        if (this.getCurrentPhase() === "open") {
          this.phaseByQuestionIndex.set(this.currentQuestionIndex, "closed");
          this.persistPhase(this.currentQuestionIndex, "closed");
          this.broadcastState();
        }
        this.phaseByQuestionIndex.set(this.currentQuestionIndex, "revealed");
        this.persistPhase(this.currentQuestionIndex, "revealed");
        this.broadcastState();
        return;
      }
      case "reset-session": {
        this.currentQuestionIndex = 0;
        this.phaseByQuestionIndex.clear();
        this.votesByQuestionIndex.clear();
        this.openEndedByQuestion.clear();
        this.scaleByQuestion.clear();
        this.rankingByQuestion.clear();
        this.qnaQuestions = [];
        this.qnaUpvotes.clear();
        this.chatMessages = [];
        this.wordCloudEntries = [];
        this.reactionEntries = [];
        this.clearPersistedState();
        this.broadcastState();
        return;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private sendError(connection: Connection<unknown>, message: string) {
    try {
      connection.send(JSON.stringify({ type: "error", message } satisfies OutgoingMessage));
    } catch {
      // Connection may already be closed.
    }
  }

  private broadcastState() {
    const connections = Array.from(this.getConnections<PollConnectionState>());
    for (let index = 0; index < connections.length; index += 1) {
      this.sendState(connections[index]);
    }
  }

  private sendState(connection: Connection<PollConnectionState>) {
    try {
      connection.send(JSON.stringify(this.buildState(connection)));
    } catch {
      // Connection may already be closed.
    }
  }

  private buildState(connection: Connection<PollConnectionState>): OutgoingMessage {
    const role = connection.state?.role ?? "audience";
    const voterId = connection.state?.voterId ?? null;
    const question = this.getCurrentQuestion();
    const phase = this.getCurrentPhase();
    const votesForQuestion = this.getVotesForQuestion(this.currentQuestionIndex);
    const questionPublic = question ? toPublicQuestion(question) : null;
    const resultsVisible = this.shouldShowResults(role, question);

    // Standard choice vote counts
    const voteCounts = resultsVisible
      ? this.getVoteCounts(question, votesForQuestion)
      : this.getEmptyVoteCounts(question);

    const yourSelection = role === "audience" && voterId ? (votesForQuestion.get(voterId) ?? []) : [];
    const yourVoteOptionIds = question?.kind === "choice" ? yourSelection : [];
    const yourNumberGuess = question?.kind === "number" ? parseStoredNumberGuess(question, yourSelection) : null;

    // Scale/rating
    const scaleMap = this.scaleByQuestion.get(this.currentQuestionIndex);
    const yourScaleValue = (question?.kind === "numeric_scale" || question?.kind === "draggable_scale" || question?.kind === "rating")
      && role === "audience" && voterId && scaleMap
      ? (scaleMap.get(voterId) ?? null)
      : null;
    const yourRating = question?.kind === "rating" && yourScaleValue !== null ? yourScaleValue : null;

    // Ranking
    const rankMap = this.rankingByQuestion.get(this.currentQuestionIndex);
    const yourRanking = question?.kind === "ranking" && role === "audience" && voterId && rankMap
      ? (rankMap.get(voterId) ?? null)
      : null;

    // Open ended
    const oeEntries = this.openEndedByQuestion.get(this.currentQuestionIndex) ?? [];
    const openEndedEntries: OpenEndedEntry[] = question?.kind === "open_ended"
      ? oeEntries.map((e) => ({
          id: e.id,
          text: e.text,
          authorId: e.authorId,
          voteCount: e.votes.size,
        })).sort((a, b) => b.voteCount - a.voteCount)
      : [];
    const yourOpenEndedVote = question?.kind === "open_ended" && role === "audience" && voterId
      ? (oeEntries.find((e) => e.votes.has(voterId))?.id ?? null)
      : null;

    const canRevealCorrect = role === "host" || phase === "revealed";
    const winnerResult = question?.kind === "number" ? this.getNumberWinnerResult(question) : null;
    const reveal =
      canRevealCorrect && question
        ? question.kind === "choice"
          ? {
              kind: "choice" as const,
              correctOptionIds: [...question.correctOptionIds],
              isCorrect:
                role === "audience"
                  ? isSelectionCorrect(yourVoteOptionIds, question.correctOptionIds)
                  : undefined,
            }
          : question.kind === "number"
            ? {
                kind: "number" as const,
                correctNumber: question.correctNumber,
                winningGuess: winnerResult?.winningGuess ?? null,
                winnerCount: winnerResult?.winnerCount ?? 0,
                isWinner:
                  role === "audience"
                    ? winnerResult?.winningGuess !== null &&
                      yourNumberGuess !== null &&
                      yourNumberGuess === winnerResult?.winningGuess
                    : undefined,
              }
            : null
        : null;

    const score = role === "audience" && voterId ? this.getScoreForVoter(voterId) : null;
    const participants = this.getConnectedParticipantCount();

    // Scale distribution
    let scaleDistribution: Record<number, number> | null = null;
    if ((question?.kind === "numeric_scale" || question?.kind === "draggable_scale" || question?.kind === "rating") && resultsVisible && scaleMap) {
      scaleDistribution = {};
      for (const v of scaleMap.values()) {
        scaleDistribution[v] = (scaleDistribution[v] ?? 0) + 1;
      }
    }

    // Average rating
    let averageRating: number | null = null;
    if (question?.kind === "rating" && resultsVisible && scaleMap && scaleMap.size > 0) {
      let sum = 0;
      for (const v of scaleMap.values()) sum += v;
      averageRating = Math.round((sum / scaleMap.size) * 100) / 100;
    }

    // Ranking results
    let rankingResults: RankingResult[] | null = null;
    if (question?.kind === "ranking" && resultsVisible && rankMap && rankMap.size > 0) {
      const totalRankers = rankMap.size;
      const sumByItem = new Map<string, number>();
      for (const item of question.items) sumByItem.set(item.id, 0);
      for (const ranking of rankMap.values()) {
        for (let i = 0; i < ranking.length; i++) {
          sumByItem.set(ranking[i], (sumByItem.get(ranking[i]) ?? 0) + (i + 1));
        }
      }
      rankingResults = question.items
        .map((item) => ({
          id: item.id,
          label: item.label,
          averageRank: Math.round(((sumByItem.get(item.id) ?? 0) / totalRankers) * 100) / 100,
          position: 0,
        }))
        .sort((a, b) => a.averageRank - b.averageRank);
      rankingResults.forEach((r, i) => { r.position = i + 1; });
    }

    // Q&A
    const qna: QnAQuestion[] | null = this.qnaQuestions.length > 0 || role === "host"
      ? this.qnaQuestions
        .map((q) => ({
          id: q.id,
          text: q.text,
          authorId: q.authorId,
          authorName: q.authorName,
          upvoteCount: q.upvoteCount,
          answered: q.answered,
          createdAt: q.createdAt,
          yourUpvote: voterId ? (this.qnaUpvotes.get(q.id)?.has(voterId) ?? false) : false,
        }))
        .sort((a, b) => b.upvoteCount - a.upvoteCount)
      : null;

    // Chat (last 50)
    const chat: ChatMessage[] | null = this.chatMessages.length > 0 || role === "host"
      ? this.chatMessages.slice(-50)
      : null;

    // Word cloud
    const wordCloud: WordCloudWord[] | null = this.wordCloudEntries.length > 0
      ? this.getWordCloudAggregation()
      : null;

    // Reactions (aggregate last 100)
    const reactions: ReactionBurst[] | null = this.reactionEntries.length > 0
      ? this.getReactionAggregation()
      : null;

    // Total responses calculation per question kind
    let totalResponses = votesForQuestion.size;
    if (question?.kind === "numeric_scale" || question?.kind === "draggable_scale" || question?.kind === "rating") {
      totalResponses = scaleMap?.size ?? 0;
    } else if (question?.kind === "ranking") {
      totalResponses = rankMap?.size ?? 0;
    } else if (question?.kind === "open_ended") {
      totalResponses = oeEntries.length;
    }

    return {
      type: "state",
      role,
      room: this.name,
      phase,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: QUESTIONS.length,
      question: questionPublic,
      voteCounts,
      resultsVisible,
      totalResponses,
      participants,
      yourVoteOptionIds,
      yourNumberGuess,
      yourScaleValue,
      yourRating,
      yourRanking,
      openEndedEntries,
      yourOpenEndedVote,
      score,
      reveal,
      host: role === "host" ? { questions: QUESTIONS } : null,
      qna,
      chat,
      wordCloud,
      reactions,
      survey: null,
      scaleDistribution,
      averageRating,
      rankingResults,
    };
  }

  private getConnectedParticipantCount(): number {
    const identities = new Set<string>();
    const connections = Array.from(this.getConnections<PollConnectionState>());
    for (let index = 0; index < connections.length; index += 1) {
      const connection = connections[index];
      const state = connection.state;
      if (state?.role === "audience" && state.voterId) {
        identities.add(`audience:${state.voterId}`);
        continue;
      }
      identities.add(`connection:${connection.id}`);
    }
    return identities.size;
  }

  private getCurrentQuestion(): PollQuestion | null {
    return QUESTIONS[this.currentQuestionIndex] ?? null;
  }

  private getVoteCounts(
    question: PollQuestion | null,
    votesForQuestion: Map<string, string[]>
  ): VoteCounts {
    if (!question || question.kind !== "choice") return {};
    const counts: VoteCounts = {};
    for (const option of question.options) counts[option.id] = 0;
    for (const selectedOptionIds of votesForQuestion.values()) {
      for (const optionId of selectedOptionIds) {
        if (optionId in counts) counts[optionId] += 1;
      }
    }
    return counts;
  }

  private getEmptyVoteCounts(question: PollQuestion | null): VoteCounts {
    if (!question || question.kind !== "choice") return {};
    const counts: VoteCounts = {};
    for (const option of question.options) counts[option.id] = 0;
    return counts;
  }

  private getNumberWinnerResult(question: Extract<PollQuestion, { kind: "number" }>) {
    return this.getNumberWinnerResultForQuestionIndex(this.currentQuestionIndex, question);
  }

  private getNumberWinnerResultForQuestionIndex(
    questionIndex: number,
    question: Extract<PollQuestion, { kind: "number" }>
  ) {
    const votesForQuestion = this.getVotesForQuestion(questionIndex);
    let winningGuess: number | null = null;
    let winnerCount = 0;
    for (const selection of votesForQuestion.values()) {
      const guess = parseStoredNumberGuess(question, selection);
      if (guess === null || guess > question.correctNumber) continue;
      if (winningGuess === null || guess > winningGuess) {
        winningGuess = guess;
        winnerCount = 1;
      } else if (guess === winningGuess) {
        winnerCount += 1;
      }
    }
    return { winningGuess, winnerCount };
  }

  private shouldShowResults(role: PollRole, question: PollQuestion | null): boolean {
    if (role === "host") return true;
    if (!question) return false;
    if (!question.hideResultsUntilReveal) return true;
    return this.getCurrentPhase() === "revealed";
  }

  private getCurrentPhase(): PollPhase {
    return this.phaseByQuestionIndex.get(this.currentQuestionIndex) ?? "idle";
  }

  private getVotesForQuestion(questionIndex: number): Map<string, string[]> {
    const existing = this.votesByQuestionIndex.get(questionIndex);
    if (existing) return existing;
    const created = new Map<string, string[]>();
    this.votesByQuestionIndex.set(questionIndex, created);
    return created;
  }

  private getScaleForQuestion(questionIndex: number): Map<string, number> {
    const existing = this.scaleByQuestion.get(questionIndex);
    if (existing) return existing;
    const created = new Map<string, number>();
    this.scaleByQuestion.set(questionIndex, created);
    return created;
  }

  private getRankingForQuestion(questionIndex: number): Map<string, string[]> {
    const existing = this.rankingByQuestion.get(questionIndex);
    if (existing) return existing;
    const created = new Map<string, string[]>();
    this.rankingByQuestion.set(questionIndex, created);
    return created;
  }

  private getOpenEndedForQuestion(questionIndex: number) {
    const existing = this.openEndedByQuestion.get(questionIndex);
    if (existing) return existing;
    const created: Array<{ id: string; text: string; authorId: string; votes: Set<string> }> = [];
    this.openEndedByQuestion.set(questionIndex, created);
    return created;
  }

  private getWordCloudAggregation(): WordCloudWord[] {
    const counts = new Map<string, number>();
    for (const entry of this.wordCloudEntries) {
      counts.set(entry.word, (counts.get(entry.word) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
  }

  private getReactionAggregation(): ReactionBurst[] {
    const counts = new Map<string, number>();
    const recent = this.reactionEntries.slice(-100);
    for (const entry of recent) {
      counts.set(entry.emoji, (counts.get(entry.emoji) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getScoreForVoter(voterId: string) {
    let answered = 0;
    let correct = 0;
    for (let questionIndex = 0; questionIndex < QUESTIONS.length; questionIndex += 1) {
      const question = QUESTIONS[questionIndex];
      const votesForQuestion = this.votesByQuestionIndex.get(questionIndex);
      const selection = votesForQuestion?.get(voterId);
      if (!selection || selection.length === 0) continue;
      const phase = this.phaseByQuestionIndex.get(questionIndex) ?? "idle";
      if (question.kind === "choice") {
        answered += 1;
        if (phase === "revealed" && isSelectionCorrect(selection, question.correctOptionIds)) {
          correct += 1;
        }
        continue;
      }
      if (question.kind === "number") {
        const guess = parseStoredNumberGuess(question, selection);
        if (guess === null) continue;
        answered += 1;
        if (phase === "revealed") {
          const winnerResult = this.getNumberWinnerResultForQuestionIndex(questionIndex, question);
          if (winnerResult.winningGuess !== null && guess === winnerResult.winningGuess) {
            correct += 1;
          }
        }
      }
    }
    return { answered, correct, totalQuestions: QUESTIONS.length };
  }

  // ── Persistence (Drizzle) ─────────────────────────────────────

  private async ensureStateLoaded() {
    if (this.stateLoaded) return;
    if (this.loadStatePromise) {
      await this.loadStatePromise;
      return;
    }
    this.loadStatePromise = this.loadStateFromStorage();
    try {
      await this.loadStatePromise;
    } finally {
      this.loadStatePromise = null;
    }
  }

  private async loadStateFromStorage() {
    const db = this.getDb();

    this.phaseByQuestionIndex.clear();
    this.votesByQuestionIndex.clear();
    this.openEndedByQuestion.clear();
    this.scaleByQuestion.clear();
    this.rankingByQuestion.clear();
    this.currentQuestionIndex = 0;

    // Load current question index
    const metaRows = db
      .select({ value: schema.pollRoomMeta.value })
      .from(schema.pollRoomMeta)
      .where(eq(schema.pollRoomMeta.key, "currentQuestionIndex"))
      .limit(1)
      .all();

    const currentIndexRaw = metaRows[0]?.value;
    const parsedCurrentIndex = Number.parseInt(currentIndexRaw ?? "", 10);
    if (Number.isInteger(parsedCurrentIndex) && parsedCurrentIndex >= 0 && parsedCurrentIndex < QUESTIONS.length) {
      this.currentQuestionIndex = parsedCurrentIndex;
    }

    // Load phases
    const phaseRows = db
      .select({ questionIndex: schema.pollRoomPhase.questionIndex, phase: schema.pollRoomPhase.phase })
      .from(schema.pollRoomPhase)
      .all();
    for (const row of phaseRows) {
      if (!isValidQuestionIndex(row.questionIndex) || !isPollPhase(row.phase)) continue;
      this.phaseByQuestionIndex.set(row.questionIndex, row.phase);
    }

    // Load votes — route to correct in-memory store per question kind
    const voteRows = db
      .select({
        questionIndex: schema.pollRoomVote.questionIndex,
        voterId: schema.pollRoomVote.voterId,
        optionIds: schema.pollRoomVote.optionIds,
      })
      .from(schema.pollRoomVote)
      .all();

    for (const row of voteRows) {
      if (!isValidQuestionIndex(row.questionIndex) || row.voterId.length === 0) continue;
      const question = QUESTIONS[row.questionIndex];

      let parsedOptionIds: unknown;
      try {
        parsedOptionIds = JSON.parse(row.optionIds);
      } catch {
        continue;
      }
      if (!Array.isArray(parsedOptionIds)) continue;

      if (question.kind === "choice") {
        const allowedOptionIds = new Set(question.options.map((option) => option.id));
        const validOptionIds: string[] = [];
        for (const optionId of parsedOptionIds) {
          if (typeof optionId !== "string" || !allowedOptionIds.has(optionId)) continue;
          if (!validOptionIds.includes(optionId)) validOptionIds.push(optionId);
        }
        if (!question.allowMultiple && validOptionIds.length > 1) continue;
        if (validOptionIds.length === 0) continue;
        const voteMap = this.getVotesForQuestion(row.questionIndex);
        voteMap.set(row.voterId, validOptionIds);
      } else if (question.kind === "number") {
        const restoredGuess = parseStoredNumberGuess(question, parsedOptionIds);
        if (restoredGuess === null) continue;
        const voteMap = this.getVotesForQuestion(row.questionIndex);
        voteMap.set(row.voterId, [String(restoredGuess)]);
      } else if (question.kind === "numeric_scale" || question.kind === "draggable_scale" || question.kind === "rating") {
        const val = Number(parsedOptionIds[0]);
        if (!Number.isFinite(val)) continue;
        const scaleMap = this.getScaleForQuestion(row.questionIndex);
        scaleMap.set(row.voterId, val);
      } else if (question.kind === "ranking") {
        if (!parsedOptionIds.every((id: unknown) => typeof id === "string")) continue;
        const rankMap = this.getRankingForQuestion(row.questionIndex);
        rankMap.set(row.voterId, parsedOptionIds as string[]);
      } else if (question.kind === "open_ended") {
        if (typeof parsedOptionIds[0] !== "string") continue;
        const entries = this.getOpenEndedForQuestion(row.questionIndex);
        const existing = entries.find((e) => e.authorId === row.voterId);
        if (!existing) {
          entries.push({
            id: `oe-${row.questionIndex}-${row.voterId}`,
            text: parsedOptionIds[0],
            authorId: row.voterId,
            votes: new Set(),
          });
        }
      }
    }

    // Load Q&A questions
    const qnaRows = db
      .select()
      .from(schema.qnaQuestions)
      .all();
    this.qnaQuestions = qnaRows.map((row) => ({
      id: row.id,
      text: row.text,
      authorId: row.authorId,
      authorName: row.authorName,
      upvoteCount: row.upvoteCount,
      answered: row.answered === 1,
      createdAt: row.createdAt,
    }));

    // Load Q&A upvotes
    const upvoteRows = db.select().from(schema.qnaUpvotes).all();
    this.qnaUpvotes.clear();
    for (const q of this.qnaQuestions) {
      this.qnaUpvotes.set(q.id, new Set());
    }
    for (const row of upvoteRows) {
      const set = this.qnaUpvotes.get(row.questionId);
      if (set) set.add(row.voterId);
    }

    // Load chat messages (last 200)
    const chatRows = db
      .select()
      .from(schema.chatMessages)
      .all();
    this.chatMessages = chatRows
      .map((row) => ({
        id: row.id,
        text: row.text,
        authorId: row.authorId,
        authorName: row.authorName,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-200);

    // Load word cloud entries
    const wcRows = db.select().from(schema.wordCloudEntries).all();
    this.wordCloudEntries = wcRows.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      word: row.word,
    }));

    // Load reaction entries (last 500)
    const rxRows = db.select().from(schema.reactionEntries).all();
    this.reactionEntries = rxRows
      .map((row) => ({
        emoji: row.emoji,
        authorId: row.authorId,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-500);

    this.stateLoaded = true;
  }

  private persistCurrentQuestionIndex() {
    const db = this.getDb();
    db.insert(schema.pollRoomMeta)
      .values({ key: "currentQuestionIndex", value: String(this.currentQuestionIndex) })
      .onConflictDoUpdate({ target: schema.pollRoomMeta.key, set: { value: String(this.currentQuestionIndex) } })
      .run();
  }

  private persistPhase(questionIndex: number, phase: PollPhase) {
    const db = this.getDb();
    db.insert(schema.pollRoomPhase)
      .values({ questionIndex, phase })
      .onConflictDoUpdate({ target: schema.pollRoomPhase.questionIndex, set: { phase } })
      .run();
  }

  private persistVote(questionIndex: number, voterId: string, optionIds: string[]) {
    const db = this.getDb();
    if (optionIds.length === 0) {
      db.delete(schema.pollRoomVote)
        .where(and(eq(schema.pollRoomVote.questionIndex, questionIndex), eq(schema.pollRoomVote.voterId, voterId)))
        .run();
      return;
    }
    db.insert(schema.pollRoomVote)
      .values({ questionIndex, voterId, optionIds: JSON.stringify(optionIds) })
      .onConflictDoUpdate({
        target: [schema.pollRoomVote.questionIndex, schema.pollRoomVote.voterId],
        set: { optionIds: JSON.stringify(optionIds) },
      })
      .run();
  }

  private clearPersistedState() {
    const db = this.getDb();
    db.delete(schema.pollRoomVote).run();
    db.delete(schema.pollRoomPhase).run();
    db.delete(schema.pollRoomMeta).run();
    db.delete(schema.qnaQuestions).run();
    db.delete(schema.qnaUpvotes).run();
    db.delete(schema.chatMessages).run();
    db.delete(schema.wordCloudEntries).run();
    db.delete(schema.reactionEntries).run();
    db.delete(schema.surveyResponses).run();
  }

  // ── Validation ────────────────────────────────────────────────

  private validateChoiceSelection(
    question: Extract<PollQuestion, { kind: "choice" }>,
    optionIds: string[]
  ): { ok: true; optionIds: string[] } | { ok: false; message: string } {
    if (!Array.isArray(optionIds) || optionIds.some((id) => typeof id !== "string")) {
      return { ok: false, message: "Vote payload must contain string option IDs." };
    }
    const allowedIds = new Set(question.options.map((option) => option.id));
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const optionId of optionIds) {
      if (!allowedIds.has(optionId)) return { ok: false, message: "Vote payload contains an invalid option ID." };
      if (seen.has(optionId)) continue;
      seen.add(optionId);
      deduped.push(optionId);
    }
    if (!question.allowMultiple && deduped.length > 1) {
      return { ok: false, message: "This question allows only one selected option." };
    }
    return { ok: true, optionIds: deduped };
  }

  private validateNumberGuess(
    question: Extract<PollQuestion, { kind: "number" }>,
    value: number | null
  ): { ok: true; value: number | null } | { ok: false; message: string } {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, message: "Number guess must be a valid number." };
    }
    if (question.min !== undefined && value < question.min) return { ok: false, message: `Guess must be at least ${question.min}.` };
    if (question.max !== undefined && value > question.max) return { ok: false, message: `Guess must be at most ${question.max}.` };
    return { ok: true, value };
  }
}

// ── Pure helpers ───────────────────────────────────────────────

function toPublicQuestion(question: PollQuestion): PollQuestionPublic {
  switch (question.kind) {
    case "choice":
      return {
        kind: "choice",
        id: question.id,
        prompt: question.prompt,
        allowMultiple: question.allowMultiple,
        hideResultsUntilReveal: question.hideResultsUntilReveal,
        options: question.options.map((option) => ({ ...option })),
      };
    case "number":
      return {
        kind: "number",
        id: question.id,
        prompt: question.prompt,
        min: question.min,
        max: question.max,
        step: question.step,
        hideResultsUntilReveal: question.hideResultsUntilReveal,
      };
    case "open_ended":
      return { kind: "open_ended", id: question.id, prompt: question.prompt, hideResultsUntilReveal: question.hideResultsUntilReveal };
    case "numeric_scale":
      return { kind: "numeric_scale", id: question.id, prompt: question.prompt, min: question.min, max: question.max, minLabel: question.minLabel, maxLabel: question.maxLabel, hideResultsUntilReveal: question.hideResultsUntilReveal };
    case "draggable_scale":
      return { kind: "draggable_scale", id: question.id, prompt: question.prompt, min: question.min, max: question.max, minLabel: question.minLabel, maxLabel: question.maxLabel, hideResultsUntilReveal: question.hideResultsUntilReveal };
    case "rating":
      return { kind: "rating", id: question.id, prompt: question.prompt, maxRating: question.maxRating, ratingStyle: question.ratingStyle, hideResultsUntilReveal: question.hideResultsUntilReveal };
    case "ranking":
      return { kind: "ranking", id: question.id, prompt: question.prompt, items: question.items.map((i) => ({ ...i })), hideResultsUntilReveal: question.hideResultsUntilReveal };
  }
}

function isSelectionCorrect(selection: string[], correctOptionIds: string[]): boolean {
  if (selection.length !== correctOptionIds.length) return false;
  const selectedSet = new Set(selection);
  for (const correctOptionId of correctOptionIds) {
    if (!selectedSet.has(correctOptionId)) return false;
  }
  return true;
}

function parseStoredNumberGuess(
  question: Extract<PollQuestion, { kind: "number" }>,
  selection: string[] | unknown[]
): number | null {
  const firstValue = selection[0];
  const parsed = typeof firstValue === "number" ? firstValue : Number.parseFloat(String(firstValue));
  if (!Number.isFinite(parsed)) return null;
  if (question.min !== undefined && parsed < question.min) return null;
  if (question.max !== undefined && parsed > question.max) return null;
  return parsed;
}

function isPollPhase(value: string): value is PollPhase {
  return value === "idle" || value === "open" || value === "closed" || value === "revealed";
}

function isValidQuestionIndex(questionIndex: number): boolean {
  return Number.isInteger(questionIndex) && questionIndex >= 0 && questionIndex < QUESTIONS.length;
}

function getRole(role: string | null): PollRole {
  if (role === "host" || role === "projector") return role;
  return "audience";
}

function getSafeVoterId(voterId: string | null, fallback: string): string {
  if (voterId && /^[a-zA-Z0-9_-]{1,64}$/.test(voterId)) return voterId;
  return fallback;
}

function sanitizeAudienceName(name: string | null): string | null {
  if (!name) return null;
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : null;
}

function isHostMessage(message: IncomingMessage): boolean {
  return (
    message.type === "set-question" ||
    message.type === "open-voting" ||
    message.type === "close-voting" ||
    message.type === "reveal" ||
    message.type === "reset-session" ||
    message.type === "mark-answered"
  );
}

function parseIncomingMessage(rawMessage: string): IncomingMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const message = parsed as Record<string, unknown>;
  if (typeof message.type !== "string") return null;

  switch (message.type) {
    case "vote":
      if (!Array.isArray(message.optionIds) || message.optionIds.some((id) => typeof id !== "string")) return null;
      return { type: "vote", optionIds: message.optionIds };
    case "vote-number":
      if (message.value !== null && typeof message.value !== "number") return null;
      if (typeof message.value === "number" && !Number.isFinite(message.value)) return null;
      return { type: "vote-number", value: message.value as number | null };
    case "vote-scale":
      if (message.value !== null && typeof message.value !== "number") return null;
      return { type: "vote-scale", value: message.value as number | null };
    case "vote-rating":
      if (typeof message.value !== "number" || !Number.isFinite(message.value)) return null;
      return { type: "vote-rating", value: message.value };
    case "vote-ranking":
      if (!Array.isArray(message.ranking) || message.ranking.some((id) => typeof id !== "string")) return null;
      return { type: "vote-ranking", ranking: message.ranking };
    case "submit-open-ended":
      if (typeof message.text !== "string") return null;
      return { type: "submit-open-ended", text: message.text };
    case "vote-open-ended":
      if (typeof message.entryId !== "string") return null;
      return { type: "vote-open-ended", entryId: message.entryId };
    case "set-question":
      if (typeof message.questionIndex !== "number") return null;
      return { type: "set-question", questionIndex: message.questionIndex };
    case "open-voting":
    case "close-voting":
    case "reveal":
    case "reset-session":
      return { type: message.type };
    case "submit-qna":
      if (typeof message.text !== "string") return null;
      return { type: "submit-qna", text: message.text };
    case "upvote-qna":
      if (typeof message.questionId !== "string") return null;
      return { type: "upvote-qna", questionId: message.questionId };
    case "mark-answered":
      if (typeof message.questionId !== "string") return null;
      return { type: "mark-answered", questionId: message.questionId };
    case "send-chat":
      if (typeof message.text !== "string") return null;
      return { type: "send-chat", text: message.text };
    case "submit-word":
      if (typeof message.word !== "string") return null;
      return { type: "submit-word", word: message.word };
    case "submit-reaction":
      if (typeof message.emoji !== "string") return null;
      return { type: "submit-reaction", emoji: message.emoji };
    case "submit-survey":
      if (typeof message.surveyId !== "string" || typeof message.responses !== "object") return null;
      return { type: "submit-survey", surveyId: message.surveyId, responses: message.responses as Record<number, string> };
    default:
      return null;
  }
}

function validateQuestions(rawQuestions: unknown): PollQuestion[] {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error("questions.json must export a non-empty array.");
  }

  const ids = new Set<string>();
  const validatedQuestions: PollQuestion[] = [];

  for (let index = 0; index < rawQuestions.length; index += 1) {
    const rawQuestion = rawQuestions[index];
    if (!rawQuestion || typeof rawQuestion !== "object") {
      throw new Error(`Question at index ${index} must be an object.`);
    }

    const question = rawQuestion as Record<string, unknown>;
    const id = question.id;
    const prompt = question.prompt;
    const kind = (typeof question.kind === "string" ? question.kind : "choice") as string;
    const hideResultsUntilReveal = question.hideResultsUntilReveal;

    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`Question at index ${index} has an invalid "id".`);
    }
    if (ids.has(id)) throw new Error(`Duplicate question id "${id}" found.`);
    ids.add(id);

    if (typeof prompt !== "string" || prompt.length === 0) {
      throw new Error(`Question "${id}" has an invalid "prompt".`);
    }
    if (hideResultsUntilReveal !== undefined && typeof hideResultsUntilReveal !== "boolean") {
      throw new Error(`Question "${id}" has invalid "hideResultsUntilReveal".`);
    }

    switch (kind) {
      case "number": {
        const correctNumber = question.correctNumber;
        const min = question.min;
        const max = question.max;
        const step = question.step;
        if (typeof correctNumber !== "number" || !Number.isFinite(correctNumber)) {
          throw new Error(`Question "${id}" must include numeric "correctNumber".`);
        }
        validatedQuestions.push({
          kind: "number",
          id,
          prompt,
          correctNumber,
          min: typeof min === "number" ? min : undefined,
          max: typeof max === "number" ? max : undefined,
          step: typeof step === "number" && step > 0 ? step : undefined,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
        });
        break;
      }

      case "open_ended": {
        validatedQuestions.push({
          kind: "open_ended",
          id,
          prompt,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
        });
        break;
      }

      case "numeric_scale": {
        const min = typeof question.min === "number" ? question.min : 1;
        const max = typeof question.max === "number" ? question.max : 10;
        validatedQuestions.push({
          kind: "numeric_scale",
          id,
          prompt,
          min,
          max,
          minLabel: typeof question.minLabel === "string" ? question.minLabel : undefined,
          maxLabel: typeof question.maxLabel === "string" ? question.maxLabel : undefined,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
        });
        break;
      }

      case "draggable_scale": {
        const min = typeof question.min === "number" ? question.min : 0;
        const max = typeof question.max === "number" ? question.max : 100;
        validatedQuestions.push({
          kind: "draggable_scale",
          id,
          prompt,
          min,
          max,
          minLabel: typeof question.minLabel === "string" ? question.minLabel : undefined,
          maxLabel: typeof question.maxLabel === "string" ? question.maxLabel : undefined,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
        });
        break;
      }

      case "rating": {
        const maxRating = typeof question.maxRating === "number" ? question.maxRating : 5;
        const ratingStyle = (question.ratingStyle === "star" || question.ratingStyle === "numeric" || question.ratingStyle === "emoji") ? question.ratingStyle : "star";
        validatedQuestions.push({
          kind: "rating",
          id,
          prompt,
          maxRating,
          ratingStyle,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
        });
        break;
      }

      case "ranking": {
        const items = question.items;
        if (!Array.isArray(items) || items.length < 2) {
          throw new Error(`Question "${id}" must include at least two items for ranking.`);
        }
        const validatedItems = items.map((rawItem: unknown, itemIndex: number) => {
          if (!rawItem || typeof rawItem !== "object") throw new Error(`Question "${id}" item at index ${itemIndex} must be an object.`);
          const item = rawItem as Record<string, unknown>;
          if (typeof item.id !== "string" || typeof item.label !== "string") {
            throw new Error(`Question "${id}" item at index ${itemIndex} has invalid id or label.`);
          }
          return { id: item.id, label: item.label };
        });
        validatedQuestions.push({
          kind: "ranking",
          id,
          prompt,
          items: validatedItems,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
        });
        break;
      }

      default: {
        // Default: treat as choice question
        const allowMultiple = question.allowMultiple;
        const options = question.options;
        const correctOptionIds = question.correctOptionIds;
        if (typeof allowMultiple !== "boolean") throw new Error(`Question "${id}" must include boolean "allowMultiple".`);
        if (!Array.isArray(options) || options.length < 2) throw new Error(`Question "${id}" must include at least two options.`);
        if (!Array.isArray(correctOptionIds) || correctOptionIds.length === 0) throw new Error(`Question "${id}" must include one or more correctOptionIds.`);

        const optionIds = new Set<string>();
        const validatedOptions = options.map((rawOption: unknown, optionIndex: number) => {
          if (!rawOption || typeof rawOption !== "object") throw new Error(`Question "${id}" option at index ${optionIndex} must be an object.`);
          const option = rawOption as Record<string, unknown>;
          if (typeof option.id !== "string" || option.id.length === 0) throw new Error(`Question "${id}" has an option with invalid "id".`);
          if (typeof option.label !== "string" || option.label.length === 0) throw new Error(`Question "${id}" option "${option.id}" has invalid "label".`);
          if (optionIds.has(option.id)) throw new Error(`Question "${id}" has duplicate option id "${option.id}".`);
          optionIds.add(option.id);
          return { id: option.id, label: option.label };
        });

        const validatedCorrectOptionIds: string[] = [];
        const seenCorrect = new Set<string>();
        for (const rawCorrectOptionId of correctOptionIds) {
          if (typeof rawCorrectOptionId !== "string") throw new Error(`Question "${id}" has non-string correctOptionIds entries.`);
          if (!optionIds.has(rawCorrectOptionId)) throw new Error(`Question "${id}" references unknown correct option "${rawCorrectOptionId}".`);
          if (seenCorrect.has(rawCorrectOptionId)) continue;
          seenCorrect.add(rawCorrectOptionId);
          validatedCorrectOptionIds.push(rawCorrectOptionId);
        }

        if (!allowMultiple && validatedCorrectOptionIds.length > 1) {
          throw new Error(`Question "${id}" has multiple correct options but allowMultiple is false.`);
        }

        validatedQuestions.push({
          kind: "choice",
          id,
          prompt,
          allowMultiple,
          hideResultsUntilReveal: hideResultsUntilReveal === true,
          options: validatedOptions,
          correctOptionIds: validatedCorrectOptionIds,
        });
        break;
      }
    }
  }

  return validatedQuestions;
}
