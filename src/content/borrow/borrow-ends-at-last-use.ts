import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const borrowEndsAtLastUse: BorrowSnippet = {
  id: 'borrow-ends-at-last-use',
  title: 'Borrows end at last use',
  summary: 'Swap two lines and the same code compiles. A borrow lasts until its last use, not until the closing brace.',
  pairedWith: 'reference-into-growing-vec',
  variables: ['queue'],
  code: code`
    fn main() {
        let mut queue = vec![String::from("build"), String::from("test")];
        let next = &queue[0];
        println!("next up: {next}");
        queue.push(String::from("deploy"));
        println!("{} jobs queued", queue.len());
    }
  `,
  spans: [
    { variable: 'queue', kind: 'dropped', startLine: 2, endLine: 7, label: 'owns the Vec' },
    { variable: 'queue', kind: 'borrow', startLine: 3, endLine: 4, label: 'next borrows queue; its last use is line 4' },
    { variable: 'queue', kind: 'borrow_mut', startLine: 5, endLine: 5, label: 'push: no shared borrow is alive any more' },
    { variable: 'queue', kind: 'borrow', startLine: 6, endLine: 6, label: 'len() borrows queue' },
  ],
  conflicts: [],
  takeaway:
    '`next` is still in scope on line 6, but its borrow is not. The checker works on uses, not scopes ("non-lexical lifetimes"). A surprising number of borrow errors are fixed by reordering, with no clone and no restructuring.',
};
