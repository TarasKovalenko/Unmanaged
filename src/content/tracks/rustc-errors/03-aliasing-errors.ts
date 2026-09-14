import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const aliasingErrors: Lesson = {
  id: 'err-e0499-e0502-e0506',
  title: 'E0499, E0502, E0506: the aliasing family',
  summary: 'Two mutable borrows, shared plus mutable, assignment while borrowed. The "later used here" label points at the line that actually causes the conflict.',
  intro: [
    'When `List<T>` is modified during `foreach`, the stack trace for `InvalidOperationException: Collection was modified` points at `MoveNext`, which is the `foreach` line. The line that did the damage, the `Add`, is not in the trace at all. You learn to look elsewhere.',
    'rustc reports aliasing conflicts with three spans: where the first borrow started, where the conflicting access is (the `^^^`), and where the first borrow is **later used**. That last label is the one C# never gave you. It is usually the line to change.',
  ],
  csharp: {
    filename: 'BundleExpander.cs',
    code: code`
      public static class BundleExpander
      {
          public static void Expand(Order order, IBundleCatalog catalog)
          {
              foreach (var line in order.Lines)
              {
                  if (catalog.TryGetParts(line.Sku, out var parts))
                      order.Lines.AddRange(parts);
                      // InvalidOperationException on the next MoveNext,
                      // stack trace points at the foreach on line 5
              }
          }
      }
    `,
  },
  rust: {
    filename: 'bundle_expander.rs',
    stdout: '["KIT-01", "CABLE-9", "KB-01", "MS-02"]\n',
    code: code`
      use std::collections::HashMap;

      struct Order {
          lines: Vec<String>,
      }

      fn expand(order: &mut Order, catalog: &HashMap<&str, Vec<&str>>) {
          let parts: Vec<String> = order
              .lines
              .iter()
              .filter_map(|sku| catalog.get(sku.as_str()))
              .flatten()
              .map(|part| part.to_string())
              .collect();
          order.lines.extend(parts);
      }

      fn main() {
          let catalog = HashMap::from([("KIT-01", vec!["KB-01", "MS-02"])]);
          let mut order = Order { lines: vec![String::from("KIT-01"), String::from("CABLE-9")] };
          expand(&mut order, &catalog);
          println!("{:?}", order.lines);
      }
    `,
  },
  links: [
    {
      csharp: [5],
      rust: [8, 9, 10],
      note: 'The loop becomes an iterator over `&order.lines`. This shared borrow is alive until `collect()` returns on line 14.',
    },
    {
      csharp: [7],
      rust: [11, 12],
      note: '`TryGetParts` becomes `catalog.get`, and `flatten` turns "bundles with parts" into one stream of parts.',
    },
    {
      csharp: [8],
      rust: [15],
      note: 'The mutation happens after the read. Written inside the loop, this is E0502, with "immutable borrow later used here" on the `for` line: the iterator is used again on the next turn.',
    },
    {
      csharp: [9, 10],
      rust: lines(8, 14),
      note: 'C# reports the symptom at the enumerator. rustc reports all three places, so there is no stack trace to reverse-engineer.',
    },
    {
      csharp: [3],
      rust: [7],
      note: '`&mut Order` for the thing being changed, `&HashMap` for the thing only read. The signature states the aliasing contract C# leaves implicit.',
    },
  ],
  breaks: [
    {
      heading: 'Methods borrow all of `self`, so the conflict can be three lines away',
      body: [
        '`customer_name(&self)` returns a `&str` tied to the whole order. Two errors come out, both E0502, one per `add_line` call. Both have the same "immutable borrow later used here" label on the final `println!`. Two errors pointing at the same later use is the tell: the fix is on that line, not on the two `^^^` lines.',
        'Move the log up, or copy the name into a `String`, and both errors disappear together.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Order {
              customer: String,
              lines: Vec<String>,
          }

          impl Order {
              fn customer_name(&self) -> &str {
                  &self.customer
              }

              fn add_line(&mut self, sku: &str) {
                  self.lines.push(sku.to_string());
              }
          }

          fn main() {
              let mut order = Order { customer: String::from("Contoso"), lines: Vec::new() };
              let customer = order.customer_name();
              order.add_line("KB-01");
              order.add_line("MS-02");
              println!("{} lines", order.lines.len());
              println!("order for {customer}");
          }
        `,
      },
    },
    {
      heading: 'E0499 in a loop: one span carries two labels',
      body: [
        'When the first borrow is a loop iterator, rustc stacks "first mutable borrow occurs here" and "first borrow later used here" under the same expression, `order.lines.iter_mut()`. The iterator is used again every iteration, so the loop header is both the start and the later use.',
        'The C# version, calling an instance method that reads `DiscountPercent` while iterating `Lines`, is perfectly fine in .NET. Here `apply_discount(&mut self, ...)` asks for all of `order` while `lines` is lent out. Read the field before the loop (`let pct = order.discount_percent;`) or make the helper a free function that takes only what it needs.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Order {
              discount_percent: i64,
              lines: Vec<i64>,
          }

          impl Order {
              fn apply_discount(&mut self, amount_cents: &mut i64) {
                  *amount_cents -= *amount_cents * self.discount_percent / 100;
              }
          }

          fn main() {
              let mut order = Order { discount_percent: 10, lines: vec![4_900, 1_900] };
              for amount in order.lines.iter_mut() {
                  order.apply_discount(amount);
              }
              println!("{:?}", order.lines);
          }
        `,
      },
    },
    {
      heading: 'E0506: assignment is not repointing',
      body: [
        '"cannot assign to `token` because it is borrowed", with "`token` is assigned to here but it was already borrowed". In C#, `token = FetchToken(2)` repoints a variable, and `authHeader` still holds the old immutable string. In Rust, `token` is the storage: assignment drops the old `String` in place, and `auth_header` points into that storage.',
        'The standard fixes: finish using the borrow before assigning, take an owned copy, or use `std::mem::replace` to get the old value back as an owned value while putting the new one in.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn fetch_token(attempt: u32) -> String {
              format!("token-{attempt}")
          }

          fn main() {
              let mut token = fetch_token(1);
              let auth_header = token.as_str();
              token = fetch_token(2);
              println!("Authorization: Bearer {auth_header}");
              println!("next token: {token}");
          }
        `,
      },
    },
    {
      heading: 'No error does not mean no overlap on the page',
      body: [
        '`order_ids.push(order_ids.len() + 100)` looks like a `&mut` and a `&` on one line, and it compiles. The checker evaluates the argument before activating the mutable borrow ("two-phase borrows"). Likewise a borrow that is never used again has already ended, however far away its closing brace is.',
        'This matters for reading errors: rustc is precise about **when** borrows are alive, not merely where they are written. If an error seems to name a borrow that "should be finished", trust the "later used here" label; there is a later use you have not noticed, often inside a `println!` or a loop header.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: '[100, 101, 102]\n',
        code: code`
          fn main() {
              let mut order_ids: Vec<usize> = vec![100, 101];
              order_ids.push(order_ids.len() + 100);
              println!("{order_ids:?}");
          }
        `,
      },
    },
  ],
  visualize: ['mutate-while-iterating', 'two-mutable-borrows', 'assign-while-borrowed', 'borrow-ends-at-last-use'],
  drills: ['own-e0499', 'own-e0502', 'own-e0506'],
  takeaways: [
    'Read "later used here" first. That line is what keeps the first borrow alive, and moving or changing it is usually the fix.',
    'Several errors sharing one "later used here" have one fix.',
    'Assignment in Rust replaces the value in place, so it conflicts with any live reference to it.',
  ],
};
