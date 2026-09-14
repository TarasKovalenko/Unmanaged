import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const typesAndTraits: Lesson = {
  id: 'err-types-and-traits',
  title: 'E0308, E0277, E0599: types and traits',
  summary: 'Mismatched types, unsatisfied trait bounds, and methods that exist but are not in scope. Where "expected" comes from, and how to follow "required by a bound in".',
  intro: [
    'These are the errors that feel most like home. E0308 is CS0029 ("Cannot implicitly convert type") and CS1503 ("cannot convert from"). E0599 is CS1061 ("does not contain a definition for"), including the "are you missing a using directive" variant you know from LINQ.',
    'The differences are in the details. Rust has almost no implicit conversions, so E0308 fires where C# would quietly widen or box. Traits are how Rust expresses capabilities that C# gets from `object` for free (`Equals`, `GetHashCode`, `ToString`), so E0277 fires where C# would compile and then behave wrongly at runtime.',
  ],
  csharp: {
    filename: 'RegionReport.cs',
    code: code`
      public sealed record Region(string Code);
      public sealed record Sale(Region Region, long AmountCents);

      public static class RegionReport
      {
          public static Dictionary<Region, long> Totals(IEnumerable<Sale> sales) =>
              sales.GroupBy(s => s.Region)
                   .ToDictionary(g => g.Key, g => g.Sum(s => s.AmountCents));

          public static string Render(Dictionary<Region, long> totals)
          {
              var sb = new StringBuilder();
              foreach (var (region, cents) in totals.OrderBy(kv => kv.Key.Code))
                  sb.AppendLine($"{region.Code}: {cents}");
              return sb.ToString();
          }
      }
    `,
  },
  rust: {
    filename: 'region_report.rs',
    stdout: 'EU: 6800\nUS: 1900\n',
    code: code`
      use std::collections::BTreeMap;
      use std::fmt::Write;

      #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
      struct Region(String);

      struct Sale {
          region: Region,
          amount_cents: i64,
      }

      fn totals(sales: &[Sale]) -> BTreeMap<Region, i64> {
          let mut totals = BTreeMap::new();
          for sale in sales {
              *totals.entry(sale.region.clone()).or_insert(0) += sale.amount_cents;
          }
          totals
      }

      fn render(totals: &BTreeMap<Region, i64>) -> String {
          let mut out = String::new();
          for (region, cents) in totals {
              writeln!(out, "{}: {cents}", region.0).unwrap();
          }
          out
      }

      fn main() {
          let eu = Region(String::from("EU"));
          let sales = [
              Sale { region: eu.clone(), amount_cents: 4_900 },
              Sale { region: Region(String::from("US")), amount_cents: 1_900 },
              Sale { region: eu, amount_cents: 1_900 },
          ];
          print!("{}", render(&totals(&sales)));
      }
    `,
  },
  links: [
    {
      csharp: [1],
      rust: [4, 5],
      note: 'A C# `record` generates equality, hashing and `ToString`. In Rust each capability is a trait you derive. Leave out `Ord` and the `entry` call on line 15 is E0277 ("required by a bound in `BTreeMap::<K, V, A>::entry`"); leave out `Clone` and the `.clone()` on the same line is E0599.',
    },
    {
      csharp: [6, 7, 8],
      rust: lines(12, 18),
      note: '`GroupBy` + `ToDictionary` becomes an explicit loop over `entry`. `BTreeMap` keeps keys sorted, which replaces the `OrderBy` and makes output deterministic.',
    },
    {
      csharp: [12, 14],
      rust: [2, 21, 23],
      note: '`writeln!` into a `String` needs `std::fmt::Write` in scope. Without the `use` on line 2 it is E0599, "cannot write into `String`", the Rust version of a missing `using System.Text`.',
    },
    {
      csharp: [10],
      rust: [20],
      note: '`&BTreeMap`, not `BTreeMap`: passing the map by value where a reference is expected, or the reverse, is the most common E0308 in real code (`render(totals(&sales))` gives "expected `&BTreeMap<Region, i64>`, found `BTreeMap<Region, i64>`").',
    },
    {
      csharp: [15],
      rust: [25],
      note: 'The tail expression `out` without a semicolon is the return value. Add `;` and the function returns `()`, which is E0308.',
    },
  ],
  breaks: [
    {
      heading: 'A stray semicolon turns the return value into `()`',
      body: [
        'In C#, a missing `return` is CS0161 ("not all code paths return a value"). In Rust the last expression is the return value, and `total;` is a statement that evaluates to nothing. rustc reports E0308, "expected `i64`, found `()`", puts the `^^^` on the return type, and labels the function "implicitly returns `()` as its body has no tail or `return` expression".',
        'The `help:` at the bottom points at the actual character: "remove this semicolon to return this value". When an E0308 mentions `()` and you did not write `()`, look for a semicolon.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Line {
              amount_cents: i64,
          }

          fn subtotal(lines: &[Line]) -> i64 {
              let mut total = 0;
              for line in lines {
                  total += line.amount_cents;
              }
              total;
          }

          fn main() {
              println!("{}", subtotal(&[Line { amount_cents: 4_900 }]));
          }
        `,
      },
    },
    {
      heading: '"expected" comes from a declaration; "found" comes from your expression',
      body: [
        'The `---` label "expected due to this" points at whatever set the expectation: here the `u16` annotation. The `^^^` is the expression whose type disagrees, `Option<u16>`. Change whichever side is wrong, which is not always the expression.',
        '`int? port = ...; int p = port;` is CS0266 in C#, and `(int)port` throws `InvalidOperationException` when null. Rust offers `.expect(...)`, the panicking equivalent. Before accepting that `help:`, decide what should happen when the port is missing; `unwrap_or(8080)` or `?` is usually what production code wants.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn configured_port(raw: Option<&str>) -> Option<u16> {
              raw.and_then(|p| p.parse().ok())
          }

          fn main() {
              let port: u16 = configured_port(Some("8080"));
              println!("listening on {port}");
          }
        `,
      },
    },
    {
      heading: 'No implicit widening: three errors, one missing cast',
      body: [
        'C# widens `int * long` to `long` silently. Rust reports three errors for one expression: two E0308 ("expected `u32`, found `i64`", then "expected `i64`, found `u32`") and an E0277, "cannot multiply `u32` by `i64`", with a list of the `Mul` implementations that do exist.',
        'This is the "fix the first error" rule and the "distrust `help:`" rule at once. The second error suggests `(quantity * unit_price_cents).into()`, which converts the result of a multiplication that is itself invalid. The fix is at the first `^^^`: `i64::from(quantity) * unit_price_cents`.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn main() {
              let quantity: u32 = 3;
              let unit_price_cents: i64 = 4_900;
              let total: i64 = quantity * unit_price_cents;
              println!("{total}");
          }
        `,
      },
    },
    {
      heading: 'E0277 in `main`: `?` needs a function that can return an error',
      body: [
        'Every C# method can throw. A Rust function can only propagate an error with `?` if its return type can carry one. The error is phrased as a trait bound ("the `?` operator can only be used in a function that returns `Result` or `Option` (or another type that implements `FromResidual`)") and the `---` label is on `fn main()`, the declaration that has to change.',
        'For E0277 in general, look for `note: required by a bound in`. It names the function or impl that demanded the trait and quotes the bound, often a `where` clause in the standard library. That note is the answer to "why does this need `Hash`/`Send`/`Ord`?". Track 2 covers `?` and `Result` in main.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::fs;

          fn main() {
              let config = fs::read_to_string("appsettings.json")?;
              println!("{} bytes of config", config.len());
          }
        `,
      },
    },
    {
      heading: 'E0599 has two causes: trait not in scope, or trait not implemented',
      body: [
        'Read the `help:` line to tell them apart. "items from traits can only be used if the trait is in scope" plus an import suggestion means the impl exists and you need a `use`, exactly like LINQ without `using System.Linq`. "items from traits can only be used if the trait is implemented and in scope" plus "perhaps you need to implement it: candidate #1: `Clone`" means nothing implements it yet.',
        'For a C# developer the second case is the surprise: `MemberwiseClone`, `Equals` and `ToString` exist on every object, so "no method `clone`" sounds broken. In Rust a type has only the capabilities it derives or implements. Add `#[derive(Clone)]` and ask whether you needed the copy.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct PriceList {
              currency: String,
              prices: Vec<i64>,
          }

          fn main() {
              let current = PriceList { currency: String::from("EUR"), prices: vec![4_900, 1_900] };
              let snapshot = current.clone();
              println!("{} {:?} {}", snapshot.currency, snapshot.prices, current.prices.len());
          }
        `,
      },
    },
  ],
  visualize: [],
  drills: ['err-e0308', 'err-e0277', 'err-e0599'],
  takeaways: [
    'E0308: "expected" is set by a declaration, "found" by your expression. `()` usually means a stray semicolon.',
    'E0277: follow "required by a bound in" to the code that demanded the trait.',
    'E0599: "in scope" means add a `use`; "implemented and in scope" means derive or implement it.',
  ],
};
