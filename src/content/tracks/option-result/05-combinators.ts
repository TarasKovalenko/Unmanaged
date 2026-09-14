import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const combinators: Lesson = {
  id: 'or-combinators',
  title: 'Combinators, and collecting results',
  summary: '`map`, `and_then` and `unwrap_or_else` replace `?.` and `??`. Collecting into `Result<Vec<_>, _>` stops at the first error, which is not `AggregateException`.',
  intro: [
    'C# has operators for the common null cases: `?.` to continue only if present, `??` for a fallback. For exceptions in a batch, the usual pattern is to collect them into a list and throw `AggregateException`.',
    '`Option` and `Result` do the same jobs with methods. They read like LINQ, because the shapes are the same: `map` is `Select`, `and_then` is `SelectMany`. The surprises are in evaluation order, in closures, and in how a batch of results collapses.',
  ],
  csharp: {
    filename: 'InvoiceBatch.cs',
    code: code`
      public static class InvoiceBatch
      {
          public static int? DiscountFor(Customer? customer) =>
              customer?.Loyalty?.DiscountPercent;

          public static string Label(string? region) =>
              region?.Trim().ToUpperInvariant() ?? "UNASSIGNED";

          public static List<Invoice> ParseAll(IEnumerable<string> rows)
          {
              var invoices = new List<Invoice>();
              var errors = new List<Exception>();
              foreach (var row in rows)
              {
                  try { invoices.Add(Invoice.Parse(row)); }
                  catch (FormatException ex) { errors.Add(ex); }
              }
              if (errors.Count > 0)
                  throw new AggregateException(errors);
              return invoices;
          }
      }
    `,
  },
  rust: {
    filename: 'invoice_batch.rs',
    stdout: code`
      Some(10) None
      EMEA UNASSIGNED
      Ok([Invoice { number: 1001, cents: 2500 }, Invoice { number: 1002, cents: 990 }])
      Err(ParseIntError { kind: InvalidDigit })
    `,
    code: code`
      use std::num::ParseIntError;

      struct Loyalty {
          discount_percent: Option<u8>,
      }

      struct Customer {
          loyalty: Option<Loyalty>,
      }

      #[derive(Debug)]
      struct Invoice {
          number: u32,
          cents: u64,
      }

      fn discount_for(customer: Option<&Customer>) -> Option<u8> {
          customer.and_then(|c| c.loyalty.as_ref()).and_then(|l| l.discount_percent)
      }

      fn label(region: Option<&str>) -> String {
          region.map(|r| r.trim().to_uppercase()).unwrap_or_else(|| String::from("UNASSIGNED"))
      }

      fn parse_invoice(row: &str) -> Result<Invoice, ParseIntError> {
          let (number, cents) = row.split_once(',').unwrap_or((row, ""));
          Ok(Invoice { number: number.parse()?, cents: cents.parse()? })
      }

      fn parse_all(rows: &[&str]) -> Result<Vec<Invoice>, ParseIntError> {
          rows.iter().map(|row| parse_invoice(row)).collect()
      }

      fn main() {
          let gold = Customer { loyalty: Some(Loyalty { discount_percent: Some(10) }) };
          println!("{:?} {:?}", discount_for(Some(&gold)), discount_for(None));
          println!("{} {}", label(Some(" emea ")), label(None));
          println!("{:?}", parse_all(&["1001,2500", "1002,990"]));
          println!("{:?}", parse_all(&["1001,2500", "oops,1", "1003,x"]));
      }
    `,
  },
  links: [
    {
      csharp: [3, 4],
      rust: lines(17, 19),
      note: 'Each `?.` becomes an `and_then`, because each step itself returns an `Option`. `as_ref` borrows the `Loyalty` inside the customer instead of trying to move it out. Inside a function returning `Option`, `customer?.loyalty.as_ref()?.discount_percent` also works and reads closer to C#.',
    },
    {
      csharp: [6, 7],
      rust: lines(21, 23),
      note: '`?.` on a step that cannot fail becomes `map`, and `??` becomes `unwrap_or_else`. The closure form matters when the fallback allocates, as `String::from` does: it runs only on `None`.',
    },
    {
      csharp: [15],
      rust: lines(25, 28),
      note: '`Invoice.Parse` throwing `FormatException` becomes a function returning `Result`. The `?` operators inside a struct literal are fine: each field expression can return early.',
    },
    {
      csharp: lines(9, 21),
      rust: lines(30, 32),
      note: 'The whole loop, both lists and the aggregate throw collapse into `collect()`. Because the return type is `Result<Vec<Invoice>, _>`, `collect` builds the vector while every item is `Ok`, and returns the first `Err` it meets.',
    },
    {
      csharp: [18, 19],
      rust: [39],
      note: 'The second batch has two bad rows, but only one error comes back, and `1003,x` is never parsed. That is the break from `AggregateException`: see the first break point for collecting every error.',
    },
  ],
  breaks: [
    {
      heading: '`collect::<Result<Vec<_>, _>>()` short-circuits. It is not `AggregateException`.',
      body: [
        'The C# loop parses every row and reports every failure. Collecting into `Result` stops at the first `Err` and drops the rest of the iterator unconsumed. That is right for "abort the import", and wrong for "show the user every invalid row".',
        'To keep both sides, `partition` the results and then unwrap each half. Nothing is lost, and the types say which half is which.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          parsed [1001]
          2 bad rows: ["oops,1: invalid digit found in string", "1003,x: invalid digit found in string"]
        `,
        code: code`
          fn parse_row(row: &str) -> Result<u32, String> {
              let (number, cents) = row.split_once(',').unwrap_or((row, ""));
              cents.parse::<u64>().map_err(|e| format!("{row}: {e}"))?;
              number.parse().map_err(|e| format!("{row}: {e}"))
          }

          fn main() {
              let rows = ["1001,2500", "oops,1", "1003,x"];
              let (ok, bad): (Vec<_>, Vec<_>) = rows.iter().map(|r| parse_row(r)).partition(Result::is_ok);
              let parsed: Vec<u32> = ok.into_iter().map(Result::unwrap).collect();
              let errors: Vec<String> = bad.into_iter().map(Result::unwrap_err).collect();
              println!("parsed {parsed:?}");
              println!("{} bad rows: {errors:?}", errors.len());
          }
        `,
      },
    },
    {
      heading: '`unwrap_or` evaluates its argument even when it is not needed',
      body: [
        '`??` is lazy: the right-hand side runs only when the left is null. `unwrap_or(x)` is a method call, so `x` is evaluated first, every time. With a constant that does not matter. With `load_default_region()` it is a database call on every request.',
        'Use `unwrap_or_else(|| ...)` when the fallback does work, and `unwrap_or_default()` when the fallback is `Default::default()`. Clippy\'s `or_fun_call` lint flags the eager version, but it sits in the `nursery` group, so you have to enable it.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          loading default region
          eager: EMEA
          lazy: EMEA
        `,
        code: code`
          fn load_default_region() -> String {
              println!("loading default region");
              String::from("APAC")
          }

          fn main() {
              let region = Some(String::from("EMEA"));
              println!("eager: {}", region.clone().unwrap_or(load_default_region()));
              println!("lazy: {}", region.unwrap_or_else(load_default_region));
          }
        `,
      },
    },
    {
      heading: '`map` where `and_then` was needed gives you `Option<Option<T>>`',
      body: [
        'In LINQ, `Select` with a lambda that returns a sequence gives `IEnumerable<IEnumerable<T>>`, and you reach for `SelectMany`. The same happens here. `customer.map(|c| c.loyalty.as_ref())` is `Option<Option<&Loyalty>>`, and the next step does not type-check.',
        'The rule: if the closure returns a plain value, `map`. If it returns an `Option` (or a `Result`), `and_then`. `.flatten()` repairs a nested option after the fact.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Loyalty {
              discount_percent: u8,
          }

          struct Customer {
              loyalty: Option<Loyalty>,
          }

          fn main() {
              let gold = Customer { loyalty: Some(Loyalty { discount_percent: 10 }) };
              let loyalty: Option<&Loyalty> = Some(&gold).map(|c| c.loyalty.as_ref());
              println!("{:?}", loyalty.map(|l| l.discount_percent));
          }
        `,
      },
    },
    {
      heading: '`?` inside a closure returns from the closure, not from your function',
      body: [
        'A `throw` inside a LINQ lambda escapes through `Select` and out of the enclosing method. `?` cannot do that: it returns from the innermost function body, which is the closure. If the closure is expected to return a plain value, as it is in `map(|row| row.parse::<u32>()?)`, rustc rejects the `?` with E0277.',
        'Either make the closure return `Result` and collect into `Result`, as `parse_all` does, or use a `for` loop, where `?` returns from the function as you expect. A loop with `?` is not less idiomatic than a chain; pick whichever reads better.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::num::ParseIntError;

          fn total_cents(rows: &[&str]) -> Result<u64, ParseIntError> {
              let cents: Vec<u64> = rows.iter().map(|row| row.parse::<u64>()?).collect();
              Ok(cents.iter().sum())
          }

          fn main() {
              println!("{:?}", total_cents(&["2500", "990"]));
          }
        `,
      },
    },
    {
      heading: '`Option` is also a collection of zero or one',
      body: [
        '`Nullable<T>` is not enumerable. `Option<T>` implements `IntoIterator`, so it plugs into iterator code directly: `flatten` drops the `None`s from an iterator of options, `filter_map` maps and filters in one pass, and `Vec::extend(opt)` appends only if present.',
        'This is often cleaner than `if let` when building up a list of optional parts, such as the lines of an address.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          1 Market St, Suite 400, San Francisco
          [2500, 990]
        `,
        code: code`
          fn main() {
              let line2: Option<&str> = Some("Suite 400");
              let county: Option<&str> = None;
              let mut parts = vec!["1 Market St"];
              parts.extend(line2);
              parts.extend(county);
              parts.push("San Francisco");
              println!("{}", parts.join(", "));

              let cents: Vec<u64> = ["2500", "n/a", "990"].iter().filter_map(|s| s.parse().ok()).collect();
              println!("{cents:?}");
          }
        `,
      },
    },
  ],
  visualize: [],
  drills: ['or-question-option-in-result'],
  takeaways: [
    '`map` for plain values, `and_then` for steps that can fail, `unwrap_or_else` for fallbacks that do work.',
    'Collecting into `Result<Vec<_>, _>` stops at the first error. Use `partition` to report all of them.',
    '`?` in a closure returns from the closure. When that gets in the way, write the loop.',
  ],
};
