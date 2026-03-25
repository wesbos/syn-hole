/**
 * Interaction capability map — source of truth for all supported interaction modules.
 * Mirrors the Pigeonhole Live product feature set for in-app interactions.
 */

export type InteractionModule =
  | "poll_multiple_choice"
  | "poll_open_ended"
  | "poll_numeric_scale"
  | "poll_draggable_scale"
  | "poll_rating"
  | "poll_ranking"
  | "poll_quiz"
  | "poll_assessment"
  | "qna"
  | "chat"
  | "word_cloud"
  | "survey"
  | "reactions";

export type InteractionCategory = "poll" | "social" | "feedback";

export type InteractionMeta = {
  label: string;
  category: InteractionCategory;
  /** Whether this interaction uses the standard idle→open→closed→revealed phase lifecycle */
  hasPhases: boolean;
  /** Whether the interaction supports correct answers */
  hasCorrectAnswer: boolean;
  /** Whether the interaction tracks a leaderboard */
  hasLeaderboard: boolean;
  /** Description shown to the host when selecting an interaction type */
  description: string;
};

export const INTERACTION_MODULES: Record<InteractionModule, InteractionMeta> = {
  poll_multiple_choice: {
    label: "Multiple Choice Poll",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: true,
    hasLeaderboard: false,
    description: "Audience picks from predefined options. Real-time bar chart results.",
  },
  poll_open_ended: {
    label: "Open-Ended Poll",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Audience submits free-text responses and votes on submissions.",
  },
  poll_numeric_scale: {
    label: "Numeric Scale (1–10)",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Likert-style 1–10 scale with customisable endpoint labels.",
  },
  poll_draggable_scale: {
    label: "Draggable Scale (1–100)",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Wide-range slider for precise numeric input.",
  },
  poll_rating: {
    label: "Rating",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Star/icon rating with live average display.",
  },
  poll_ranking: {
    label: "Ranking Poll",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Audience ranks items by preference. Aggregate ranking shown.",
  },
  poll_quiz: {
    label: "Quiz",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: true,
    hasLeaderboard: true,
    description: "Gamified competitive quiz with scores and a leaderboard.",
  },
  poll_assessment: {
    label: "Assessment",
    category: "poll",
    hasPhases: true,
    hasCorrectAnswer: true,
    hasLeaderboard: false,
    description: "Self-directed quiz — participants see their own score only.",
  },
  qna: {
    label: "Q&A",
    category: "social",
    hasPhases: false,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Audience posts questions, upvotes, and host marks them as answered.",
  },
  chat: {
    label: "Chat",
    category: "social",
    hasPhases: false,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Real-time messaging between all participants.",
  },
  word_cloud: {
    label: "Word Cloud",
    category: "feedback",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Audience submits words; most popular appear largest.",
  },
  survey: {
    label: "Survey",
    category: "feedback",
    hasPhases: true,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Multi-question form combining choice and open-text questions.",
  },
  reactions: {
    label: "Reactions",
    category: "social",
    hasPhases: false,
    hasCorrectAnswer: false,
    hasLeaderboard: false,
    description: "Quick emoji reactions that stream in real-time.",
  },
};

/** Poll-type modules that reuse the standard poll question pipeline */
export const POLL_MODULES: InteractionModule[] = [
  "poll_multiple_choice",
  "poll_open_ended",
  "poll_numeric_scale",
  "poll_draggable_scale",
  "poll_rating",
  "poll_ranking",
  "poll_quiz",
  "poll_assessment",
];

/** Non-poll interaction modules */
export const SOCIAL_MODULES: InteractionModule[] = [
  "qna",
  "chat",
  "word_cloud",
  "survey",
  "reactions",
];
