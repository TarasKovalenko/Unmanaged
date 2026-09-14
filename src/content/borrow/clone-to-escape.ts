import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const cloneToEscape: BorrowSnippet = {
  id: 'clone-to-escape',
  title: 'Cloning your way out',
  summary: 'The reflexive fix for E0502. It compiles. Check what it cost and what it changed.',
  pairedWith: 'reference-into-growing-vec',
  variables: ['queue', 'next'],
  code: code`
    fn main() {
        let mut queue = vec![String::from("build"), String::from("test")];
        let next = queue[0].clone();
        queue.push(String::from("deploy"));
        println!("next up: {next}");
    }
  `,
  spans: [
    { variable: 'queue', kind: 'dropped', startLine: 2, endLine: 6, label: 'owns the Vec' },
    { variable: 'queue', kind: 'borrow', startLine: 3, endLine: 3, label: 'clone() borrows queue[0] only long enough to copy it' },
    { variable: 'queue', kind: 'borrow_mut', startLine: 4, endLine: 4, label: 'push: nothing else is borrowing queue' },
    { variable: 'next', kind: 'dropped', startLine: 3, endLine: 6, label: 'a new heap allocation with its own owner' },
  ],
  conflicts: [],
  takeaway:
    'Legitimate here: "build" is tiny and `next` really is meant to be a snapshot. It becomes a smell when the clone exists only to quiet the checker: in a loop, on large data, or when later code assumes `next` still reflects the queue. Compare with the reordering fix in "Borrows end at last use", which costs nothing.',
};
