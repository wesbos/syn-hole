import type { PollQuestion } from "../types";

export const mainQuestions = [
  {
    kind: "choice",
    id: "nori",
    prompt: "Nori",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      {
        id: "health-advisor",
        label: "an AI powered personal health advisor",
      },
      {
        id: "cli-skills",
        label: "a CLI tool for installing Claude Code Skillsets",
      },
      { id: "both", label: "both" },
    ],
    correctOptionIds: ["both"],
  },
  {
    kind: "choice",
    id: "cstack",
    prompt: "CStack",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      {
        id: "chinese-fork",
        label: "A Chinese fork of Garry Tan's gstack",
      },
      {
        id: "sg-platform",
        label: "Singapore government's container deployment platform",
      },
      { id: "both", label: "both" },
    ],
    correctOptionIds: ["sg-platform"],
  },
  {
    kind: "choice",
    id: "synesthesia",
    prompt: "Synesthesia",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      {
        id: "neuro-phenomenon",
        label: "a neurological phenomenon where colors can be smells and sounds tasted",
      },
      {
        id: "video-tool",
        label: "an AI powered Video generation tool for businesses",
      },
      { id: "both", label: "both" },
    ],
    correctOptionIds: ["both"],
  },
  {
    kind: "choice",
    id: "luminexia",
    prompt: "Luminexia",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      {
        id: "trance-dj",
        label: "A Russian Trance DJ from the early 2000s",
      },
      {
        id: "agent-orchestrator",
        label: "a lightweight Agentic orchestrator for AI agents",
      },
      { id: "both", label: "both" },
    ],
    correctOptionIds: ["trance-dj"],
  },
  {
    kind: "choice",
    id: "aspero",
    prompt: "Aspero",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "gravel-bike", label: "A Gravel Bike, built for speed" },
      {
        id: "scraping-service",
        label: "A Cloud based web scraping service, built for speed",
      },
      { id: "both", label: "both" },
    ],
    correctOptionIds: ["gravel-bike"],
  },
] satisfies PollQuestion[];

export const sillyTestQuestions = [
  {
    kind: "choice",
    id: "fav-food",
    prompt: "What is my favorite food?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "ramen", label: "Ramen" },
      { id: "tacos", label: "Tacos" },
      { id: "pizza", label: "Pizza" },
      { id: "all-of-the-above", label: "Whatever is nearest to the keyboard" },
    ],
    correctOptionIds: ["ramen"],
  },
  {
    kind: "choice",
    id: "fav-snack",
    prompt: "Favorite coding snack?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "chips", label: "Salt and vinegar chips" },
      { id: "gummy-bears", label: "Gummy bears" },
      { id: "trail-mix", label: "Trail mix pretending to be healthy" },
      { id: "none", label: "Just vibes and caffeine" },
    ],
    correctOptionIds: ["chips"],
  },
  {
    kind: "choice",
    id: "fav-language",
    prompt: "Favorite programming language?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "typescript", label: "TypeScript" },
      { id: "python", label: "Python" },
      { id: "rust", label: "Rust" },
      { id: "html", label: "HTML (do not start this debate)" },
    ],
    correctOptionIds: ["typescript"],
  },
  {
    kind: "choice",
    id: "fav-editor-theme",
    prompt: "Favorite editor theme mood?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "dark", label: "Dark mode forever" },
      { id: "light", label: "Light mode on purpose" },
      { id: "solarized", label: "Solarized for nostalgia" },
      { id: "random", label: "Theme roulette every day" },
    ],
    correctOptionIds: ["dark"],
  },
  {
    kind: "choice",
    id: "fav-debugging-style",
    prompt: "Favorite debugging style?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "console-log", label: "console.log all the things" },
      { id: "breakpoints", label: "Breakpoint detective mode" },
      { id: "rubber-duck", label: "Explain it to a rubber duck" },
      { id: "restart", label: "Close laptop and reopen it" },
    ],
    correctOptionIds: ["console-log"],
  },
  {
    kind: "choice",
    id: "fav-dev-drink",
    prompt: "Preferred developer fuel?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "coffee", label: "Coffee" },
      { id: "tea", label: "Tea" },
      { id: "sparkling-water", label: "Sparkling water in a fancy can" },
      { id: "energy-drink", label: "An extremely neon energy drink" },
    ],
    correctOptionIds: ["coffee"],
  },
  {
    kind: "choice",
    id: "fav-terminal",
    prompt: "Favorite place to run commands?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "terminal", label: "Terminal tab with 37 panes" },
      { id: "gui", label: "GUI buttons only" },
      { id: "chat", label: "Ask an AI to run it" },
      { id: "sticky-note", label: "Write commands on sticky notes" },
    ],
    correctOptionIds: ["terminal"],
  },
  {
    kind: "choice",
    id: "fav-side-quest",
    prompt: "Favorite side quest during coding?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "rename-vars", label: "Rename variables for 20 minutes" },
      { id: "refactor", label: "Refactor something unrelated" },
      { id: "snack-break", label: "Snack break that becomes a walk" },
      { id: "tweak-dotfiles", label: "Tweak dotfiles again" },
    ],
    correctOptionIds: ["tweak-dotfiles"],
  },
  {
    kind: "choice",
    id: "fav-ai-superpower",
    prompt: "Most desired AI coding superpower?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "write-tests", label: "Write all the tests I forgot" },
      { id: "perfect-types", label: "Generate perfect TypeScript types first try" },
      { id: "read-docs", label: "Read every doc page instantly" },
      { id: "fix-bugs", label: "Fix bug before I even hit save" },
    ],
    correctOptionIds: ["perfect-types"],
  },
  {
    kind: "choice",
    id: "fav-weekend-project",
    prompt: "Favorite weekend build?",
    allowMultiple: false,
    hideResultsUntilReveal: false,
    options: [
      { id: "tiny-game", label: "A tiny browser game" },
      { id: "cli-tool", label: "A CLI tool nobody asked for" },
      { id: "home-automation", label: "Home automation that annoys everyone" },
      { id: "rebuild-blog", label: "Rebuild the blog for the 9th time" },
    ],
    correctOptionIds: ["cli-tool"],
  },
] satisfies PollQuestion[];

export default sillyTestQuestions;
