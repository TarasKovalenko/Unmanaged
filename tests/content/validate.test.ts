import { describe, expect, test } from 'vitest';

import { content } from '../../src/content/index.ts';
import type { Content } from '../../src/content/index.ts';
import type { Conflict, SpanKind, TimelineEventKind } from '../../src/content/types.ts';
import { structuralProblems } from '../../src/content/validate.ts';
import { COMPILE_ERROR, PANIC, RUST, drill, emptyContent, gotcha, lesson, phrase, project, snippet, timeline, track, validContent } from './fixtures.ts';

const compileConflict = (over: Partial<Conflict> = {}): Conflict => ({
  spans: [0, 1],
  errorCode: 'E0382',
  message: COMPILE_ERROR,
  explanation: 'The value moved.',
  ...over,
});
const runtimeConflict = (over: Partial<Conflict> = {}): Conflict =>
  compileConflict({ errorCode: 'panic', message: PANIC, phase: 'runtime', ...over });

const cases = (rows: [string, Content, string[]][]) => rows;

describe('structuralProblems', () => {
  test('reports nothing for the real content', () => {
    expect(structuralProblems(content)).toEqual([]);
  });

  test('reports nothing for valid fixtures', () => {
    expect(structuralProblems(validContent())).toEqual([]);
    expect(structuralProblems(emptyContent())).toEqual([]);
  });

  describe('borrow snippets', () => {
    test.each(
      cases([
        ['duplicate ids', validContent({ snippets: [snippet(), snippet()] }), ['borrow/move: duplicate id']],
        [
          'unknown span kinds',
          validContent({ snippets: [snippet({ spans: [{ variable: 'a', kind: 'lent' as SpanKind, startLine: 2, endLine: 2 }] })] }),
          ['borrow/move spans[0]: unknown kind "lent"'],
        ],
        [
          'spans starting before line 1',
          validContent({ snippets: [snippet({ spans: [{ variable: 'a', kind: 'owned', startLine: 0, endLine: 3 }] })] }),
          ['borrow/move spans[0]: lines 0-3 outside 1-4'],
        ],
        [
          'spans ending after the last line',
          validContent({ snippets: [snippet({ spans: [{ variable: 'a', kind: 'owned', startLine: 2, endLine: 5 }] })] }),
          ['borrow/move spans[0]: lines 2-5 outside 1-4'],
        ],
        [
          'spans that start after they end',
          validContent({ snippets: [snippet({ spans: [{ variable: 'a', kind: 'owned', startLine: 3, endLine: 2 }] })] }),
          ['borrow/move spans[0]: startLine after endLine'],
        ],
        [
          'span variables missing from variables[]',
          validContent({ snippets: [snippet({ variables: ['b'] })] }),
          ['borrow/move spans[0]: variable "a" missing from variables[]', 'borrow/move spans[1]: variable "a" missing from variables[]'],
        ],
        [
          'runtime checking on something that is not a borrow',
          validContent({ snippets: [snippet({ spans: [{ variable: 'a', kind: 'owned', startLine: 2, endLine: 3, checked: 'runtime' }] })] }),
          ["borrow/move spans[0]: checked 'runtime' only applies to borrows"],
        ],
        [
          'compile and runtime conflicts in one snippet',
          validContent({ snippets: [snippet({ conflicts: [compileConflict(), runtimeConflict()] })] }),
          ['borrow/move: mixing compile and runtime conflicts in one snippet is not supported'],
        ],
        [
          'conflicts pointing at missing spans',
          validContent({ snippets: [snippet({ conflicts: [compileConflict({ spans: [0, 5] })] })] }),
          ['borrow/move conflicts[0]: span index 5 does not exist'],
        ],
        [
          'conflicts pointing at the same span twice',
          validContent({ snippets: [snippet({ conflicts: [compileConflict({ spans: [1, 1] })] })] }),
          ['borrow/move conflicts[0]: both span indices are 1'],
        ],
        [
          'runtime conflicts with an error code',
          validContent({ snippets: [snippet({ conflicts: [runtimeConflict({ errorCode: 'E0382' })] })] }),
          ['borrow/move conflicts[0]: runtime conflicts use errorCode "panic"'],
        ],
        [
          'runtime conflicts without panic output',
          validContent({ snippets: [snippet({ conflicts: [runtimeConflict({ message: 'boom' })] })] }),
          ['borrow/move conflicts[0]: runtime message must be verbatim panic output'],
        ],
        [
          'malformed error codes',
          validContent({ snippets: [snippet({ conflicts: [compileConflict({ errorCode: 'E38' })] })] }),
          ['borrow/move conflicts[0]: errorCode "E38" is not E####', 'borrow/move conflicts[0]: message does not contain error[E38]'],
        ],
        [
          'messages without the error code',
          validContent({ snippets: [snippet({ conflicts: [compileConflict({ message: 'nope' })] })] }),
          ['borrow/move conflicts[0]: message does not contain error[E0382]'],
        ],
        [
          'blank explanations',
          validContent({ snippets: [snippet({ conflicts: [compileConflict({ explanation: '  ' })] })] }),
          ['borrow/move conflicts[0]: explanation is empty'],
        ],
        [
          'clean snippets without a takeaway',
          validContent({ snippets: [snippet({ takeaway: undefined })] }),
          ['borrow/move: snippets without conflicts need a takeaway'],
        ],
        [
          'pairedWith pointing nowhere',
          validContent({ snippets: [snippet({ pairedWith: 'ghost' })] }),
          ['borrow/move: pairedWith "ghost" does not exist'],
        ],
        [
          'local paths in conflict messages',
          validContent({ snippets: [snippet({ conflicts: [compileConflict({ message: `${COMPILE_ERROR}\n  --> /Users/me/src/main.rs` })] })] }),
          ['borrow/move conflicts[0]: message contains a local filesystem path'],
        ],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });

    test('accepts runtime borrows, listed variables, pairs and valid conflicts', () => {
      const c = validContent({
        snippets: [
          snippet({
            variables: ['a'],
            spans: [
              { variable: 'a', kind: 'borrow', startLine: 2, endLine: 3, checked: 'runtime' },
              { variable: 'a', kind: 'borrow_mut', startLine: 3, endLine: 3, checked: 'runtime' },
            ],
            conflicts: [runtimeConflict()],
            takeaway: undefined,
            pairedWith: 'fixed',
          }),
          snippet({ id: 'fixed', conflicts: [compileConflict()], pairedWith: 'move' }),
        ],
      });
      expect(structuralProblems(c)).toEqual([]);
    });
  });

  describe('timelines', () => {
    const withSide = (side: 'csharp' | 'rust', over: object) => {
      const t = timeline();
      return validContent({ timelines: [{ ...t, [side]: { ...t[side], ...over } }] });
    };

    test.each(
      cases([
        ['duplicate ids', validContent({ timelines: [timeline(), timeline()] }), ['timeline/lazy: duplicate id']],
        ['tick notes of the wrong length', validContent({ timelines: [timeline({ tickNotes: ['one'] })] }), ['timeline/lazy: tickNotes has 1 entries, ticks is 2']],
        ['lineAtTick of the wrong length', withSide('csharp', { lineAtTick: [1] }), ['timeline/lazy csharp: lineAtTick has 1 entries, ticks is 2']],
        [
          'lineAtTick outside the code',
          withSide('rust', { lineAtTick: [-1, 5] }),
          ['timeline/lazy rust: lineAtTick[0] = -1 outside 0-4', 'timeline/lazy rust: lineAtTick[1] = 5 outside 0-4'],
        ],
        [
          'unknown event kinds',
          withSide('csharp', { events: [{ lane: 'main', kind: 'sleeping' as TimelineEventKind, start: 0, end: 1 }] }),
          ['timeline/lazy csharp events[0]: unknown kind "sleeping"'],
        ],
        [
          'events outside the ticks',
          withSide('rust', {
            events: [
              { lane: 'main', kind: 'running', start: -1, end: 0 },
              { lane: 'main', kind: 'running', start: 0, end: 2 },
              { lane: 'main', kind: 'running', start: 1, end: 0 },
            ],
          }),
          [
            'timeline/lazy rust events[0]: ticks -1-0 outside 0-1',
            'timeline/lazy rust events[1]: ticks 0-2 outside 0-1',
            'timeline/lazy rust events[2]: ticks 1-0 outside 0-1',
          ],
        ],
        ['unchecked Rust without a reason', withSide('rust', { expect: 'unchecked', uncheckedReason: ' ' }), ["timeline/lazy rust: expect 'unchecked' needs uncheckedReason"]],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });

    test('accepts timelines without tick notes and unchecked Rust with a reason', () => {
      const t = timeline({ tickNotes: undefined });
      const c = validContent({ timelines: [{ ...t, rust: { ...t.rust, expect: 'unchecked', uncheckedReason: 'needs tokio' } }] });
      expect(structuralProblems(c)).toEqual([]);
    });
  });

  describe('drills', () => {
    const option = (correct?: boolean) => ({ text: 'X', correct, why: 'Because.' });
    const fix = drill().fixes[0];

    test.each(
      cases([
        ['duplicate ids', validContent({ drills: [drill(), drill()] }), ['drill/use-after-move: duplicate id']],
        ['unknown tracks', validContent({ drills: [drill({ track: 'ghost' })] }), ['drill/use-after-move: track "ghost" does not exist']],
        ['too few options', validContent({ drills: [drill({ options: [option(true), option()] })] }), ['drill/use-after-move: needs 3 or 4 options']],
        [
          'too many options',
          validContent({ drills: [drill({ options: [option(true), option(), option(), option(), option()] })] }),
          ['drill/use-after-move: needs 3 or 4 options'],
        ],
        ['no correct option', validContent({ drills: [drill({ options: [option(), option(), option()] })] }), ['drill/use-after-move: exactly one option must be correct']],
        [
          'several correct options',
          validContent({ drills: [drill({ options: [option(true), option(true), option()] })] }),
          ['drill/use-after-move: exactly one option must be correct'],
        ],
        [
          'no fixes',
          validContent({ drills: [drill({ fixes: [] })] }),
          [
            'drill/use-after-move: needs at least two fixes (idiomatic + a worse one)',
            'drill/use-after-move: first fix must be idiomatic',
            'drill/use-after-move: needs at least one non-idiomatic fix',
          ],
        ],
        [
          'a non-idiomatic first fix',
          validContent({ drills: [drill({ fixes: [{ ...fix, verdict: 'works-but' }, fix] })] }),
          ['drill/use-after-move: first fix must be idiomatic'],
        ],
        ['only idiomatic fixes', validContent({ drills: [drill({ fixes: [fix, fix] })] }), ['drill/use-after-move: needs at least one non-idiomatic fix']],
        [
          'panic drills with an error code',
          validContent({ drills: [drill({ outcome: 'panic', message: PANIC })] }),
          ['drill/use-after-move: panic drills use errorCode "panic"'],
        ],
        [
          'panic drills without panic output',
          validContent({ drills: [drill({ outcome: 'panic', errorCode: 'panic' })] }),
          ['drill/use-after-move: message must be verbatim panic output'],
        ],
        ['compile drills without the error code in the message', validContent({ drills: [drill({ message: 'nope' })] }), ['drill/use-after-move: message does not contain error[E0382]']],
        [
          'unchecked fixes without a reason',
          validContent({ drills: [drill({ fixes: [fix, { ...fix, verdict: 'works-but', expect: 'unchecked' }] })] }),
          ["drill/use-after-move fixes[1]: expect 'unchecked' needs uncheckedReason"],
        ],
        [
          'acceptable fixes that do not compile',
          validContent({ drills: [drill({ fixes: [{ ...fix, expect: 'fails' }, { ...fix, verdict: 'works-but', expect: 'panics' }] })] }),
          ['drill/use-after-move fixes[0]: idiomatic fixes must compile', 'drill/use-after-move fixes[1]: works-but fixes must compile'],
        ],
        [
          'local paths in messages',
          validContent({ drills: [drill({ message: `${COMPILE_ERROR}\n  --> C:\\src\\main.rs` })] }),
          ['drill/use-after-move: message contains a local filesystem path'],
        ],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });

    test('accepts panic drills, four options, wrong fixes that fail and unchecked fixes with a reason', () => {
      const c = validContent({
        drills: [
          drill({
            outcome: 'panic',
            errorCode: 'panic',
            message: PANIC,
            options: [option(true), option(), option(), option()],
            fixes: [
              { ...fix, expect: 'unchecked', uncheckedReason: 'needs serde' },
              { ...fix, verdict: 'wrong', expect: 'fails' },
            ],
          }),
        ],
      });
      expect(structuralProblems(c)).toEqual([]);
    });
  });

  describe('gotchas', () => {
    test.each(
      cases([
        ['duplicate ids', validContent({ gotchas: [gotcha(), gotcha()] }), ['gotcha/string-index: duplicate id']],
        ['missing tags', validContent({ gotchas: [gotcha({ tags: [] })] }), ['gotcha/string-index: needs at least one tag']],
        ['failing code without an error code', validContent({ gotchas: [gotcha({ expect: 'fails' })] }), ["gotcha/string-index: expect 'fails' needs errorCode"]],
        ['stdout on code that does not compile', validContent({ gotchas: [gotcha({ expect: 'panics', stdout: 'x' })] }), ["gotcha/string-index: stdout requires expect 'compiles'"]],
        ['unchecked code without a reason', validContent({ gotchas: [gotcha({ expect: 'unchecked' })] }), ["gotcha/string-index: expect 'unchecked' needs uncheckedReason"]],
        [
          'seeAlso pointing at a missing lesson',
          validContent({ gotchas: [gotcha({ seeAlso: { kind: 'lesson', id: 'ghost' } })] }),
          ['gotcha/string-index: seeAlso lesson "ghost" does not exist'],
        ],
        [
          'seeAlso pointing at a missing drill',
          validContent({ gotchas: [gotcha({ seeAlso: { kind: 'drill', id: 'ghost' } })] }),
          ['gotcha/string-index: seeAlso drill "ghost" does not exist'],
        ],
        [
          'seeAlso pointing at a missing snippet',
          validContent({ gotchas: [gotcha({ seeAlso: { kind: 'snippet', id: 'ghost' } })] }),
          ['gotcha/string-index: seeAlso snippet "ghost" does not exist'],
        ],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });

    test('accepts failing code with an error code, stdout on compiling code, and every seeAlso kind', () => {
      const c = validContent({
        gotchas: [
          gotcha({ expect: 'fails', errorCode: 'E0277', seeAlso: { kind: 'drill', id: 'use-after-move' } }),
          gotcha({ id: 'g2', stdout: '1\n', seeAlso: { kind: 'snippet', id: 'move' } }),
          gotcha({ id: 'g3', expect: 'unchecked', uncheckedReason: 'needs rand', seeAlso: undefined }),
        ],
      });
      expect(structuralProblems(c)).toEqual([]);
    });
  });

  describe('tracks and lessons', () => {
    const withLesson = (over: Parameters<typeof lesson>[0]) => validContent({ tracks: [track({ lessons: [lesson(over)] })] });

    test.each(
      cases([
        [
          'available tracks without lessons',
          validContent({ tracks: [track({ lessons: [] })], gotchas: [gotcha({ seeAlso: undefined })] }),
          ['track/ownership: available but has no lessons'],
        ],
        ['duplicate lesson ids', validContent({ tracks: [track({ lessons: [lesson(), lesson()] })] }), ['lesson/moves: duplicate id']],
        ['lessons without breaks', withLesson({ breaks: [] }), ['lesson/moves: beat 3 ("where the analogy breaks") is mandatory']],
        [
          'links outside the code',
          withLesson({ links: [{ csharp: [0], rust: [2] }, { csharp: [3], rust: [5] }].map((l) => ({ ...l, note: 'n' })) }),
          ['lesson/moves links[0]: C# line outside 1-2', 'lesson/moves links[1]: C# line outside 1-2', 'lesson/moves links[1]: Rust line outside 1-4'],
        ],
        [
          'Rust links before line 1',
          withLesson({ links: [{ csharp: [1], rust: [0], note: 'n' }] }),
          ['lesson/moves links[0]: Rust line outside 1-4'],
        ],
        [
          'unchecked lesson Rust without a reason',
          withLesson({ rust: { code: RUST, filename: 'main.rs', expect: 'unchecked' } }),
          ["lesson/moves rust: expect 'unchecked' needs uncheckedReason"],
        ],
        [
          'Rust break code without expect',
          withLesson({ breaks: [{ heading: 'h', body: [], code: { language: 'rust', code: RUST } }] }),
          ['lesson/moves breaks[0]: Rust code needs expect'],
        ],
        [
          'expect on non-Rust break code',
          withLesson({ breaks: [{ heading: 'h', body: [], code: { language: 'csharp', code: 'var a = 1;', expect: 'compiles' } }] }),
          ['lesson/moves breaks[0]: only Rust code can have expect'],
        ],
        [
          'unchecked break code without a reason',
          withLesson({ breaks: [{ heading: 'h', body: [], code: { language: 'rust', code: RUST, expect: 'unchecked' } }] }),
          ["lesson/moves breaks[0]: expect 'unchecked' needs uncheckedReason"],
        ],
        [
          'stdout on break code that does not compile',
          withLesson({ breaks: [{ heading: 'h', body: [], code: { language: 'rust', code: RUST, expect: 'fails', stdout: 'x' } }] }),
          ["lesson/moves breaks[0]: stdout requires expect 'compiles'"],
        ],
        ['visualize pointing nowhere', withLesson({ visualize: ['ghost'] }), ['lesson/moves: visualize "ghost" is not a snippet id']],
        ['timelines pointing nowhere', withLesson({ timelines: ['ghost'] }), ['lesson/moves: timeline "ghost" does not exist']],
        ['drills pointing nowhere', withLesson({ drills: ['ghost'] }), ['lesson/moves: drill "ghost" does not exist']],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });

    test('accepts planned tracks without lessons, lessons without timelines or drills, and valid break code', () => {
      const c = validContent({
        tracks: [
          track({
            lessons: [
              lesson({
                timelines: undefined,
                drills: undefined,
                rust: { code: RUST, filename: 'main.rs', expect: 'unchecked', uncheckedReason: 'needs tokio' },
                breaks: [
                  { heading: 'h', body: [], code: { language: 'rust', code: RUST, expect: 'compiles', stdout: '1\n' } },
                  { heading: 'h', body: [], code: { language: 'toml', code: '[package]' } },
                ],
              }),
            ],
          }),
          track({ id: 'async', order: 2, status: 'planned', lessons: [] }),
        ],
      });
      expect(structuralProblems(c)).toEqual([]);
    });
  });

  describe('phrases', () => {
    test.each(
      cases([
        ['duplicate ids', validContent({ phrases: [phrase(), phrase()] }), ['phrase/var: duplicate id']],
        ['seeAlso pointing nowhere', validContent({ phrases: [phrase({ seeAlso: { kind: 'gotcha', id: 'ghost' } })] }), ['phrase/var: seeAlso gotcha "ghost" does not exist']],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });

    test('accepts phrases without seeAlso', () => {
      expect(structuralProblems(validContent({ phrases: [phrase({ seeAlso: undefined })] }))).toEqual([]);
    });
  });

  describe('projects', () => {
    test.each(
      cases([
        ['duplicate ids', validContent({ projects: [project(), project()] }), ['project/todo: duplicate id']],
        ['projects without milestones', validContent({ projects: [project({ milestones: [] })] }), ['project/todo: needs milestones']],
        ['unknown exercised tracks', validContent({ projects: [project({ exercises: ['ghost'] })] }), ['project/todo: exercises unknown track "ghost"']],
        [
          'duplicate milestone ids',
          validContent({ projects: [project({ milestones: [...project().milestones, ...project().milestones] })] }),
          ['project/todo/m1: duplicate id'],
        ],
        [
          'milestone Rust code without expect',
          validContent({ projects: [project({ milestones: [{ ...project().milestones[0], code: { language: 'rust', code: RUST } }] })] }),
          ['project/todo/m1: Rust code needs expect'],
        ],
      ]),
    )('reports %s', (_, c, expected) => {
      expect(structuralProblems(c)).toEqual(expected);
    });
  });
});
