import { code } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const aliasing: Lesson = {
  id: 'aliasing',
  title: 'Shared or mutable, never both',
  summary: 'Any number of `&T`, or exactly one `&mut T`. The rule behind E0499 and E0502.',
  intro: [
    'You already know one instance of this rule. Add to a `List<T>` inside `foreach` over that list and you get `InvalidOperationException: Collection was modified`. The enumerator keeps a version number and checks it at runtime, because mutating a collection while something reads it is a bug.',
    'Rust applies that rule to every value, at compile time: while anything holds a shared borrow, nothing may mutate; while something holds a mutable borrow, nothing else may even read.',
  ],
  csharp: {
    filename: 'PriceAdjuster.cs',
    code: code`
      public static class PriceAdjuster
      {
          public static void ApplySurcharges(List<decimal> prices)
          {
              foreach (var price in prices)
              {
                  if (price > 1000m)
                      prices.Add(price * 0.02m); // throws on next MoveNext
              }
          }
      }
    `,
  },
  rust: {
    filename: 'price_adjuster.rs',
    code: code`
      fn apply_surcharges(prices: &mut Vec<i64>) {
          let surcharges: Vec<i64> = prices
              .iter()
              .filter(|price| **price > 100_000)
              .map(|price| price * 2 / 100)
              .collect();
          prices.extend(surcharges);
      }

      fn main() {
          let mut prices = vec![150_000, 40_000];
          apply_surcharges(&mut prices);
          println!("{prices:?}");
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [1],
      note: '`List<decimal>` becomes `&mut Vec<i64>`, and the signature now says the function modifies it. Amounts are integer cents: there is no built-in decimal type in Rust.',
    },
    {
      csharp: [5, 6, 9],
      rust: [2, 3, 6],
      note: 'The loop becomes a read-only pass that finishes before anything mutates. The shared borrow taken by `iter()` ends when `collect()` returns.',
    },
    {
      csharp: [7],
      rust: [4],
      note: 'Same predicate. `**price` because `filter` hands the closure a reference to the iterator\'s item, which is itself a reference.',
    },
    {
      csharp: [8],
      rust: [5, 7],
      note: 'The mutation moves after the loop. The direct translation, `push` inside a `for` over `&prices`, is E0502. See the first visualizer below.',
    },
    {
      csharp: [3],
      rust: [11, 12],
      note: 'The caller creates the Vec with `let mut` and lends it with `&mut`. Both are required: mutation is always visible at the call site.',
    },
  ],
  breaks: [
    {
      heading: 'C# checks one collection type at runtime. Rust checks every value at compile time.',
      body: [
        '`List<T>`, `Dictionary<TKey, TValue>` and friends guard their enumerators with a version field. Your own classes get nothing: mutate an object while another method is halfway through reading it and you get inconsistent state, not an exception.',
        'Rust\'s rule has no runtime cost and no exceptions to it. It is also the rule that makes data races compile errors: two threads each holding `&mut` to the same value is just the two-mutable-borrows case with a thread boundary in between.',
      ],
    },
    {
      heading: 'Two different indices are still one borrow',
      body: [
        '`&mut accounts[0]` and `&mut accounts[1]` do not overlap. The checker does not look at index values: both calls go through `IndexMut`, which borrows the entire Vec mutably. You need `get_disjoint_mut`, `split_at_mut`, or a different structure.',
        'It feels pedantic until the indices come from a request body and are equal. C# would happily debit and credit the same account.',
      ],
    },
    {
      heading: 'Fields are tracked separately. Methods borrow all of `self`.',
      body: [
        'Borrowing `order.lines` mutably while holding `&order.customer` is fine: the compiler can see the fields are disjoint. Wrap each field in an accessor method and the same code fails, because `order.lines_mut()` borrows the whole order.',
        'The C# reflex to hide every field behind a property costs flexibility inside a Rust module. Private fields accessed directly within the module are normal and idiomatic.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          struct Order {
              customer: String,
              lines: Vec<String>,
          }

          fn main() {
              let mut order = Order { customer: String::from("Contoso"), lines: Vec::new() };
              let customer = &order.customer;
              let lines = &mut order.lines;
              lines.push(format!("gift wrap for {customer}"));
              println!("{}", order.lines.len());
          }
        `,
      },
    },
    {
      heading: 'Interior mutability moves the check back to runtime, on purpose',
      body: [
        '`Cell`, `RefCell`, `Mutex`, `RwLock` and the atomics let you mutate through a shared reference. They do not break the rule; they enforce it at runtime instead, exactly like the `List<T>` enumerator. `RefCell` panics where C# throws. That trade-off, and when it is the right one, is track 4.',
      ],
    },
  ],
  visualize: ['mutate-while-iterating', 'collect-then-extend', 'two-mutable-borrows', 'disjoint-mutable-borrows'],
  takeaways: [
    'Many `&T` or one `&mut T`, never both at once.',
    'Most E0502 fixes are "finish reading, then write".',
    'Indices do not make borrows disjoint. Fields do.',
  ],
};
