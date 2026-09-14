import { code } from '../code.ts';
import type { Gotcha } from '../types.ts';

export const gotchas: Gotcha[] = [
  // Strings -------------------------------------------------------------------
  {
    id: 'g-string-vs-str',
    title: 'There is no single string type',
    tags: ['strings', 'types', 'memory'],
    assumption: '`string` is one immutable reference type, so any text you hold is interchangeable with any other.',
    reality:
      '`String` is an owned, growable heap buffer; `&str` is a borrowed view into UTF-8 bytes someone else owns. Take `&str` in parameters, return `String` when you create text.',
    code: code`
      fn greet(name: &str) -> String {
          format!("hello, {name}")
      }

      fn main() {
          let owned: String = String::from("ada");
          let literal: &str = "grace";
          println!("{}", greet(&owned));
          println!("{}", greet(literal));
      }
    `,
    expect: 'compiles',
    stdout: 'hello, ada\nhello, grace\n',
    csharp: 'string Greet(string name) => $"hello, {name}";',
    seeAlso: { kind: 'lesson', id: 'functions' },
  },
  {
    id: 'g-string-index',
    title: 'You cannot index a String by integer',
    tags: ['strings', 'types'],
    assumption: '`s[0]` gives the first character, as it does for `string` in C#.',
    reality:
      '`String` does not implement `Index<usize>`, because a byte offset may land inside a multi-byte character. Use `s.chars().next()`, or slice a byte range with `&s[0..1]` when you know it is on a boundary.',
    code: code`
      fn main() {
          let s = String::from("héllo");
          let first = s[0];
          println!("{first}");
      }
    `,
    expect: 'fails',
    errorCode: 'E0277',
    csharp: 'char first = s[0];',
  },
  {
    id: 'g-len-is-bytes',
    title: '.len() counts bytes, not characters',
    tags: ['strings'],
    assumption: '`s.len()` is the number of characters, like `string.Length`.',
    reality:
      '`len()` is the UTF-8 byte length. Count Unicode scalar values with `s.chars().count()`, which is O(n). (C# `Length` counts UTF-16 code units, which is also not characters, but it agrees with intuition for more text.)',
    code: code`
      fn main() {
          let s = "naïve café";
          println!("{} bytes, {} chars", s.len(), s.chars().count());
      }
    `,
    expect: 'compiles',
    stdout: '12 bytes, 10 chars\n',
    csharp: '"naïve café".Length // 10',
  },
  {
    id: 'g-char-is-scalar',
    title: 'char is 4 bytes and a Unicode scalar value',
    tags: ['strings', 'types'],
    assumption: '`char` is a 16-bit UTF-16 code unit, so emoji take two of them.',
    reality:
      'A Rust `char` is 4 bytes and holds any Unicode scalar value, so there are no surrogate pairs. A `String` is not a `Vec<char>` though: it stores UTF-8, and one visible glyph can still be several `char`s.',
    code: code`
      fn main() {
          let crab = '🦀';
          println!("{} bytes in memory, {} in UTF-8", std::mem::size_of::<char>(), crab.len_utf8());
          println!("{}", "🦀".chars().count());
      }
    `,
    expect: 'compiles',
    stdout: '4 bytes in memory, 4 in UTF-8\n1\n',
    csharp: '"🦀".Length // 2 (surrogate pair)',
  },

  // Numbers -------------------------------------------------------------------
  {
    id: 'g-integer-overflow',
    title: 'Integer overflow panics in debug, wraps in release',
    tags: ['numbers'],
    assumption: 'Arithmetic silently wraps unless you are inside a `checked` block.',
    reality:
      'Debug builds panic on overflow; release builds wrap (unless `overflow-checks` is enabled). If wrapping is the intent, say so with `wrapping_add`; if overflow is possible, use `checked_add` and handle the `None`.',
    code: code`
      fn main() {
          let count: u8 = std::hint::black_box(255);
          println!("{:?}", count.checked_add(1));
          let next = count + 1;
          println!("{next}");
      }
    `,
    expect: 'panics',
    csharp: 'byte count = 255; count++; // 0, no exception outside checked { }',
  },
  {
    id: 'g-as-truncates',
    title: '`as` casts truncate silently',
    tags: ['numbers', 'types'],
    assumption: 'A narrowing cast either throws (in a `checked` context) or is something I would notice.',
    reality:
      '`as` never fails: integers truncate, floats saturate, and negatives reinterpret. Use `u8::try_from(x)` when the value might not fit.',
    code: code`
      fn main() {
          let big: i32 = 300;
          println!("{}", big as u8);
          println!("{}", -1i32 as u32);
          println!("{:?}", u8::try_from(big));
      }
    `,
    expect: 'compiles',
    stdout: '44\n4294967295\nErr(TryFromIntError(PosOverflow))\n',
    csharp: 'int big = 300; checked((byte)big) // OverflowException',
  },
  {
    id: 'g-no-implicit-widening',
    title: 'No implicit numeric widening',
    tags: ['numbers', 'types'],
    assumption: 'An `int` goes wherever a `long` is expected, since widening is lossless.',
    reality:
      'Rust never converts between numeric types implicitly, not even `i32` to `i64`. Write `i64::from(x)` (lossless, compiler-checked) or `x.into()`.',
    code: code`
      fn total_bytes(size: i64) -> i64 {
          size * 1024
      }

      fn main() {
          let kb: i32 = 512;
          println!("{}", total_bytes(kb));
      }
    `,
    expect: 'fails',
    errorCode: 'E0308',
    csharp: 'long TotalBytes(long size) => size * 1024; TotalBytes(512); // fine',
  },
  {
    id: 'g-mixed-int-float',
    title: 'Integers and floats do not mix in arithmetic',
    tags: ['numbers'],
    assumption: '`price * 2` promotes the integer to a double.',
    reality:
      'There is no `impl Mul<{integer}> for f64`. Write the literal as `2.0`, or convert with `n as f64` or `f64::from(n)`.',
    code: code`
      fn main() {
          let price = 9.99;
          let total = price * 2;
          println!("{total}");
      }
    `,
    expect: 'fails',
    errorCode: 'E0277',
    csharp: 'var total = 9.99 * 2; // 19.98',
  },

  // Syntax --------------------------------------------------------------------
  {
    id: 'g-shadowing',
    title: 'Shadowing is normal, not a bug',
    tags: ['syntax'],
    assumption: 'Declaring the same name twice in a scope is a compile error, and doing it on purpose would be a smell.',
    reality:
      'A new `let` with the same name creates a new binding, often of a different type. It is idiomatic for parse-then-validate steps, and it lets the old value stay immutable.',
    code: code`
      fn main() {
          let port = "8080";
          let port: u16 = port.parse().unwrap();
          let port = port + 1;
          println!("{port}");
      }
    `,
    expect: 'compiles',
    stdout: '8081\n',
    csharp: 'var port = "8080"; var port = int.Parse(port); // CS0128',
  },
  {
    id: 'g-if-expression',
    title: '`if` is an expression, so there is no ternary',
    tags: ['syntax'],
    assumption: 'I need `cond ? a : b` for a conditional value.',
    reality:
      '`if` and `match` produce values. `let x = if cond { a } else { b };` is the ternary. Both branches must have the same type.',
    code: code`
      fn main() {
          let retries = 3;
          let label = if retries == 1 { "retry" } else { "retries" };
          println!("{retries} {label}");
      }
    `,
    expect: 'compiles',
    stdout: '3 retries\n',
    csharp: 'var label = retries == 1 ? "retry" : "retries";',
  },
  {
    id: 'g-trailing-semicolon',
    title: 'A trailing semicolon changes the return value',
    tags: ['syntax', 'functions'],
    assumption: 'Semicolons are line terminators, so an extra one is harmless.',
    reality:
      'The last expression without a semicolon is the block value. Adding `;` turns it into a statement, and the function returns `()` instead.',
    code: code`
      fn area(w: u32, h: u32) -> u32 {
          w * h;
      }

      fn main() {
          println!("{}", area(2, 3));
      }
    `,
    expect: 'fails',
    errorCode: 'E0308',
    seeAlso: { kind: 'lesson', id: 'functions' },
  },
  {
    id: 'g-match-exhaustive',
    title: '`match` must be exhaustive',
    tags: ['syntax', 'types'],
    assumption: 'A `switch` without a `default` falls through to nothing, and a missing case is a warning at most.',
    reality:
      'A `match` that misses a variant does not compile. Adding a variant to an enum turns every incomplete `match` into an error, which is the point. Avoid `_ =>` when you want that safety.',
    code: code`
      enum Status { Active, Suspended, Closed }

      fn main() {
          let s = Status::Closed;
          let text = match s {
              Status::Active => "active",
              Status::Suspended => "suspended",
          };
          println!("{text}");
      }
    `,
    expect: 'fails',
    errorCode: 'E0004',
    csharp: 'var text = s switch { Status.Active => "a", Status.Suspended => "s" }; // CS8509 warning only',
  },
  {
    id: 'g-println-macro',
    title: '`println!` is a macro, checked at compile time',
    tags: ['syntax', 'strings', 'tooling'],
    assumption: 'Formatting calls `ToString()` on anything at runtime, so every value can be printed.',
    reality:
      'The `!` means a macro. The format string is parsed at compile time, argument counts are checked, and `{}` requires `Display` (`{:?}` requires `Debug`). A struct without either does not compile.',
    code: code`
      struct Order { id: u32 }

      fn main() {
          let order = Order { id: 7 };
          println!("{}", order);
      }
    `,
    expect: 'fails',
    errorCode: 'E0277',
    csharp: 'Console.WriteLine($"{order}"); // prints the full type name, e.g. "Billing.Order"',
  },

  // Functions -----------------------------------------------------------------
  {
    id: 'g-no-overloading',
    title: 'No function overloading',
    tags: ['functions'],
    assumption: 'Two functions can share a name if their parameter lists differ.',
    reality:
      'Names must be unique in a scope. Use distinct names (`from_str`, `from_bytes`), a generic parameter with a trait bound, or an enum argument.',
    code: code`
      fn find(id: u64) -> String { format!("by id {id}") }
      fn find(email: &str) -> String { format!("by email {email}") }

      fn main() {
          println!("{}", find(1));
      }
    `,
    expect: 'fails',
    errorCode: 'E0428',
    csharp: 'User Find(long id); User Find(string email);',
  },
  {
    id: 'g-no-default-params',
    title: 'No default or named parameters',
    tags: ['functions'],
    assumption: 'I can write `int timeoutMs = 5000` and let callers skip it.',
    reality:
      'Every argument must be passed. Use an options struct with `Default` and `..Default::default()`, an `Option<T>` parameter, or a builder.',
    code: code`
      fn connect(host: &str, timeout_ms: u64) -> String {
          format!("{host} ({timeout_ms}ms)")
      }

      fn main() {
          println!("{}", connect("db.internal"));
      }
    `,
    expect: 'fails',
    errorCode: 'E0061',
    csharp: 'string Connect(string host, int timeoutMs = 5000);',
  },
  {
    id: 'g-closure-capture',
    title: 'Closures borrow what they capture',
    tags: ['functions', 'memory'],
    assumption: 'A lambda captures variables into a hidden class, and both the lambda and the method can keep using them.',
    reality:
      'A closure that mutates a captured variable holds a `&mut` borrow until the closure is last used, so you cannot read the variable in between. Finish calling the closure before reading, or keep the state in a `Cell`. `move` does not help here: it copies `hits` into the closure, and the outer variable stays 0.',
    code: code`
      fn main() {
          let mut hits = 0;
          let mut record = || hits += 1;
          println!("{hits}");
          record();
      }
    `,
    expect: 'fails',
    errorCode: 'E0502',
    csharp: 'int hits = 0; Action record = () => hits++; Console.WriteLine(hits); record();',
    seeAlso: { kind: 'lesson', id: 'aliasing' },
  },

  // Memory --------------------------------------------------------------------
  {
    id: 'g-mut-per-binding',
    title: '`mut` belongs to the binding, not the type',
    tags: ['memory', 'syntax'],
    assumption: '`List<T>` is a mutable type, so any variable holding one can call `Add`.',
    reality:
      'There are no separate mutable and immutable collection types. Mutability is a property of each binding: the same `Vec` is frozen behind `let v` and editable after `let mut w = v`.',
    code: code`
      fn main() {
          let tags = Vec::new();
          tags.push("prod");
          println!("{tags:?}");
      }
    `,
    expect: 'fails',
    errorCode: 'E0596',
    csharp: 'var tags = new List<string>(); tags.Add("prod");',
    seeAlso: { kind: 'lesson', id: 'aliasing' },
  },
  {
    id: 'g-drop-order',
    title: 'Values drop in reverse declaration order',
    tags: ['memory'],
    assumption: 'Cleanup happens whenever the GC gets to it, in no particular order.',
    reality:
      'Locals are dropped deterministically at the end of scope, last declared first, like nested `using` declarations. Struct fields drop in declaration order.',
    code: code`
      struct Noisy(&'static str);
      impl Drop for Noisy {
          fn drop(&mut self) { println!("drop {}", self.0); }
      }

      fn main() {
          let _conn = Noisy("connection");
          let _tx = Noisy("transaction");
      }
    `,
    expect: 'compiles',
    stdout: 'drop transaction\ndrop connection\n',
    csharp: 'using var conn = Open(); using var tx = conn.Begin(); // tx disposed first',
    seeAlso: { kind: 'lesson', id: 'drop' },
  },

  // Collections ---------------------------------------------------------------
  {
    id: 'g-vec-index-panics',
    title: 'Out-of-bounds indexing panics, it does not throw',
    tags: ['collections', 'errors'],
    assumption: 'An `ArgumentOutOfRangeException` can be caught and handled higher up.',
    reality:
      '`v[i]` panics, which is not meant to be caught. When the index might be missing, use `v.get(i)`, which returns `Option<&T>`.',
    code: code`
      fn main() {
          let replicas = vec!["a", "b", "c"];
          let i = std::hint::black_box(3);
          println!("{:?}", replicas.get(i));
          println!("{}", replicas[i]);
      }
    `,
    expect: 'panics',
    csharp: 'try { var r = replicas[3]; } catch (ArgumentOutOfRangeException) { }',
  },
  {
    id: 'g-hashmap-order',
    title: 'HashMap iteration order changes between runs',
    tags: ['collections'],
    assumption: 'Iterating a dictionary gives insertion order, so tests can assert on it.',
    reality:
      '`HashMap` uses a randomly seeded hasher, so order can differ on every run, not only across versions. Use `BTreeMap` for sorted order, or sort the keys before asserting.',
    code: code`
      use std::collections::{BTreeMap, HashMap};

      fn main() {
          let hashed: HashMap<_, _> = [("zeta", 1), ("alpha", 2), ("mid", 3)].into();
          let sorted: BTreeMap<_, _> = hashed.iter().collect();
          println!("{:?}", hashed.keys().collect::<Vec<_>>());
          println!("{:?}", sorted.keys().collect::<Vec<_>>());
      }
    `,
    expect: 'compiles',
    csharp: 'new Dictionary<string, int> { ["zeta"] = 1, ["alpha"] = 2 } // enumerates in insertion order in practice',
  },

  // Tooling -------------------------------------------------------------------
  {
    id: 'g-cargo-test-parallel',
    title: '`cargo test` runs tests in parallel',
    tags: ['tooling'],
    assumption: 'Tests in one file run one after another, as in an xUnit test class.',
    reality:
      'The test harness runs every test on its own thread by default. Tests that share a file, port or environment variable will flake. Isolate them, or run `cargo test -- --test-threads=1`.',
    code: code`
      fn slugify(title: &str) -> String {
          title.to_lowercase().replace(' ', "-")
      }

      fn main() {
          println!("{}", slugify("Hello World"));
      }

      #[cfg(test)]
      mod tests {
          use super::*;

          #[test]
          fn lowercases() { assert_eq!(slugify("A B"), "a-b"); }

          #[test]
          fn keeps_digits() { assert_eq!(slugify("v2 API"), "v2-api"); }
      }
    `,
    expect: 'compiles',
    stdout: 'hello-world\n',
    csharp: '[Fact] public void Lowercases() { } // same class: not run in parallel by xUnit',
  },
];
