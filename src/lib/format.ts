import type { Language } from './highlight.ts';

/** Pane frames tell the languages apart without relying on colour:
 *  dashed for C# (managed), solid and heavier for Rust, thin for config/shell. */
export function frameClass(language: Language) {
  switch (language) {
    case 'csharp':
      return 'border border-dashed border-rule-strong';
    case 'rust':
      return 'border-2 border-solid border-rule-strong';
    default:
      return 'border border-solid border-rule';
  }
}

/** [7, 8, 9, 12] → "7–9, 12" */
export function formatLines(ns: number[]): string {
  const sorted = [...new Set(ns)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start}` : `${start}–${sorted[i]}`);
  }
  return parts.join(', ');
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Lowercase, strip markdown-ish punctuation, for search matching. */
export function normaliseForSearch(s: string) {
  return s.toLowerCase().replace(/[`*]/g, '');
}

/** Deterministic shuffle of [0..n): same seed, same order, on every load.
 *  Used so a drill's correct answer is not always in the same position. */
export function seededOrder(n: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
