import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ── PollRoom tables ──────────────────────────────────────────────

export const pollRoomMeta = sqliteTable("poll_room_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const pollRoomPhase = sqliteTable("poll_room_phase", {
  questionIndex: integer("question_index").primaryKey(),
  phase: text("phase").notNull(),
});

export const pollRoomVote = sqliteTable(
  "poll_room_vote",
  {
    questionIndex: integer("question_index").notNull(),
    voterId: text("voter_id").notNull(),
    optionIds: text("option_ids").notNull(),
  },
  (table) => [primaryKey({ columns: [table.questionIndex, table.voterId] })]
);

// ── AdminRegistry tables ─────────────────────────────────────────

export const rooms = sqliteTable("rooms", {
  name: text("name").primaryKey(),
  hostKey: text("host_key").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// ── Q&A tables ───────────────────────────────────────────────────

export const qnaQuestions = sqliteTable("qna_questions", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  text: text("text").notNull(),
  upvoteCount: integer("upvote_count").notNull().default(0),
  answered: integer("answered").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const qnaUpvotes = sqliteTable(
  "qna_upvotes",
  {
    questionId: text("question_id").notNull(),
    voterId: text("voter_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.voterId] })]
);

// ── Chat tables ──────────────────────────────────────────────────

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Word Cloud tables ────────────────────────────────────────────

export const wordCloudEntries = sqliteTable("word_cloud_entries", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  word: text("word").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Reactions tables ─────────────────────────────────────────────

export const reactionEntries = sqliteTable("reaction_entries", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Survey tables ────────────────────────────────────────────────

export const surveyResponses = sqliteTable(
  "survey_responses",
  {
    surveyId: text("survey_id").notNull(),
    voterId: text("voter_id").notNull(),
    questionIndex: integer("question_index").notNull(),
    response: text("response").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.surveyId, table.voterId, table.questionIndex],
    }),
  ]
);
