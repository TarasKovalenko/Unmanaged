import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const questionMark: Lesson = {
  id: 'or-question-mark',
  title: 'The ? operator is an early return',
  summary: '`?` returns the error from the current function, converting it with `From`. It does not catch, unwind or jump to a handler.',
  intro: [
    'Matching every `Result` by hand, as lesson 2 did, would be unbearable in a real parser. The `?` operator makes the happy path read like C# code that lets exceptions propagate: one call per line, no ceremony.',
    'The resemblance is only visual. `?` is sugar for "if this is `Err`, convert the error and `return` it right now". Each function in the chain returns normally, and every signature on the way up still says `Result`.',
  ],
  csharp: {
    filename: 'OrderImporter.cs',
    code: code`
      public sealed class OrderImporter
      {
          public static Order ParseLine(string line)
          {
              var parts = line.Split(',');
              if (parts.Length != 3)
                  throw new FormatException($"expected 3 fields: {line}");

              var id = int.Parse(parts[0]);
              var quantity = int.Parse(parts[1]);
              return new Order(id, parts[2].Trim(), quantity);
          }

          public static int Import(IEnumerable<string> lines, List<Order> orders)
          {
              foreach (var line in lines)
                  orders.Add(ParseLine(line)); // the first bad line unwinds out

              return orders.Count;
          }

          public static void Main()
          {
              var orders = new List<Order>();
              var count = Import(new[] { "1,3,SKU-9", "2,1,SKU-4" }, orders);
              Console.WriteLine($"imported {count}");
          }
      }
    `,
  },
  rust: {
    filename: 'order_importer.rs',
    stdout: code`
      imported 2
      Err(Number(ParseIntError { kind: InvalidDigit }))
    `,
    code: code`
      use std::num::ParseIntError;

      #[derive(Debug)]
      struct Order {
          id: u32,
          sku: String,
          quantity: u32,
      }

      #[derive(Debug)]
      enum ImportError {
          FieldCount(String),
          Number(ParseIntError),
      }

      impl From<ParseIntError> for ImportError {
          fn from(e: ParseIntError) -> Self {
              ImportError::Number(e)
          }
      }

      fn parse_line(line: &str) -> Result<Order, ImportError> {
          let parts: Vec<&str> = line.split(',').collect();
          let [id, quantity, sku] = parts[..] else {
              return Err(ImportError::FieldCount(line.to_string()));
          };
          let id = id.parse()?;
          let quantity = quantity.parse()?;
          Ok(Order { id, sku: sku.trim().to_string(), quantity })
      }

      fn import(lines: &[&str], orders: &mut Vec<Order>) -> Result<usize, ImportError> {
          for line in lines {
              orders.push(parse_line(line)?);
          }
          Ok(orders.len())
      }

      fn main() -> Result<(), ImportError> {
          let mut orders = Vec::new();
          let count = import(&["1,3,SKU-9", "2,1,SKU-4"], &mut orders)?;
          println!("imported {count}");
          println!("{:?}", import(&["3,two,SKU-1"], &mut orders));
          Ok(())
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [22],
      note: 'The signature gains `Result<Order, ImportError>`. That is the price of `?`: it only works inside a function whose return type can carry the error.',
    },
    {
      csharp: [5, 6, 7],
      rust: lines(23, 26),
      note: 'A slice pattern with `let else` checks the field count and names the fields in one step. The failure is an explicit `return Err(...)`, which is exactly what `?` expands to.',
    },
    {
      csharp: [9, 10],
      rust: [27, 28],
      note: '`int.Parse` throws. `parse()?` returns early with the error on failure, after passing it through `From::from`. The target type `u32` is inferred from the `Order` fields on the next line.',
    },
    {
      csharp: [9, 10],
      rust: lines(16, 20),
      note: 'This `impl From` is what lets `?` turn a `ParseIntError` into an `ImportError`. Without it, the `?` lines are E0277. In C# terms, it is the `catch (FormatException ex) { throw new ImportException(ex); }` you would otherwise write by hand, declared once for the whole program.',
    },
    {
      csharp: [16, 17],
      rust: lines(33, 35),
      note: 'Same propagation, different mechanism. Nothing unwinds: `parse_line` returned an `Err`, `?` returned it again from `import`, and the loop ends because the function returned.',
    },
    {
      csharp: [22, 25],
      rust: lines(39, 44),
      note: '`main` can return `Result`. `?` in `main` works like anywhere else; if an `Err` reaches the end, the runtime prints it and exits with a non-zero code. The second import is printed as a value to show what came back.',
    },
  ],
  breaks: [
    {
      heading: '`?` is a `match` and a `return`. It is not a `try` block.',
      body: [
        'A C# exception searches up the stack for a handler, running `finally` blocks on the way, and the methods it passes through never see it. `?` does nothing of the kind. The function containing it returns an `Err`, destructors run as for any other return, and the caller receives the value. If the caller also uses `?`, it returns in turn.',
        'The expansion below is what the compiler produces, minus some trait machinery. Once you read `?` this way, "where does this error get caught" has an obvious answer: at the first caller that does something other than `?`.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: 'Err(ParseIntError { kind: InvalidDigit })',
        code: code`
          use std::num::ParseIntError;

          fn quantity(field: &str) -> Result<u32, ParseIntError> {
              // let n = field.parse::<u32>()?;
              let n = match field.parse::<u32>() {
                  Ok(value) => value,
                  Err(e) => return Err(From::from(e)),
              };
              Ok(n * 2)
          }

          fn main() {
              println!("{:?}", quantity("three"));
          }
        `,
      },
    },
    {
      heading: 'The enclosing function decides whether `?` is allowed at all',
      body: [
        'You can throw from any C# method. `?` needs somewhere to return the error to, so it only compiles in a function (or closure) that returns `Result`, `Option`, or another type implementing the `Try` machinery. In a function returning `()`, rustc reports E0277 and suggests changing the return type.',
        'That includes closures passed to `map` or `for_each`. `?` inside a closure returns from the closure, not from the function around it, which lesson 5 comes back to.',
      ],
    },
    {
      heading: '`Option` and `Result` do not convert into each other',
      body: [
        '`?` on an `Option` in a function returning `Option` returns `None` early, the moral equivalent of `?.`. But there is no automatic bridge between the two: `None` carries no error, and an `Err` would lose its payload. Using `?` on an `Option` inside a function returning `Result` is E0277.',
        'Say what the error is with `ok_or` (or `ok_or_else` when building the error allocates). Going the other way, `.ok()` discards the error and gives you an `Option`.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          Ok(5432)
          Err("DB_PORT is not set")
        `,
        code: code`
          use std::collections::HashMap;

          fn db_port(env: &HashMap<&str, &str>) -> Result<u16, String> {
              let raw = env.get("DB_PORT").ok_or("DB_PORT is not set")?;
              raw.parse().map_err(|e| format!("DB_PORT: {e}"))
          }

          fn main() {
              println!("{:?}", db_port(&HashMap::from([("DB_PORT", "5432")])));
              println!("{:?}", db_port(&HashMap::new()));
          }
        `,
      },
    },
    {
      heading: '`main` returning `Err` prints `Debug`, not `Display`',
      body: [
        'The C# habit is a top-level `catch (Exception ex)` that logs `ex.Message`. `fn main() -> Result<(), E>` does the equivalent automatically, but the rule is `E: Debug`: it prints `Error: ` followed by the `Debug` form of the value and exits with code 1. For an enum that is the derived variant syntax, not a sentence written for a user.',
        'For a CLI tool, keep `main` small: call a `run()` that returns `Result`, and in `main` match on it, print the error with `{}` (and its `source()` chain), and set the exit code with `std::process::ExitCode`.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          use std::process::ExitCode;

          fn run() -> Result<u32, String> {
              Err(String::from("orders.csv: line 3 has 2 fields, expected 3"))
          }

          fn main() -> ExitCode {
              match run() {
                  Ok(count) => {
                      println!("imported {count}");
                      ExitCode::SUCCESS
                  }
                  Err(e) => {
                      eprintln!("import failed: {e}");
                      ExitCode::FAILURE
                  }
              }
          }
        `,
      },
    },
  ],
  visualize: [],
  drills: ['or-question-in-unit-fn', 'or-question-option-in-result'],
  takeaways: [
    '`?` means: on error, convert with `From` and return from this function. Nothing unwinds.',
    '`?` needs a return type that can hold the error, and `Option` needs `ok_or` before it can meet a `Result`.',
    '`main` can return `Result`, but a real program formats its own errors.',
  ],
};
