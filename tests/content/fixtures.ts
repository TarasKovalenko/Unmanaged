// Minimal, structurally valid content for tests. Every cross reference
// resolves, so `structuralProblems(validContent())` is empty and each test
// can break exactly one rule.

import type { Content } from '../../src/content/index.ts';
import type { BorrowSnippet, Drill, Gotcha, Lesson, Phrase, Project, Timeline, Track } from '../../src/content/types.ts';

export const RUST = 'fn main() {\n    let a = 1;\n    println!("{a}");\n}';

export const COMPILE_ERROR = 'error[E0382]: borrow of moved value: `a`\n --> src/main.rs:3:20';
export const PANIC = "thread 'main' panicked at src/main.rs:2:5:\nboom";

export function snippet(over: Partial<BorrowSnippet> = {}): BorrowSnippet {
  return {
    id: 'move',
    title: 'Move',
    summary: 'A move.',
    code: RUST,
    spans: [
      { variable: 'a', kind: 'owned', startLine: 2, endLine: 3 },
      { variable: 'a', kind: 'borrow', startLine: 3, endLine: 3 },
    ],
    conflicts: [],
    takeaway: 'Moves are cheap.',
    ...over,
  };
}

export function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'moves',
    title: 'Moves',
    summary: 'Moves.',
    intro: ['Intro.'],
    csharp: { code: 'var a = 1;\nConsole.WriteLine(a);', filename: 'Program.cs' },
    rust: { code: RUST, filename: 'main.rs' },
    links: [{ csharp: [1, 2], rust: [2, 3], note: 'Same.' }],
    breaks: [{ heading: 'Break', body: ['Body.'] }],
    visualize: ['move'],
    timelines: ['lazy'],
    drills: ['use-after-move'],
    takeaways: ['Done.'],
    ...over,
  };
}

export function track(over: Partial<Track> = {}): Track {
  return { id: 'ownership', order: 1, title: 'Ownership', pitch: 'Pitch.', status: 'available', lessons: [lesson()], ...over };
}

export function drill(over: Partial<Drill> = {}): Drill {
  return {
    id: 'use-after-move',
    track: 'ownership',
    title: 'Use after move',
    code: RUST,
    outcome: 'compile-error',
    errorCode: 'E0382',
    message: COMPILE_ERROR,
    options: [
      { text: 'A', correct: true, why: 'Yes.' },
      { text: 'B', why: 'No.' },
      { text: 'C', why: 'No.' },
    ],
    fixes: [
      { label: 'Borrow', verdict: 'idiomatic', code: RUST, expect: 'compiles', note: 'Good.' },
      { label: 'Clone', verdict: 'works-but', code: RUST, expect: 'compiles', note: 'Meh.' },
    ],
    ...over,
  };
}

export function gotcha(over: Partial<Gotcha> = {}): Gotcha {
  return {
    id: 'string-index',
    title: 'Strings',
    tags: ['strings'],
    assumption: 'Index.',
    reality: 'No.',
    code: RUST,
    expect: 'compiles',
    seeAlso: { kind: 'lesson', id: 'moves' },
    ...over,
  };
}

export function timeline(over: Partial<Timeline> = {}): Timeline {
  return {
    id: 'lazy',
    title: 'Lazy',
    summary: 'Lazy futures.',
    ticks: 2,
    tickNotes: ['start', 'end'],
    csharp: {
      code: 'Console.WriteLine("hi");',
      filename: 'Program.cs',
      events: [{ lane: 'main', kind: 'running', start: 0, end: 1 }],
      lineAtTick: [1, 0],
      output: 'hi\n',
    },
    rust: {
      code: RUST,
      filename: 'main.rs',
      events: [{ lane: 'main', kind: 'done', start: 1, end: 1 }],
      lineAtTick: [0, 4],
      expect: 'compiles',
      output: '1\n',
    },
    explanation: ['Because.'],
    ...over,
  };
}

export function project(over: Partial<Project> = {}): Project {
  return {
    id: 'todo',
    title: 'Todo',
    summary: 'A todo app.',
    dotnetEquivalent: 'Console app',
    crates: [],
    spec: ['Spec.'],
    milestones: [{ id: 'm1', title: 'Start', goal: ['Goal.'], hints: [], checkpoint: 'Runs.' }],
    exercises: ['ownership'],
    ...over,
  };
}

export function phrase(over: Partial<Phrase> = {}): Phrase {
  return { id: 'var', category: 'syntax', csharp: 'var x', rust: 'let x', note: 'Same.', fit: 'direct', seeAlso: { kind: 'gotcha', id: 'string-index' }, ...over };
}

export function validContent(over: Partial<Content> = {}): Content {
  return {
    tracks: [track()],
    snippets: [snippet()],
    drills: [drill()],
    gotchas: [gotcha()],
    timelines: [timeline()],
    projects: [project()],
    ecosystem: [],
    phrases: [phrase()],
    ...over,
  };
}

/** Content with nothing in it. */
export function emptyContent(over: Partial<Content> = {}): Content {
  return { tracks: [], snippets: [], drills: [], gotchas: [], timelines: [], projects: [], ecosystem: [], phrases: [], ...over };
}
