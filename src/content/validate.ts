import type { Content } from './index.ts';
import type { CheckedCode, Expect } from './types.ts';

const KINDS = new Set(['owned', 'borrow', 'borrow_mut', 'moved', 'dropped']);
const TIMELINE_KINDS = new Set(['running', 'waiting', 'inert', 'blocked', 'done', 'dropped']);

/** Checks that don't need a compiler. Used by scripts/check-content.ts and
 *  run once in development builds so authoring mistakes show in the console. */
export function structuralProblems(c: Content): string[] {
  const out: string[] = [];
  const lineCount = (s: string) => s.split('\n').length;

  const snippetIds = new Set<string>();
  const lessonIds = new Set<string>();
  const drillIds = new Set<string>();
  const gotchaIds = new Set<string>();
  const timelineIds = new Set<string>();
  const trackIds = new Set(c.tracks.map((t) => t.id));

  const unique = (set: Set<string>, id: string, where: string) => {
    if (set.has(id)) out.push(`${where}: duplicate id`);
    set.add(id);
  };
  const checkExpect = (where: string, expect: Expect | undefined, reason: string | undefined) => {
    if (expect === 'unchecked' && !reason?.trim()) out.push(`${where}: expect 'unchecked' needs uncheckedReason`);
  };
  const checkCode = (where: string, code: CheckedCode | undefined) => {
    if (!code) return;
    if (code.language === 'rust' && !code.expect) out.push(`${where}: Rust code needs expect`);
    if (code.language !== 'rust' && code.expect) out.push(`${where}: only Rust code can have expect`);
    checkExpect(where, code.expect, code.uncheckedReason);
    if (code.stdout !== undefined && code.expect !== 'compiles') out.push(`${where}: stdout requires expect 'compiles'`);
  };

  // Borrow snippets ---------------------------------------------------------
  for (const s of c.snippets) {
    const where = `borrow/${s.id}`;
    unique(snippetIds, s.id, where);
    const n = lineCount(s.code);
    s.spans.forEach((span, i) => {
      const at = `${where} spans[${i}]`;
      if (!KINDS.has(span.kind)) out.push(`${at}: unknown kind "${span.kind}"`);
      if (span.startLine < 1 || span.endLine > n) out.push(`${at}: lines ${span.startLine}-${span.endLine} outside 1-${n}`);
      if (span.startLine > span.endLine) out.push(`${at}: startLine after endLine`);
      if (s.variables && !s.variables.includes(span.variable)) out.push(`${at}: variable "${span.variable}" missing from variables[]`);
      if (span.checked === 'runtime' && span.kind !== 'borrow' && span.kind !== 'borrow_mut') {
        out.push(`${at}: checked 'runtime' only applies to borrows`);
      }
    });
    const phases = new Set(s.conflicts.map((x) => x.phase ?? 'compile'));
    if (phases.size > 1) out.push(`${where}: mixing compile and runtime conflicts in one snippet is not supported`);
    s.conflicts.forEach((conflict, i) => {
      const at = `${where} conflicts[${i}]`;
      for (const idx of conflict.spans) if (!s.spans[idx]) out.push(`${at}: span index ${idx} does not exist`);
      if (conflict.spans[0] === conflict.spans[1]) out.push(`${at}: both span indices are ${conflict.spans[0]}`);
      if (conflict.phase === 'runtime') {
        if (conflict.errorCode !== 'panic') out.push(`${at}: runtime conflicts use errorCode "panic"`);
        if (!conflict.message.includes('panicked at')) out.push(`${at}: runtime message must be verbatim panic output`);
      } else {
        if (!/^E\d{4}$/.test(conflict.errorCode)) out.push(`${at}: errorCode "${conflict.errorCode}" is not E####`);
        if (!conflict.message.includes(`error[${conflict.errorCode}]`)) out.push(`${at}: message does not contain error[${conflict.errorCode}]`);
      }
      if (!conflict.explanation.trim()) out.push(`${at}: explanation is empty`);
    });
    if (s.conflicts.length === 0 && !s.takeaway) out.push(`${where}: snippets without conflicts need a takeaway`);
  }
  for (const s of c.snippets) {
    if (s.pairedWith && !snippetIds.has(s.pairedWith)) out.push(`borrow/${s.id}: pairedWith "${s.pairedWith}" does not exist`);
  }

  // Timelines ---------------------------------------------------------------
  for (const t of c.timelines) {
    const where = `timeline/${t.id}`;
    unique(timelineIds, t.id, where);
    if (t.tickNotes && t.tickNotes.length !== t.ticks) out.push(`${where}: tickNotes has ${t.tickNotes.length} entries, ticks is ${t.ticks}`);
    for (const side of ['csharp', 'rust'] as const) {
      const sd = t[side];
      const n = lineCount(sd.code);
      if (sd.lineAtTick.length !== t.ticks) out.push(`${where} ${side}: lineAtTick has ${sd.lineAtTick.length} entries, ticks is ${t.ticks}`);
      sd.lineAtTick.forEach((l, i) => {
        if (l < 0 || l > n) out.push(`${where} ${side}: lineAtTick[${i}] = ${l} outside 0-${n}`);
      });
      sd.events.forEach((e, i) => {
        const at = `${where} ${side} events[${i}]`;
        if (!TIMELINE_KINDS.has(e.kind)) out.push(`${at}: unknown kind "${e.kind}"`);
        if (e.start < 0 || e.end >= t.ticks || e.start > e.end) out.push(`${at}: ticks ${e.start}-${e.end} outside 0-${t.ticks - 1}`);
      });
    }
    checkExpect(`${where} rust`, t.rust.expect, t.rust.uncheckedReason);
  }

  // Drills --------------------------------------------------------------------
  for (const d of c.drills) {
    const where = `drill/${d.id}`;
    unique(drillIds, d.id, where);
    if (!trackIds.has(d.track)) out.push(`${where}: track "${d.track}" does not exist`);
    if (d.options.length < 3 || d.options.length > 4) out.push(`${where}: needs 3 or 4 options`);
    if (d.options.filter((o) => o.correct).length !== 1) out.push(`${where}: exactly one option must be correct`);
    if (d.fixes.length < 2) out.push(`${where}: needs at least two fixes (idiomatic + a worse one)`);
    if (d.fixes[0]?.verdict !== 'idiomatic') out.push(`${where}: first fix must be idiomatic`);
    if (!d.fixes.some((f) => f.verdict !== 'idiomatic')) out.push(`${where}: needs at least one non-idiomatic fix`);
    if (d.outcome === 'panic') {
      if (d.errorCode !== 'panic') out.push(`${where}: panic drills use errorCode "panic"`);
      if (!d.message.includes('panicked at')) out.push(`${where}: message must be verbatim panic output`);
    } else if (!d.message.includes(`error[${d.errorCode}]`)) {
      out.push(`${where}: message does not contain error[${d.errorCode}]`);
    }
    d.fixes.forEach((f, i) => {
      const at = `${where} fixes[${i}]`;
      checkExpect(at, f.expect, f.uncheckedReason);
      if (f.verdict !== 'wrong' && f.expect !== 'compiles' && f.expect !== 'unchecked') {
        out.push(`${at}: ${f.verdict} fixes must compile`);
      }
    });
  }

  // Gotchas -------------------------------------------------------------------
  for (const g of c.gotchas) {
    const where = `gotcha/${g.id}`;
    unique(gotchaIds, g.id, where);
    if (g.tags.length === 0) out.push(`${where}: needs at least one tag`);
    if (g.expect === 'fails' && !g.errorCode) out.push(`${where}: expect 'fails' needs errorCode`);
    if (g.stdout !== undefined && g.expect !== 'compiles') out.push(`${where}: stdout requires expect 'compiles'`);
    checkExpect(where, g.expect, g.uncheckedReason);
  }

  // Tracks and lessons --------------------------------------------------------
  for (const t of c.tracks) {
    if (t.status === 'available' && t.lessons.length === 0) out.push(`track/${t.id}: available but has no lessons`);
    for (const l of t.lessons) {
      const where = `lesson/${l.id}`;
      unique(lessonIds, l.id, where);
      const cs = lineCount(l.csharp.code);
      const rs = lineCount(l.rust.code);
      if (l.breaks.length === 0) out.push(`${where}: beat 3 ("where the analogy breaks") is mandatory`);
      l.links.forEach((link, i) => {
        if (link.csharp.some((n) => n < 1 || n > cs)) out.push(`${where} links[${i}]: C# line outside 1-${cs}`);
        if (link.rust.some((n) => n < 1 || n > rs)) out.push(`${where} links[${i}]: Rust line outside 1-${rs}`);
      });
      checkExpect(`${where} rust`, l.rust.expect, l.rust.uncheckedReason);
      l.breaks.forEach((b, i) => checkCode(`${where} breaks[${i}]`, b.code));
      for (const v of l.visualize) if (!snippetIds.has(v)) out.push(`${where}: visualize "${v}" is not a snippet id`);
      for (const v of l.timelines ?? []) if (!timelineIds.has(v)) out.push(`${where}: timeline "${v}" does not exist`);
      for (const v of l.drills ?? []) if (!drillIds.has(v)) out.push(`${where}: drill "${v}" does not exist`);
    }
  }

  // Cross references ----------------------------------------------------------
  const exists = (kind: string, id: string) =>
    kind === 'lesson' ? lessonIds.has(id) : kind === 'drill' ? drillIds.has(id) : kind === 'gotcha' ? gotchaIds.has(id) : snippetIds.has(id);
  for (const g of c.gotchas) {
    if (g.seeAlso && !exists(g.seeAlso.kind, g.seeAlso.id)) out.push(`gotcha/${g.id}: seeAlso ${g.seeAlso.kind} "${g.seeAlso.id}" does not exist`);
  }
  const phraseIds = new Set<string>();
  for (const p of c.phrases) {
    unique(phraseIds, p.id, `phrase/${p.id}`);
    if (p.seeAlso && !exists(p.seeAlso.kind, p.seeAlso.id)) out.push(`phrase/${p.id}: seeAlso ${p.seeAlso.kind} "${p.seeAlso.id}" does not exist`);
  }

  // Machine-specific paths must never ship in authored compiler output.
  const leaky = /\/Users\/|\/home\/|\.rustup|\.cargo\/registry|[A-Z]:\\/;
  for (const s of c.snippets) s.conflicts.forEach((x, i) => leaky.test(x.message) && out.push(`borrow/${s.id} conflicts[${i}]: message contains a local filesystem path`));
  for (const d of c.drills) if (leaky.test(d.message)) out.push(`drill/${d.id}: message contains a local filesystem path`);

  // Projects ------------------------------------------------------------------
  const projectIds = new Set<string>();
  for (const p of c.projects) {
    const where = `project/${p.id}`;
    unique(projectIds, p.id, where);
    if (p.milestones.length === 0) out.push(`${where}: needs milestones`);
    for (const e of p.exercises) if (!trackIds.has(e)) out.push(`${where}: exercises unknown track "${e}"`);
    const ms = new Set<string>();
    p.milestones.forEach((m) => {
      unique(ms, m.id, `${where}/${m.id}`);
      checkCode(`${where}/${m.id}`, m.code);
    });
  }

  return out;
}
