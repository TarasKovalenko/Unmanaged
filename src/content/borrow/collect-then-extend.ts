import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const collectThenExtend: BorrowSnippet = {
  id: 'collect-then-extend',
  title: 'Read first, then write',
  summary: 'Finish the shared borrow, then take the mutable one. The borrows never overlap.',
  pairedWith: 'mutate-while-iterating',
  variables: ['orders', 'splits'],
  code: code`
    fn main() {
        let mut orders = vec![100, 250, 75];
        let splits: Vec<i32> = orders
            .iter()
            .filter(|amount| **amount > 200)
            .map(|amount| amount / 2)
            .collect();
        orders.extend(splits);
        println!("{orders:?}");
    }
  `,
  spans: [
    { variable: 'orders', kind: 'dropped', startLine: 2, endLine: 10, label: 'owns the Vec' },
    { variable: 'orders', kind: 'borrow', startLine: 3, endLine: 7, label: 'iter() borrows orders until collect() finishes' },
    { variable: 'orders', kind: 'borrow_mut', startLine: 8, endLine: 8, label: 'extend needs &mut orders; the shared borrow already ended' },
    { variable: 'orders', kind: 'borrow', startLine: 9, endLine: 9, label: 'println! borrows orders' },
    { variable: 'splits', kind: 'moved', startLine: 3, endLine: 8, label: 'owned Vec, moved into extend on line 8' },
  ],
  conflicts: [],
  takeaway:
    'Same shape as `var splits = orders.Where(...).Select(...).ToList(); orders.AddRange(splits);`. The difference: in Rust, `collect()` is what ends the borrow. Drop it and try to `extend` from the lazy iterator directly, and you are back to E0502.',
};
