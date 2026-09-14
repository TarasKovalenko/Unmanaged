import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const mutateWhileIterating: BorrowSnippet = {
  id: 'mutate-while-iterating',
  title: 'Modifying a collection inside foreach',
  summary: 'The bug C# catches at runtime with InvalidOperationException, caught at compile time.',
  pairedWith: 'collect-then-extend',
  variables: ['orders'],
  code: code`
    fn main() {
        let mut orders = vec![100, 250, 75];
        for amount in &orders {
            if *amount > 200 {
                orders.push(amount / 2);
            }
        }
    }
  `,
  spans: [
    { variable: 'orders', kind: 'dropped', startLine: 2, endLine: 8, label: 'owns the Vec' },
    { variable: 'orders', kind: 'borrow', startLine: 3, endLine: 7, label: 'the for loop holds &orders for every iteration' },
    { variable: 'orders', kind: 'borrow_mut', startLine: 5, endLine: 5, label: 'push needs &mut orders' },
  ],
  conflicts: [
    {
      spans: [1, 2],
      errorCode: 'E0502',
      message: `error[E0502]: cannot borrow \`orders\` as mutable because it is also borrowed as immutable
 --> src/main.rs:5:13
  |
3 |     for amount in &orders {
  |                   -------
  |                   |
  |                   immutable borrow occurs here
  |                   immutable borrow later used here
4 |         if *amount > 200 {
5 |             orders.push(amount / 2);
  |             ^^^^^^^^^^^^^^^^^^^^^^^ mutable borrow occurs here`,
      explanation:
        '`List<T>` has a version counter; its enumerator checks it on every `MoveNext` and throws when you have added an item. That is a runtime guard for exactly this rule. Rust enforces it statically for every type: while the loop holds a shared borrow, nobody can take a mutable one. `push` might reallocate the buffer the iterator is walking, and there is no GC to keep the old one alive.',
    },
  ],
  csharpEquivalent: code`
    var orders = new List<int> { 100, 250, 75 };
    foreach (var amount in orders)
    {
        if (amount > 200)
            orders.Add(amount / 2);
    }
  `,
  csharpNote: 'Compiles. Throws InvalidOperationException ("Collection was modified; enumeration operation may not execute") on the next iteration.',
};
