import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const copyTypes: BorrowSnippet = {
  id: 'copy-types',
  title: 'Copy types copy, everything else moves',
  summary: 'A `Copy` struct behaves like a C# value type on assignment. A `String` never can.',
  variables: ['price', 'discounted', 'sku', 'label'],
  code: code`
    #[derive(Clone, Copy, Debug)]
    struct Money {
        cents: i64,
    }

    fn main() {
        let price = Money { cents: 1_999 };
        let discounted = price;
        println!("{price:?} -> {discounted:?}");

        let sku = String::from("SKU-4471");
        let label = sku.clone();
        println!("{sku} / {label}");
    }
  `,
  spans: [
    { variable: 'price', kind: 'dropped', startLine: 7, endLine: 14, label: 'Money is Copy: line 8 duplicates the bits, nothing moves' },
    { variable: 'price', kind: 'borrow', startLine: 9, endLine: 9, label: 'still usable after the "move"' },
    { variable: 'discounted', kind: 'dropped', startLine: 8, endLine: 14, label: 'an independent copy of price' },
    { variable: 'sku', kind: 'dropped', startLine: 11, endLine: 14, label: 'String owns heap memory, so it cannot be Copy' },
    { variable: 'sku', kind: 'borrow', startLine: 12, endLine: 12, label: 'clone() borrows sku to allocate a deep copy' },
    { variable: 'sku', kind: 'borrow', startLine: 13, endLine: 13, label: 'println! borrows sku' },
    { variable: 'label', kind: 'dropped', startLine: 12, endLine: 14, label: 'separate allocation, separate owner' },
  ],
  conflicts: [],
  takeaway:
    'Whether assignment copies is not decided by a `struct`/`class` keyword. It is decided by whether the type implements `Copy`, and only types with no heap ownership and no `Drop` can. `clone()` is always explicit and always deep for `String`.',
};
