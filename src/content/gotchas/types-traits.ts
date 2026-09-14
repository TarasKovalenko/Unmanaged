import { code } from '../code.ts';
import type { Gotcha } from '../types.ts';

export const gotchas: Gotcha[] = [
  // Types ---------------------------------------------------------------------
  {
    id: 'g-no-null',
    title: 'No null, so no null-forgiving operator',
    tags: ['types', 'errors'],
    assumption: 'A value that might be missing is still the same type, and `user!.Name` tells the compiler to trust me.',
    reality:
      'Absence is `Option<T>`, a different type from `T`. There is no `!` to wave it through: you `match`, use `if let`, `?`, `unwrap_or`, or an explicit `unwrap()` that panics.',
    code: code`
      fn find_email(id: u32) -> Option<&'static str> {
          if id == 1 { Some("ada@example.com") } else { None }
      }

      fn main() {
          let email = find_email(2);
          println!("{}", email.to_uppercase());
      }
    `,
    expect: 'fails',
    errorCode: 'E0599',
    csharp: 'string? email = FindEmail(2); Console.WriteLine(email!.ToUpper());',
  },
  {
    id: 'g-struct-assign-moves',
    title: 'Assigning a struct moves it, it does not copy it',
    tags: ['types', 'memory'],
    assumption: 'A `struct` has value semantics, so assignment copies it and both variables stay usable.',
    reality:
      'Rust has no class/struct split. Assignment moves unless the type implements `Copy`, which you opt into with `#[derive(Clone, Copy)]` and only when every field is `Copy` (so no `String` or `Vec`).',
    code: code`
      struct Money { cents: i64, currency: String }

      fn main() {
          let price = Money { cents: 999, currency: String::from("EUR") };
          let charged = price;
          println!("{} {}", price.cents, charged.currency);
      }
    `,
    expect: 'fails',
    errorCode: 'E0382',
    csharp: 'var charged = price; // record struct: a copy, both usable',
    seeAlso: { kind: 'lesson', id: 'moves' },
  },
  {
    id: 'g-fields-private',
    title: 'Fields are private to their module',
    tags: ['types', 'syntax'],
    assumption: 'Fields without a modifier are private to the class, and code in the same file can still get at them through the type.',
    reality:
      'Privacy is per module, not per type. A field without `pub` is visible to everything in the defining module (and its child modules) and invisible outside it, even to code in the same file.',
    code: code`
      mod billing {
          pub struct Invoice { pub id: u32, total_cents: i64 }
          pub fn new_invoice(id: u32) -> Invoice { Invoice { id, total_cents: 0 } }
      }

      fn main() {
          let inv = billing::new_invoice(7);
          println!("{} {}", inv.id, inv.total_cents);
      }
    `,
    expect: 'fails',
    errorCode: 'E0616',
    csharp: 'public class Invoice { public int Id; decimal total; }',
  },
  {
    id: 'g-impl-vs-dyn',
    title: '`impl Trait` is one concrete type, not an interface reference',
    tags: ['types', 'traits'],
    assumption: 'Returning `impl Display` is like returning `IFormattable`: any implementation will do, per call.',
    reality:
      '`impl Trait` in return position is a single hidden concrete type chosen at compile time, like a generic. To return different types at runtime, use `Box<dyn Trait>`, which is the closer match to an interface reference.',
    code: code`
      use std::fmt::Display;

      fn label(count: u32) -> impl Display {
          if count == 0 { "none" } else { count }
      }

      fn main() {
          println!("{}", label(3));
      }
    `,
    expect: 'fails',
    errorCode: 'E0308',
    csharp: 'object Label(int count) => count == 0 ? "none" : count;',
  },
  {
    id: 'g-default-not-constructor',
    title: '`Default` instead of parameterless constructors',
    tags: ['types', 'traits'],
    assumption: 'Every type has a `new()` and fields start at `0`/`null` if I do not set them.',
    reality:
      'There are no constructors and no implicit zero values: every field must be initialized. `#[derive(Default)]` plus struct update syntax covers the "set a few, default the rest" case.',
    code: code`
      #[derive(Debug, Default)]
      struct RetryPolicy { max_attempts: u32, backoff_ms: u64, jitter: bool }

      fn main() {
          let policy = RetryPolicy { max_attempts: 5, ..Default::default() };
          println!("{policy:?}");
      }
    `,
    expect: 'compiles',
    stdout: 'RetryPolicy { max_attempts: 5, backoff_ms: 0, jitter: false }\n',
    csharp: 'var policy = new RetryPolicy { MaxAttempts = 5 };',
  },

  // Equality ------------------------------------------------------------------
  {
    id: 'g-eq-is-value',
    title: '`==` is PartialEq, never reference equality',
    tags: ['equality', 'traits'],
    assumption: '`==` on two separately built objects compares references unless the type overrides it.',
    reality:
      '`==` always calls `PartialEq::eq` and compares values. If you really want identity, ask for it with `std::ptr::eq`.',
    code: code`
      fn main() {
          let a = vec![String::from("x")];
          let b = vec![String::from("x")];
          println!("{} {}", a == b, std::ptr::eq(&a, &b));
      }
    `,
    expect: 'compiles',
    stdout: 'true false\n',
    csharp: 'new List<string> { "x" } == new List<string> { "x" } // false',
  },
  {
    id: 'g-no-default-equality',
    title: 'Structs have no == until you derive it',
    tags: ['equality', 'traits'],
    assumption: 'Every type can be compared with `==`, falling back to `object.Equals`.',
    reality:
      'There is no base object. Without `#[derive(PartialEq)]` (or a manual impl), `==` does not compile at all.',
    code: code`
      struct UserId(u64);

      fn main() {
          let a = UserId(1);
          let b = UserId(1);
          println!("{}", a == b);
      }
    `,
    expect: 'fails',
    errorCode: 'E0369',
    csharp: 'new UserId(1) == new UserId(1) // compiles; false for a class, true for a record',
  },
  {
    id: 'g-generic-no-equals',
    title: 'A generic T cannot be compared without a bound',
    tags: ['equality', 'traits', 'types'],
    assumption: 'Any `T` has `Equals`, so a generic `Contains` needs no constraint.',
    reality:
      'Generic code can only use what the bounds promise. Comparing `T`s needs `T: PartialEq`; hashing needs `Hash`; printing needs `Debug` or `Display`.',
    code: code`
      fn contains<T>(items: &[T], wanted: &T) -> bool {
          items.iter().any(|item| item == wanted)
      }

      fn main() {
          println!("{}", contains(&[1, 2, 3], &2));
      }
    `,
    expect: 'fails',
    errorCode: 'E0369',
    csharp: 'bool Contains<T>(T[] items, T wanted) => items.Any(i => i.Equals(wanted));',
  },
  {
    id: 'g-f64-not-ord',
    title: 'You cannot sort() a Vec<f64>',
    tags: ['numbers', 'traits', 'collections'],
    assumption: 'Doubles are comparable, so `List<double>.Sort()` works.',
    reality:
      '`NaN` breaks total ordering, so `f64` implements only `PartialOrd`, not `Ord` or `Eq`. Use `sort_by(f64::total_cmp)`, and note that `f64` cannot be a `HashMap` key either.',
    code: code`
      fn main() {
          let mut latencies = vec![12.5, 3.1, 8.0];
          latencies.sort();
          println!("{latencies:?}");
      }
    `,
    expect: 'fails',
    errorCode: 'E0277',
    csharp: 'var latencies = new List<double> { 12.5, 3.1, 8.0 }; latencies.Sort();',
  },

  // Traits --------------------------------------------------------------------
  {
    id: 'g-no-inheritance',
    title: 'No inheritance, and traits have no fields',
    tags: ['traits', 'types'],
    assumption: 'Shared state goes in an abstract base class that subclasses extend.',
    reality:
      'Structs cannot extend structs, and traits carry behaviour only. Share data by composition (a field holding the common part) and share behaviour with trait default methods built on required accessors.',
    code: code`
      trait Entity {
          fn id(&self) -> u64;
          fn key(&self) -> String { format!("entity:{}", self.id()) }
      }

      struct Audit { created_by: &'static str }
      struct Customer { id: u64, audit: Audit }

      impl Entity for Customer {
          fn id(&self) -> u64 { self.id }
      }

      fn main() {
          let c = Customer { id: 42, audit: Audit { created_by: "import" } };
          println!("{} by {}", c.key(), c.audit.created_by);
      }
    `,
    expect: 'compiles',
    stdout: 'entity:42 by import\n',
    csharp: 'abstract class Entity { public long Id; } class Customer : Entity { }',
  },
  {
    id: 'g-trait-in-scope',
    title: 'Trait methods need the trait in scope',
    tags: ['traits', 'syntax'],
    assumption: 'If a type has a method, I can call it anywhere I can see the type.',
    reality:
      'A method that comes from a trait is only callable where the trait is imported. The error suggests the `use` line. This is closer to extension methods needing their namespace than to interface methods.',
    code: code`
      mod money {
          pub trait Cents { fn cents(&self) -> i64; }
          impl Cents for f64 {
              fn cents(&self) -> i64 { (self * 100.0).round() as i64 }
          }
      }

      fn main() {
          println!("{}", 12.34_f64.cents());
      }
    `,
    expect: 'fails',
    errorCode: 'E0599',
    csharp: '12.34.Cents(); // CS1061 until you add: using Money;',
  },

  // Errors --------------------------------------------------------------------
  {
    id: 'g-parse-returns-result',
    title: '`parse` returns a Result, it does not throw',
    tags: ['errors', 'strings'],
    assumption: 'Parsing bad input throws `FormatException`, so I either catch it or use `TryParse`.',
    reality:
      'There are no exceptions. `str::parse` returns `Result<T, ParseIntError>` (or similar), and the type system makes you deal with the `Err` case.',
    code: code`
      fn main() {
          for input in ["8080", "80a0"] {
              match input.parse::<u16>() {
                  Ok(port) => println!("port {port}"),
                  Err(e) => println!("bad port {input:?}: {e}"),
              }
          }
      }
    `,
    expect: 'compiles',
    stdout: 'port 8080\nbad port "80a0": invalid digit found in string\n',
    csharp: 'int.TryParse("80a0", out var port) // false',
  },
  {
    id: 'g-unwrap-panics',
    title: '`unwrap()` is a panic, not a null check',
    tags: ['errors'],
    assumption: '`.unwrap()` is the Rust spelling of `.Value` and is fine in production code.',
    reality:
      '`unwrap()` on `None` or `Err` panics and, on the main thread, ends the program. Use `?`, `match`, or `unwrap_or_else`; when a panic is truly impossible, `expect("why")` documents the reason.',
    code: code`
      use std::collections::HashMap;

      fn main() {
          let config: HashMap<&str, &str> = HashMap::from([("host", "db.internal")]);
          println!("{}", config.get("host").unwrap());
          println!("{}", config.get("port").unwrap());
      }
    `,
    expect: 'panics',
    csharp: 'int? port = null; var p = port.Value; // InvalidOperationException',
  },
  {
    id: 'g-result-must-use',
    title: 'An ignored Result is only a warning',
    tags: ['errors', 'tooling'],
    assumption: 'If I forget to handle a failure, an exception will surface it anyway.',
    reality:
      'Nothing is thrown. `Result` is `#[must_use]`, so discarding one warns, but the program still builds and the error vanishes. Treat warnings as errors in CI (`RUSTFLAGS="-D warnings"`) and write `let _ = ...` when ignoring is deliberate.',
    code: code`
      fn save(path: &str) -> Result<(), String> {
          Err(format!("{path}: permission denied"))
      }

      fn main() {
          save("/etc/app.toml");
          println!("saved");
      }
    `,
    expect: 'compiles',
    stdout: 'saved\n',
    csharp: 'Save("/etc/app.toml"); // IOException propagates',
  },
  {
    id: 'g-question-mark-needs-from',
    title: '`?` only converts errors that have a From impl',
    tags: ['errors', 'traits'],
    assumption: 'Any exception propagates through any method, whatever its type.',
    reality:
      '`?` returns early with `From::from(err)`, so the function error type must be convertible from the error you are propagating. Map it with `map_err`, implement `From`, or use `Box<dyn Error>`.',
    code: code`
      fn read_port(raw: &str) -> Result<u16, String> {
          let port = raw.parse::<u16>()?;
          Ok(port)
      }

      fn main() {
          println!("{:?}", read_port("8080"));
      }
    `,
    expect: 'fails',
    errorCode: 'E0277',
    csharp: 'int ReadPort(string raw) => int.Parse(raw); // FormatException propagates',
  },

  // Async ---------------------------------------------------------------------
  {
    id: 'g-async-is-lazy',
    title: '`async fn` does nothing until awaited',
    tags: ['async'],
    assumption: 'Calling an async method starts it running, like a hot `Task`, even if I never await it.',
    reality:
      'Calling an `async fn` builds a future and runs none of its body. It only makes progress when polled, by `.await` or an executor. Dropping it unpolled means the work never happens.',
    code: code`
      use std::future::Future;
      use std::pin::pin;
      use std::task::{Context, Poll, Waker};

      async fn send_email() { println!("email sent"); }

      fn main() {
          let fut = send_email();
          println!("called send_email");
          let mut cx = Context::from_waker(Waker::noop());
          if let Poll::Ready(()) = pin!(fut).poll(&mut cx) { println!("polled"); }
      }
    `,
    expect: 'compiles',
    stdout: 'called send_email\nemail sent\npolled\n',
    csharp: '_ = SendEmailAsync(); // runs up to its first await immediately',
  },
];
