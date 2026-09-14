import { describe, expect, test } from 'vitest';

import { borrowSnippets } from '../../src/content/borrow/index.ts';
import type { BorrowSnippet, Conflict, Span } from '../../src/content/types.ts';
import { conflictingSpans, conflictsAtLine, isOwner, layoutTracks, OWNER_KINDS, stateAt } from '../../src/lib/borrowLayout.ts';

const byId = (id: string) => borrowSnippets.find((s) => s.id === id)!;

function snippet(spans: Span[], conflicts: Pick<Conflict, 'spans'>[] = [], variables?: string[]): BorrowSnippet {
  return {
    id: 'test',
    title: 'Test',
    summary: '',
    code: '',
    spans,
    conflicts: conflicts.map((c) => ({ errorCode: 'E0000', message: '', explanation: '', ...c })),
    variables,
  };
}

const span = (variable: string, kind: Span['kind'], startLine: number, endLine: number, label?: string): Span => ({ variable, kind, startLine, endLine, label });

describe('isOwner', () => {
  test('treats owned, moved and dropped spans as ownership and borrows as not', () => {
    expect([...OWNER_KINDS].sort()).toEqual(['dropped', 'moved', 'owned']);
    expect(isOwner(span('v', 'owned', 1, 1))).toBe(true);
    expect(isOwner(span('v', 'moved', 1, 1))).toBe(true);
    expect(isOwner(span('v', 'dropped', 1, 1))).toBe(true);
    expect(isOwner(span('v', 'borrow', 1, 1))).toBe(false);
    expect(isOwner(span('v', 'borrow_mut', 1, 1))).toBe(false);
  });
});

describe('layoutTracks', () => {
  test('orders tracks by first appearance when no variable order is given', () => {
    const tracks = layoutTracks(snippet([span('b', 'owned', 1, 2), span('a', 'owned', 1, 2), span('b', 'borrow', 2, 2)]));
    expect(tracks.map((t) => t.variable)).toEqual(['b', 'a']);
  });

  test('uses the explicit variable order and gives an unused variable one empty lane', () => {
    const tracks = layoutTracks(snippet([span('a', 'owned', 1, 2)], [], ['ghost', 'a']));
    expect(tracks.map((t) => t.variable)).toEqual(['ghost', 'a']);
    expect(tracks[0]).toEqual({ variable: 'ghost', lanes: 1, placed: [] });
  });

  test('reassignment hands ownership over mid-row in the same lane', () => {
    const [track] = layoutTracks(byId('assign-while-borrowed'));
    const owners = track.placed.filter((p) => p.span.kind === 'dropped');
    expect(owners[0].lane).toBe(owners[1].lane);
    expect(owners[0].endsMid && owners[1].startsMid).toBe(true);
    expect(track.placed.find((p) => p.span.kind === 'borrow')!.lane).toBe(1);
  });

  test('puts overlapping owners in separate lanes and borrows after all owner lanes', () => {
    const [track] = layoutTracks(
      snippet([
        span('v', 'owned', 1, 5), // 0
        span('v', 'owned', 2, 3), // 1 overlaps 0
        span('v', 'borrow', 2, 4), // 2
        span('v', 'borrow', 4, 6), // 3 touches 2 on line 4, so needs its own lane
        span('v', 'borrow_mut', 7, 8), // 4 fits back in the first borrow lane
      ]),
    );
    const laneOf = (index: number) => track.placed.find((p) => p.index === index)!.lane;
    expect([laneOf(0), laneOf(1)]).toEqual([0, 1]);
    expect([laneOf(2), laneOf(3), laneOf(4)]).toEqual([2, 3, 2]);
    expect(track.lanes).toBe(4);
    expect(track.placed.every((p) => !p.startsMid && !p.endsMid)).toBe(true);
  });

  test('places the longer span first when two start on the same line', () => {
    const [track] = layoutTracks(snippet([span('v', 'borrow', 1, 2), span('v', 'borrow', 1, 5)]));
    expect(track.placed.map((p) => [p.index, p.lane])).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  test('does not mark a handover between owners in different lanes', () => {
    const [track] = layoutTracks(snippet([span('v', 'owned', 1, 4), span('v', 'owned', 2, 4), span('v', 'moved', 4, 6)]));
    const byIndex = (i: number) => track.placed.find((p) => p.index === i)!;
    // Span 2 reuses lane 0 at line 4 and takes over from span 0 there.
    expect(byIndex(2).lane).toBe(0);
    expect(byIndex(0).endsMid).toBe(true);
    expect(byIndex(2).startsMid).toBe(true);
    expect(byIndex(1).endsMid).toBe(false);
  });
});

describe('conflictingSpans', () => {
  test('collects every span index named by any conflict', () => {
    const s = snippet([span('v', 'owned', 1, 3), span('v', 'borrow', 2, 2), span('v', 'borrow_mut', 3, 3)], [{ spans: [0, 1] }, { spans: [1, 2] }]);
    expect([...conflictingSpans(s)].sort()).toEqual([0, 1, 2]);
    expect(conflictingSpans(snippet([span('v', 'owned', 1, 1)])).size).toBe(0);
  });
});

describe('conflictsAtLine', () => {
  test('is live on the lines of the later span, whichever order the pair is listed in', () => {
    const spans = [span('v', 'borrow', 1, 4), span('v', 'borrow_mut', 3, 5)];
    const forward = snippet(spans, [{ spans: [0, 1] }]);
    const backward = snippet(spans, [{ spans: [1, 0] }]);
    for (const s of [forward, backward]) {
      expect(conflictsAtLine(s, 2)).toEqual([]);
      expect(conflictsAtLine(s, 3)).toEqual([0]);
      expect(conflictsAtLine(s, 5)).toEqual([0]);
      expect(conflictsAtLine(s, 6)).toEqual([]);
    }
  });

  test('uses real snippet data: a use after move is live only at the use', () => {
    const s = byId('move-on-assign');
    expect(conflictsAtLine(s, 5)).toEqual([0]);
    expect(conflictsAtLine(s, 3)).toEqual([]);
  });
});

describe('stateAt', () => {
  const reassigned = snippet([
    span('v', 'owned', 2, 4, 'v created'), // 0
    span('v', 'dropped', 4, 6, 'v reassigned'), // 1
    span('v', 'borrow', 3, 3, 'r = &v'), // 2
    span('v', 'borrow_mut', 5, 5), // 3
  ]);

  test('is not declared yet before the first span', () => {
    expect(stateAt(reassigned, 'v', 1)).toEqual({ variable: 'v', state: 'not declared yet', tone: 'absent', details: [] });
  });

  test('is owned, with the covering labels as details', () => {
    expect(stateAt(reassigned, 'v', 2)).toEqual({ variable: 'v', state: 'owned', tone: 'owned', details: ['v created'] });
  });

  test('reports a single shared borrow over an owner', () => {
    expect(stateAt(reassigned, 'v', 3)).toMatchObject({ state: 'owned, & borrowed', tone: 'borrow', details: ['v created', 'r = &v'] });
  });

  test('reports a handover when a new owner starts on this line', () => {
    expect(stateAt(reassigned, 'v', 4)).toMatchObject({ state: 'old value dropped, new value owned', tone: 'owned' });
  });

  test('reports a single exclusive borrow over an owner', () => {
    expect(stateAt(reassigned, 'v', 5)).toMatchObject({ state: 'owned, &mut borrowed', tone: 'borrow_mut' });
  });

  test('reports a drop on the dropping line and afterwards', () => {
    expect(stateAt(reassigned, 'v', 6)).toMatchObject({ state: 'dropped on this line', tone: 'owned' });
    expect(stateAt(reassigned, 'v', 7)).toMatchObject({ state: 'dropped on line 6', tone: 'gone' });
  });

  const moved = snippet([
    span('w', 'owned', 1, 1), // 0
    span('w', 'moved', 2, 3), // 1
    span('w', 'borrow', 5, 5), // 2
    span('w', 'borrow', 5, 5), // 3
    span('w', 'borrow_mut', 5, 5), // 4
    span('w', 'borrow_mut', 5, 5), // 5
  ]);

  test('reports a move on the moving line', () => {
    expect(stateAt(moved, 'w', 3)).toMatchObject({ state: 'moved away on this line', tone: 'owned' });
  });

  test('uses the most recent owner that ended before the line', () => {
    expect(stateAt(moved, 'w', 4)).toMatchObject({ state: 'moved out on line 3', tone: 'gone' });
  });

  test('counts several borrows of each kind and keeps the exclusive tone', () => {
    expect(stateAt(moved, 'w', 5)).toMatchObject({ state: 'moved out on line 3, then 2 &mut borrows and 2 shared borrows', tone: 'borrow_mut' });
  });

  test('is out of scope when nothing covers the line and nothing starts later', () => {
    const borrowOnly = snippet([span('x', 'borrow', 1, 1)]);
    expect(stateAt(borrowOnly, 'x', 2)).toEqual({ variable: 'x', state: 'out of scope', tone: 'absent', details: [] });
  });

  test('marks the live conflict only on the line where it breaks the rule', () => {
    const s = snippet([span('c', 'moved', 1, 2), span('c', 'borrow', 4, 4)], [{ spans: [0, 1] }]);
    expect(stateAt(s, 'c', 2).tone).toBe('owned');
    expect(stateAt(s, 'c', 4)).toMatchObject({ state: 'moved out on line 2, then & borrowed', tone: 'conflict' });
  });

  test('describes a use after move in real content as a conflict', () => {
    const st = stateAt(byId('move-on-assign'), 'customer', 5);
    expect(st.tone).toBe('conflict');
    expect(st.state).toMatch(/^moved out on line 3, then/);
  });

  test('compiling snippets never report a live conflict', () => {
    for (const s of borrowSnippets.filter((x) => x.conflicts.length === 0)) {
      const n = s.code.split('\n').length;
      for (let line = 1; line <= n; line++) {
        for (const v of new Set(s.spans.map((sp) => sp.variable))) {
          expect(stateAt(s, v, line).tone, `${s.id} ${v} line ${line}`).not.toBe('conflict');
        }
      }
    }
  });
});
