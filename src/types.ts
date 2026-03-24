export type PollRole = "audience" | "host" | "projector";
export type PollPhase = "idle" | "open" | "closed" | "revealed";

// ── Poll option ──────────────────────────────────────────────────

export type PollOption = {
  id: string;
  label: string;
};

// ── Question kinds ───────────────────────────────────────────────

export type PollChoiceQuestion = {
  kind: "choice";
  id: string;
  prompt: string;
  options: PollOption[];
  correctOptionIds: string[];
  allowMultiple: boolean;
  hideResultsUntilReveal?: boolean;
};

export type PollNumberQuestion = {
  kind: "number";
  id: string;
  prompt: string;
  correctNumber: number;
  min?: number;
  max?: number;
  step?: number;
  hideResultsUntilReveal?: boolean;
};

export type PollOpenEndedQuestion = {
  kind: "open_ended";
  id: string;
  prompt: string;
  hideResultsUntilReveal?: boolean;
};

export type PollNumericScaleQuestion = {
  kind: "numeric_scale";
  id: string;
  prompt: string;
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  hideResultsUntilReveal?: boolean;
};

export type PollDraggableScaleQuestion = {
  kind: "draggable_scale";
  id: string;
  prompt: string;
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  hideResultsUntilReveal?: boolean;
};

export type PollRatingQuestion = {
  kind: "rating";
  id: string;
  prompt: string;
  maxRating: number;
  ratingStyle: "star" | "numeric" | "emoji";
  hideResultsUntilReveal?: boolean;
};

export type PollRankingQuestion = {
  kind: "ranking";
  id: string;
  prompt: string;
  items: PollOption[];
  hideResultsUntilReveal?: boolean;
};

export type PollQuestion =
  | PollChoiceQuestion
  | PollNumberQuestion
  | PollOpenEndedQuestion
  | PollNumericScaleQuestion
  | PollDraggableScaleQuestion
  | PollRatingQuestion
  | PollRankingQuestion;

// ── Public versions (strip correct answers) ──────────────────────

export type PollChoiceQuestionPublic = Omit<PollChoiceQuestion, "correctOptionIds">;
export type PollNumberQuestionPublic = Omit<PollNumberQuestion, "correctNumber">;
export type PollOpenEndedQuestionPublic = PollOpenEndedQuestion;
export type PollNumericScaleQuestionPublic = PollNumericScaleQuestion;
export type PollDraggableScaleQuestionPublic = PollDraggableScaleQuestion;
export type PollRatingQuestionPublic = PollRatingQuestion;
export type PollRankingQuestionPublic = PollRankingQuestion;

export type PollQuestionPublic =
  | PollChoiceQuestionPublic
  | PollNumberQuestionPublic
  | PollOpenEndedQuestionPublic
  | PollNumericScaleQuestionPublic
  | PollDraggableScaleQuestionPublic
  | PollRatingQuestionPublic
  | PollRankingQuestionPublic;

// ── Vote counts ──────────────────────────────────────────────────

export type VoteCounts = Record<string, number>;

// ── Q&A types ────────────────────────────────────────────────────

export type QnAQuestion = {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  upvoteCount: number;
  answered: boolean;
  createdAt: string;
  yourUpvote: boolean;
};

// ── Chat types ───────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

// ── Word Cloud types ─────────────────────────────────────────────

export type WordCloudWord = {
  word: string;
  count: number;
};

// ── Reaction types ───────────────────────────────────────────────

export type ReactionBurst = {
  emoji: string;
  count: number;
};

// ── Messages ─────────────────────────────────────────────────────

export type IncomingMessage =
  // Poll messages
  | { type: "vote"; optionIds: string[] }
  | { type: "vote-number"; value: number | null }
  | { type: "vote-scale"; value: number | null }
  | { type: "vote-rating"; value: number }
  | { type: "vote-ranking"; ranking: string[] }
  | { type: "submit-open-ended"; text: string }
  | { type: "vote-open-ended"; entryId: string }
  // Host commands
  | { type: "set-question"; questionIndex: number }
  | { type: "open-voting" }
  | { type: "close-voting" }
  | { type: "reveal" }
  | { type: "reset-session" }
  // Q&A
  | { type: "submit-qna"; text: string }
  | { type: "upvote-qna"; questionId: string }
  | { type: "mark-answered"; questionId: string }
  // Chat
  | { type: "send-chat"; text: string }
  // Word Cloud
  | { type: "submit-word"; word: string }
  // Reactions
  | { type: "submit-reaction"; emoji: string }
  // Survey
  | { type: "submit-survey"; surveyId: string; responses: Record<number, string> };

export type OutgoingMessage =
  | {
      type: "state";
      role: PollRole;
      room: string;
      phase: PollPhase;
      currentQuestionIndex: number;
      totalQuestions: number;
      question: PollQuestionPublic | null;
      voteCounts: VoteCounts;
      resultsVisible: boolean;
      totalResponses: number;
      participants: number;
      yourVoteOptionIds: string[];
      yourNumberGuess: number | null;
      yourScaleValue: number | null;
      yourRating: number | null;
      yourRanking: string[] | null;
      openEndedEntries: OpenEndedEntry[];
      yourOpenEndedVote: string | null;
      score:
        | {
            answered: number;
            correct: number;
            totalQuestions: number;
          }
        | null;
      reveal:
        | {
            kind: "choice";
            correctOptionIds: string[];
            isCorrect?: boolean;
          }
        | {
            kind: "number";
            correctNumber: number;
            winningGuess: number | null;
            winnerCount: number;
            isWinner?: boolean;
          }
        | null;
      host:
        | {
            questions: PollQuestion[];
          }
        | null;
      // Interaction-type specific data
      qna: QnAQuestion[] | null;
      chat: ChatMessage[] | null;
      wordCloud: WordCloudWord[] | null;
      reactions: ReactionBurst[] | null;
      survey: SurveyState | null;
      scaleDistribution: Record<number, number> | null;
      averageRating: number | null;
      rankingResults: RankingResult[] | null;
    }
  | {
      type: "error";
      message: string;
    };

// ── Open-ended entry ─────────────────────────────────────────────

export type OpenEndedEntry = {
  id: string;
  text: string;
  authorId: string;
  voteCount: number;
};

// ── Survey state ─────────────────────────────────────────────────

export type SurveyState = {
  surveyId: string;
  questions: PollQuestionPublic[];
  totalCompletions: number;
  yourCompleted: boolean;
};

// ── Ranking result ───────────────────────────────────────────────

export type RankingResult = {
  id: string;
  label: string;
  averageRank: number;
  position: number;
};
