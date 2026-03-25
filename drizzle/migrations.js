import journal from './meta/_journal.json';

const m0000 = `CREATE TABLE IF NOT EXISTS \`chat_messages\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`author_id\` text NOT NULL,
\t\`author_name\` text NOT NULL,
\t\`text\` text NOT NULL,
\t\`created_at\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`poll_room_meta\` (
\t\`key\` text PRIMARY KEY NOT NULL,
\t\`value\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`poll_room_phase\` (
\t\`question_index\` integer PRIMARY KEY NOT NULL,
\t\`phase\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`poll_room_vote\` (
\t\`question_index\` integer NOT NULL,
\t\`voter_id\` text NOT NULL,
\t\`option_ids\` text NOT NULL,
\tPRIMARY KEY(\`question_index\`, \`voter_id\`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`qna_questions\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`author_id\` text NOT NULL,
\t\`author_name\` text NOT NULL,
\t\`text\` text NOT NULL,
\t\`upvote_count\` integer DEFAULT 0 NOT NULL,
\t\`answered\` integer DEFAULT 0 NOT NULL,
\t\`created_at\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`qna_upvotes\` (
\t\`question_id\` text NOT NULL,
\t\`voter_id\` text NOT NULL,
\tPRIMARY KEY(\`question_id\`, \`voter_id\`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`reaction_entries\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`author_id\` text NOT NULL,
\t\`emoji\` text NOT NULL,
\t\`created_at\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`rooms\` (
\t\`name\` text PRIMARY KEY NOT NULL,
\t\`host_key\` text NOT NULL,
\t\`created_at\` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`survey_responses\` (
\t\`survey_id\` text NOT NULL,
\t\`voter_id\` text NOT NULL,
\t\`question_index\` integer NOT NULL,
\t\`response\` text NOT NULL,
\tPRIMARY KEY(\`survey_id\`, \`voter_id\`, \`question_index\`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`word_cloud_entries\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`author_id\` text NOT NULL,
\t\`word\` text NOT NULL,
\t\`created_at\` text NOT NULL
);`;

  export default {
    journal,
    migrations: {
      m0000
    }
  }
