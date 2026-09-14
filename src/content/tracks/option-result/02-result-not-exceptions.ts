import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const resultNotExceptions: Lesson = {
  id: 'or-result-not-exceptions',
  title: 'Errors are return values',
  summary: '`Result<T, E>` puts failure in the signature. There is no throw, no unwinding to a handler, and no `catch (Exception)` at the top of `Main`.',
  intro: [
    'In C# the signature `int ReadPort(string text)` says nothing about failure. The method might throw `FormatException`, `OverflowException` or `InvalidOperationException`, and the only record of that is XML docs nobody keeps current. The safety net is a `catch (Exception)` somewhere near `Main` or an ASP.NET exception middleware.',
    'Rust has no exceptions for expected failures. A function that can fail returns `Result<T, E>`, an enum of `Ok(T)` or `Err(E)`, and the caller has to take it apart before it gets the `T`. The closest thing you already use is the `int.TryParse(text, out var port)` pattern, made impossible to ignore.',
  ],
  csharp: {
    filename: 'ConfigLoader.cs',
    code: code`
      public static class ConfigLoader
      {
          /// <exception cref="InvalidOperationException">No port line.</exception>
          /// <exception cref="FormatException">Port is not a number.</exception>
          /// <exception cref="OverflowException">Port is out of range.</exception>
          public static ushort ReadPort(string text)
          {
              var line = text.Split('\n').First(l => l.StartsWith("port="));
              return ushort.Parse(line["port=".Length..]);
          }
      }

      public static class Program
      {
          public static void Main()
          {
              foreach (var text in new[] { "host=db\nport=5432", "host=db", "port=99999" })
              {
                  try
                  {
                      Console.WriteLine($"listening on {ConfigLoader.ReadPort(text)}");
                  }
                  catch (InvalidOperationException) { Console.WriteLine("no port configured"); }
                  catch (Exception ex) { Console.WriteLine($"bad port: {ex.Message}"); }
              }
          }
      }
    `,
  },
  rust: {
    filename: 'config_loader.rs',
    stdout: code`
      listening on 5432
      no port configured
      bad port: number too large to fit in target type
    `,
    code: code`
      use std::num::ParseIntError;

      #[derive(Debug)]
      enum ConfigError {
          MissingPort,
          BadPort(ParseIntError),
      }

      fn read_port(text: &str) -> Result<u16, ConfigError> {
          let line = match text.lines().find(|l| l.starts_with("port=")) {
              Some(line) => line,
              None => return Err(ConfigError::MissingPort),
          };
          match line["port=".len()..].parse::<u16>() {
              Ok(port) => Ok(port),
              Err(e) => Err(ConfigError::BadPort(e)),
          }
      }

      fn main() {
          for text in ["host=db\nport=5432", "host=db", "port=99999"] {
              match read_port(text) {
                  Ok(port) => println!("listening on {port}"),
                  Err(ConfigError::MissingPort) => println!("no port configured"),
                  Err(ConfigError::BadPort(e)) => println!("bad port: {e}"),
              }
          }
      }
    `,
  },
  links: [
    {
      csharp: [3, 4, 5, 6],
      rust: lines(3, 9),
      note: 'The `<exception>` docs become a type. `Result<u16, ConfigError>` is the whole contract: success is a `u16`, failure is one of exactly two named cases. The compiler keeps it current because callers cannot compile against a variant that does not exist.',
    },
    {
      csharp: [8],
      rust: lines(10, 13),
      note: '`First` throws `InvalidOperationException` on no match. `find` returns an `Option`, and the `None` arm returns an `Err` explicitly. The early `return` is ordinary control flow, not a throw.',
    },
    {
      csharp: [9],
      rust: lines(14, 17),
      note: '`ushort.Parse` throws two different exceptions. `parse::<u16>()` returns `Result<u16, ParseIntError>`, and a single error type covers both bad digits and overflow. Wrapping it in `BadPort` keeps the cause for the caller. Lesson 3 replaces this `match` with `?`.',
    },
    {
      csharp: lines(19, 24),
      rust: lines(22, 26),
      note: '`try` plus two `catch` blocks becomes one `match`. The arms are checked for exhaustiveness: remove the `MissingPort` arm and the program does not compile (E0004), whereas deleting a `catch` in C# compiles and moves the failure to runtime.',
    },
    {
      csharp: [24],
      rust: [25],
      note: 'There is no `catch (Exception)` here because there is nothing else that can come out of `read_port`. A bug inside it would be a panic, which is not a value you match on.',
    },
  ],
  breaks: [
    {
      heading: 'You cannot get the `T` without deciding what to do with the `E`',
      body: [
        'Calling `ReadPort` and ignoring the possibility of failure is the default in C#: the exception flies past you. In Rust, a `Result<u16, ConfigError>` is not a `u16`. Assigning it to one is a type error, E0308, and discarding it entirely triggers the `unused_must_use` lint.',
        'That is the whole mechanism. There is no checked-exception syntax like Java\'s `throws`; the enforcement falls out of the type system.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn read_port(text: &str) -> Result<u16, std::num::ParseIntError> {
              text.trim_start_matches("port=").parse()
          }

          fn main() {
              let port: u16 = read_port("port=5432");
              println!("listening on {port}");
          }
        `,
      },
    },
    {
      heading: 'Panics are not exceptions. Do not build `try`/`catch` out of `catch_unwind`.',
      body: [
        'Rust still has a failure path that unwinds the stack: `panic!`, and everything that calls it (`unwrap` on `None`, index out of bounds, integer overflow in debug builds). It exists for bugs, the way `Debug.Assert` or `Environment.FailFast` do, not for "the file was missing".',
        '`std::panic::catch_unwind` can stop a panic, and thread pools and FFI boundaries use it. It is not a general handler: it does not catch panics when the binary is built with `panic = "abort"`, which many release profiles set, and types have to be `UnwindSafe`. If your design needs to recover from it, the function should have returned a `Result`.',
      ],
      code: {
        language: 'toml',
        caption: 'Cargo.toml',
        code: code`
          [profile.release]
          panic = "abort"   # a panic ends the process; catch_unwind sees nothing
        `,
      },
    },
    {
      heading: 'A `Result` carries no stack trace',
      body: [
        '`throw` captures `StackTrace` whether you want it or not, which is part of why exceptions are expensive and why "don\'t use exceptions for control flow" is standard advice.',
        '`Err(e)` is a plain move of a value. Returning it costs the same as returning `Ok`, so using `Result` for expected, frequent failures (validation, parsing, not-found) is normal and cheap. The price is that you get no trace for free: if you want one, capture a `std::backtrace::Backtrace` in the error yourself, or add context as the error travels up, which lesson 4 covers.',
      ],
    },
    {
      heading: 'Adding an error variant is a breaking change, on purpose',
      body: [
        'Introducing a new exception type in a library breaks nobody at compile time; callers find out in production. Adding a variant to a public error enum breaks every exhaustive `match` downstream.',
        'That is usually what you want inside an application. For a library that expects to grow new failure cases, mark the enum `#[non_exhaustive]`: callers outside the crate are then forced to write a wildcard arm, which is the explicit version of `catch (Exception)`.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: 'unexpected config error: Unreadable',
        code: code`
          #[derive(Debug)]
          #[non_exhaustive]
          pub enum ConfigError {
              MissingPort,
              BadPort,
              Unreadable,
          }

          fn describe(e: &ConfigError) -> String {
              match e {
                  ConfigError::MissingPort => String::from("no port configured"),
                  ConfigError::BadPort => String::from("bad port"),
                  other => format!("unexpected config error: {other:?}"),
              }
          }

          fn main() {
              println!("{}", describe(&ConfigError::Unreadable));
          }
        `,
      },
    },
  ],
  visualize: [],
  drills: ['or-non-exhaustive-match'],
  takeaways: [
    'Expected failure is part of the return type. Callers cannot reach the value without handling the error.',
    'Panics are for bugs. `catch_unwind` is not `catch`.',
    '`Err` is as cheap as `Ok`, so there is no reason to avoid it for common failures.',
  ],
};
