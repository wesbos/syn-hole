CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `poll_room_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `poll_room_phase` (
	`question_index` integer PRIMARY KEY NOT NULL,
	`phase` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `poll_room_vote` (
	`question_index` integer NOT NULL,
	`voter_id` text NOT NULL,
	`option_ids` text NOT NULL,
	PRIMARY KEY(`question_index`, `voter_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qna_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`text` text NOT NULL,
	`upvote_count` integer DEFAULT 0 NOT NULL,
	`answered` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qna_upvotes` (
	`question_id` text NOT NULL,
	`voter_id` text NOT NULL,
	PRIMARY KEY(`question_id`, `voter_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reaction_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rooms` (
	`name` text PRIMARY KEY NOT NULL,
	`host_key` text NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `survey_responses` (
	`survey_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`question_index` integer NOT NULL,
	`response` text NOT NULL,
	PRIMARY KEY(`survey_id`, `voter_id`, `question_index`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `word_cloud_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`word` text NOT NULL,
	`created_at` text NOT NULL
);
