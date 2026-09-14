// Pure layout and state logic for the borrow visualizer. No React here.

import type { BorrowSnippet, Span, SpanKind } from '../content/types.ts';

export const OWNER_KINDS: ReadonlySet<SpanKind> = new Set(['owned', 'moved', 'dropped']);
export const isOwner = (s: Span) => OWNER_KINDS.has(s.kind);

export interface PlacedSpan {
  index: number;
  span: Span;
  lane: number;
  /** Starts or ends at the middle of its row, because another ownership span
   *  in the same lane hands over on that line (e.g. reassignment). */
  startsMid: boolean;
  endsMid: boolean;
}

export interface TrackLayout {
  variable: string;
  lanes: number;
  placed: PlacedSpan[];
}

function assignLanes(items: { index: number; span: Span }[], touchingOverlaps: boolean) {
  const laneEnds: number[] = [];
  return items
    .sort((a, b) => a.span.startLine - b.span.startLine || b.span.endLine - a.span.endLine)
    .map((item) => {
      let lane = laneEnds.findIndex((end) => (touchingOverlaps ? end < item.span.startLine : end <= item.span.startLine));
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.span.endLine);
      } else {
        laneEnds[lane] = item.span.endLine;
      }
      return { ...item, lane };
    });
}

export function layoutTracks(snippet: BorrowSnippet): TrackLayout[] {
  const order = snippet.variables ?? [...new Set(snippet.spans.map((s) => s.variable))];
  return order.map((variable) => {
    const mine = snippet.spans.map((span, index) => ({ span, index })).filter((x) => x.span.variable === variable);

    // Ownership bars may hand over on the same line; borrows get their own lanes.
    const owners = assignLanes(mine.filter((x) => isOwner(x.span)), false);
    const ownerLanes = owners.reduce((n, o) => Math.max(n, o.lane + 1), 0);
    const borrows = assignLanes(mine.filter((x) => !isOwner(x.span)), true).map((b) => ({ ...b, lane: b.lane + ownerLanes }));

    const placed: PlacedSpan[] = [...owners, ...borrows].map((p) => ({ ...p, startsMid: false, endsMid: false }));
    for (const a of placed) {
      if (!isOwner(a.span)) continue;
      for (const b of placed) {
        if (a === b || !isOwner(b.span) || a.lane !== b.lane) continue;
        if (a.span.endLine === b.span.startLine) {
          a.endsMid = true;
          b.startsMid = true;
        }
      }
    }
    const lanes = placed.reduce((n, p) => Math.max(n, p.lane + 1), 0);
    return { variable, lanes: Math.max(lanes, 1), placed };
  });
}

/** Span indices involved in any conflict. */
export function conflictingSpans(snippet: BorrowSnippet): Set<number> {
  return new Set(snippet.conflicts.flatMap((c) => c.spans));
}

/** A conflict is "live" on the lines of whichever of its two spans starts
 *  later: that is the use that breaks the rule. */
export function conflictsAtLine(snippet: BorrowSnippet, line: number): number[] {
  return snippet.conflicts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => {
      const [a, b] = c.spans.map((idx) => snippet.spans[idx]);
      const later = a.startLine >= b.startLine ? a : b;
      return line >= later.startLine && line <= later.endLine;
    })
    .map(({ i }) => i);
}

export type VariableState = {
  variable: string;
  /** Short state, e.g. "owned", "moved out on line 3". */
  state: string;
  tone: 'owned' | 'borrow' | 'borrow_mut' | 'gone' | 'absent' | 'conflict';
  details: string[];
};

export function stateAt(snippet: BorrowSnippet, variable: string, line: number): VariableState {
  const conflicted = conflictingSpans(snippet);
  const live = new Set(conflictsAtLine(snippet, line).flatMap((i) => snippet.conflicts[i].spans));
  const mine = snippet.spans.map((span, index) => ({ span, index })).filter((x) => x.span.variable === variable);
  const covering = mine.filter((x) => line >= x.span.startLine && line <= x.span.endLine);
  const details = covering.map((x) => x.span.label).filter((l): l is string => Boolean(l));

  const ownerHere = covering.find((x) => isOwner(x.span));
  const shared = covering.filter((x) => x.span.kind === 'borrow');
  const exclusive = covering.filter((x) => x.span.kind === 'borrow_mut');
  const inConflict = covering.some((x) => conflicted.has(x.index) && live.has(x.index));

  let state: string;
  let tone: VariableState['tone'];
  if (ownerHere) {
    const { kind, endLine } = ownerHere.span;
    const handover = covering.some((x) => x !== ownerHere && isOwner(x.span) && x.span.startLine === line);
    if (handover) state = 'old value dropped, new value owned';
    else if (kind === 'moved' && endLine === line) state = 'moved away on this line';
    else if (kind === 'dropped' && endLine === line) state = 'dropped on this line';
    else state = 'owned';
    tone = 'owned';
  } else {
    const before = mine.filter((x) => isOwner(x.span) && x.span.endLine < line).sort((a, b) => b.span.endLine - a.span.endLine)[0];
    if (before) {
      state = before.span.kind === 'moved' ? `moved out on line ${before.span.endLine}` : `dropped on line ${before.span.endLine}`;
      tone = 'gone';
    } else if (mine.some((x) => x.span.startLine > line)) {
      state = 'not declared yet';
      tone = 'absent';
    } else {
      state = 'out of scope';
      tone = 'absent';
    }
  }

  const ownerGone = tone === 'gone';
  const borrowParts: string[] = [];
  if (exclusive.length) {
    borrowParts.push(exclusive.length > 1 ? `${exclusive.length} &mut borrows` : '&mut borrowed');
    tone = 'borrow_mut';
  }
  if (shared.length) {
    borrowParts.push(shared.length > 1 ? `${shared.length} shared borrows` : '& borrowed');
    if (tone !== 'borrow_mut') tone = 'borrow';
  }
  // "moved out on line 3, then & borrowed" reads as the violation it is.
  if (borrowParts.length) state = `${state}${ownerGone ? ', then' : ','} ${borrowParts.join(' and ')}`;
  if (inConflict) tone = 'conflict';

  return { variable, state, tone, details };
}
