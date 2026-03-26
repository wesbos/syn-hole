export type PollRole = "audience" | "host" | "projector";
export type PollPhase = "idle" | "open" | "closed" | "revealed";

export type PollOption = {
  id: string;
  label: string;
};

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

export type PollQuestion = PollChoiceQuestion | PollNumberQuestion;

export type PollChoiceQuestionPublic = Omit<PollChoiceQuestion, "correctOptionIds">;
export type PollNumberQuestionPublic = Omit<PollNumberQuestion, "correctNumber">;
export type PollQuestionPublic = PollChoiceQuestionPublic | PollNumberQuestionPublic;

export type VoteCounts = Record<string, number>;
export type RealtimePointer = {
  id: string;
  x: number;
  y: number;
  color: string;
};

export type IncomingMessage =
  | {
      type: "vote";
      optionIds: string[];
    }
  | {
      type: "vote-number";
      value: number | null;
    }
  | {
      type: "cursor";
      x: number | null;
      y: number | null;
      color: string;
    }
  | {
      type: "set-question";
      questionIndex: number;
    }
  | {
      type: "open-voting";
    }
  | {
      type: "close-voting";
    }
  | {
      type: "reveal";
    }
  | {
      type: "reset-session";
    };

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
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "pointers";
      pointers: RealtimePointer[];
    };
