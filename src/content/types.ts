// Content model for Unmanaged.
//
// Everything a learner sees is authored here as data. Components render it;
// they never contain lesson text. See CONTENT.md for the authoring guide.
//
// Line numbers are 1-based and refer to the snippet's `code` string *after*
// it has been passed through `code` (src/content/code.ts), which strips the
// leading newline and common indentation.
//
// Every piece of Rust is a complete program (it has `fn main`) and is checked
// by `npm run check:content`, unless it is explicitly marked `unchecked` with
// a reason (only allowed for code that needs crates from crates.io).

/** Prose supports `inline code` via backticks and **strong** via double stars.
 *  Paragraphs are separate array entries. */
export type Prose = string[];

/** What the checker proves about a Rust program.
 *  - compiles: rustc accepts it
 *  - fails: rustc rejects it
 *  - panics: it compiles, and running it panics
 *  - unchecked: not compiled, because it depends on external crates */
export type Expect = 'compiles' | 'fails' | 'panics' | 'unchecked';

export type CodeLanguage = 'rust' | 'csharp' | 'toml' | 'shell';

// ---------------------------------------------------------------------------
// Borrow visualizer
// ---------------------------------------------------------------------------

export type SpanKind = 'owned' | 'borrow' | 'borrow_mut' | 'moved' | 'dropped';

export interface Span {
  /** The variable whose track this bar is drawn on. For borrows, this is the
   *  variable being borrowed *from* (the lender), not the reference. */
  variable: string;
  kind: SpanKind;
  startLine: number;
  endLine: number;
  /** Short, shown on hover and in the scrubber readout. e.g. "&mut v passed to push" */
  label?: string;
  /** Borrows only. 'runtime' means a RefCell (or similar) guard: the rule is
   *  enforced when the program runs, not by the compiler. Drawn with a dashed
   *  outline. Defaults to 'compile'. */
  checked?: 'compile' | 'runtime';
}

export interface Conflict {
  /** Indices into the snippet's `spans` array. */
  spans: [number, number];
  /** rustc error code, e.g. "E0502". Use "panic" for runtime conflicts. */
  errorCode: string;
  /** Compile conflicts: verbatim rustc output from `error[` up to (not
   *  including) `error: aborting`. Runtime conflicts: verbatim panic output,
   *  from `thread 'main' panicked` through the panic message line. */
  message: string;
  /** Plain English, framed against what a C# developer expects. */
  explanation: string;
  /** Defaults to 'compile'. 'runtime' requires the program to compile and panic. */
  phase?: 'compile' | 'runtime';
}

export interface BorrowSnippet {
  id: string;
  title: string;
  /** One sentence: what this snippet demonstrates. */
  summary: string;
  code: string;
  spans: Span[];
  /** Empty for snippets that compile and run cleanly. */
  conflicts: Conflict[];
  csharpEquivalent?: string;
  /** Optional: what happens to the C# version at runtime, if anything. */
  csharpNote?: string;
  /** Variable track order, left to right. Defaults to first appearance in spans. */
  variables?: string[];
  /** Only for snippets without conflicts: the idiomatic takeaway. */
  takeaway?: string;
  /** Snippet id of the fixed / broken counterpart, if there is one. */
  pairedWith?: string;
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

/** Links a set of lines in the C# pane to a set of lines in the Rust pane. */
export interface LineLink {
  csharp: number[];
  rust: number[];
  note: string;
}

export interface LessonCode {
  code: string;
  /** Shown above the pane, e.g. "OrderService.cs". */
  filename: string;
}

export interface LessonRust extends LessonCode {
  /** Defaults to 'compiles'. Use 'unchecked' only for code that needs crates. */
  expect?: 'compiles' | 'unchecked';
  /** Required when expect is 'unchecked': which crates, and why it can't be checked. */
  uncheckedReason?: string;
  /** If set, the checker runs the program and compares stdout verbatim. */
  stdout?: string;
}

export interface CheckedCode {
  language: CodeLanguage;
  code: string;
  /** Rust only. C#, TOML and shell are never compiled. */
  expect?: Expect;
  uncheckedReason?: string;
  /** Rust + compiles: checker runs it and compares stdout verbatim. */
  stdout?: string;
  /** Caption above the block, e.g. "Cargo.toml". */
  caption?: string;
}

export interface BreakPoint {
  /** One line. The specific place the C# intuition fails. */
  heading: string;
  body: Prose;
  /** Optional code that shows the break. Rust is checked against `expect`. */
  code?: CheckedCode;
}

export interface Lesson {
  id: string;
  title: string;
  /** One sentence for the track index. */
  summary: string;
  /** Short framing before beat 1. */
  intro: Prose;
  /** Beat 1: the C# you already write. */
  csharp: LessonCode;
  /** Beat 2: the Rust equivalent. */
  rust: LessonRust;
  links: LineLink[];
  /** Beat 3: where the analogy breaks. Mandatory, never empty. */
  breaks: BreakPoint[];
  /** BorrowSnippet ids to embed after beat 3. */
  visualize: string[];
  /** Timeline ids (async execution diagrams) to embed after beat 3. */
  timelines?: string[];
  /** Drill ids offered at the end of the lesson. */
  drills?: string[];
  /** Two or three lines to carry into the next lesson. */
  takeaways: string[];
}

export interface Track {
  id: string;
  /** Position in the six stuck points, 1-based. */
  order: number;
  title: string;
  /** Why this stuck point hurts, in one or two sentences. */
  pitch: string;
  status: 'available' | 'planned';
  lessons: Lesson[];
}

// ---------------------------------------------------------------------------
// Compiler error drills
// ---------------------------------------------------------------------------

export interface DrillOption {
  /** The diagnosis, as the learner would say it. */
  text: string;
  correct?: boolean;
  /** Shown after answering: why this is right, or why it's a tempting wrong answer. */
  why: string;
}

export interface DrillFix {
  /** Short name, e.g. "Borrow instead of taking ownership". */
  label: string;
  /** idiomatic: what an experienced Rust developer writes.
   *  works-but: compiles, sometimes right, usually a smell.
   *  wrong: looks plausible, still broken (or broken differently). */
  verdict: 'idiomatic' | 'works-but' | 'wrong';
  /** Complete program. */
  code: string;
  /** Checked. idiomatic/works-but must be 'compiles' (or 'unchecked' with reason). */
  expect: Expect;
  uncheckedReason?: string;
  note: string;
}

export interface Drill {
  id: string;
  /** Track id this drill belongs to. */
  track: string;
  title: string;
  /** Complete program that fails to compile (or panics). */
  code: string;
  outcome: 'compile-error' | 'panic';
  /** rustc code (E0382) for compile errors; "panic" for panics. */
  errorCode: string;
  /** Verbatim rustc output (as Conflict.message), or verbatim panic output. */
  message: string;
  /** Defaults to "What is the actual problem?" */
  question?: string;
  /** 3 or 4 options, exactly one correct. */
  options: DrillOption[];
  /** First fix should be the idiomatic one. At least one non-idiomatic fix. */
  fixes: DrillFix[];
  /** Optional: the C# reflex that produces this bug. */
  csharpReflex?: string;
}

// ---------------------------------------------------------------------------
// Gotcha cards
// ---------------------------------------------------------------------------

export type GotchaTag =
  | 'strings'
  | 'numbers'
  | 'types'
  | 'syntax'
  | 'traits'
  | 'errors'
  | 'memory'
  | 'collections'
  | 'async'
  | 'tooling'
  | 'equality'
  | 'functions';

export interface Gotcha {
  id: string;
  title: string;
  tags: GotchaTag[];
  /** What a C# developer assumes. One or two sentences. */
  assumption: string;
  /** What actually happens in Rust. One or two sentences. */
  reality: string;
  /** Small complete Rust program demonstrating it. Keep it to a few lines. */
  code: string;
  expect: Expect;
  /** Required when expect is 'fails'. */
  errorCode?: string;
  uncheckedReason?: string;
  /** Checked when set (expect must be 'compiles'). */
  stdout?: string;
  /** Optional one or two lines of C# for contrast. */
  csharp?: string;
  /** Lesson id, drill id, or snippet id for further reading. */
  seeAlso?: { kind: 'lesson' | 'drill' | 'snippet'; id: string };
}

// ---------------------------------------------------------------------------
// Async timelines
// ---------------------------------------------------------------------------

export type TimelineEventKind =
  /** code is executing on a thread */
  | 'running'
  /** suspended at an await, waiting for something */
  | 'waiting'
  /** exists but has never been polled / started */
  | 'inert'
  /** blocking a thread */
  | 'blocked'
  /** finished; result available */
  | 'done'
  /** dropped or abandoned without completing */
  | 'dropped';

export interface TimelineEvent {
  /** Lane name, e.g. "main", "SendEmailAsync", "runtime worker 1". */
  lane: string;
  kind: TimelineEventKind;
  /** Tick indices, inclusive. Ticks are abstract time steps. */
  start: number;
  end: number;
  label?: string;
}

export interface TimelineSide {
  code: string;
  filename: string;
  events: TimelineEvent[];
  /** For each tick, the code line executing (or 0 for none). Length must equal ticks. */
  lineAtTick: number[];
  /** Real program output, shown under the pane. */
  output?: string;
}

export interface Timeline {
  id: string;
  title: string;
  summary: string;
  ticks: number;
  /** Optional caption per tick, shown while scrubbing. Length must equal ticks. */
  tickNotes?: string[];
  csharp: TimelineSide;
  rust: TimelineSide & {
    expect: 'compiles' | 'unchecked';
    uncheckedReason?: string;
  };
  explanation: Prose;
}

// ---------------------------------------------------------------------------
// Mini-projects
// ---------------------------------------------------------------------------

export interface EcosystemEntry {
  dotnet: string;
  rust: string;
  note: string;
}

export interface Milestone {
  id: string;
  title: string;
  goal: Prose;
  /** Progressive hints, revealed one at a time. */
  hints: string[];
  /** How you know you're done. Concrete and observable. */
  checkpoint: string;
  code?: CheckedCode;
}

export interface Project {
  id: string;
  title: string;
  summary: string;
  /** What you'd build this with in .NET, e.g. "Minimal API + System.Text.Json". */
  dotnetEquivalent: string;
  crates: { name: string; version: string; dotnet: string; why: string }[];
  spec: Prose;
  milestones: Milestone[];
  stretch?: string[];
  /** Track ids this project exercises. */
  exercises: string[];
}

// ---------------------------------------------------------------------------
// Phrasebook
// ---------------------------------------------------------------------------

export type PhraseCategory =
  | 'types'
  | 'collections'
  | 'linq'
  | 'errors'
  | 'async'
  | 'oop'
  | 'memory'
  | 'strings'
  | 'tooling'
  | 'syntax';

export interface Phrase {
  id: string;
  category: PhraseCategory;
  /** The C# construct, as code. */
  csharp: string;
  /** The closest Rust, as code. */
  rust: string;
  /** Where it maps and where it doesn't. One or two sentences. */
  note: string;
  /** How faithful the mapping is. */
  fit: 'direct' | 'close' | 'different';
  seeAlso?: { kind: 'lesson' | 'gotcha' | 'drill'; id: string };
}
