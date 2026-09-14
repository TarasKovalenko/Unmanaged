import { code } from '../code.ts';
import type { Drill } from '../types.ts';

export const drills: Drill[] = [
  {
    id: 'or-unwrap-none',
    track: 'option-result',
    title: 'A setting that is not quite there',
    csharpReflex: '`settings["DB_NAME"]!` is how you tell the compiler a configuration value exists. If it does not, you find out when something dereferences it.',
    code: code`
      use std::collections::HashMap;

      fn connection_string(settings: &HashMap<String, String>) -> String {
          let host = settings.get("DB_HOST").unwrap();
          let name = settings.get("DB_NAME").unwrap();
          format!("postgres://{host}/{name}")
      }

      fn main() {
          let mut settings = HashMap::new();
          settings.insert(String::from("DB_HOST"), String::from("db.internal"));
          settings.insert(String::from("DB_NAME "), String::from("orders"));
          println!("{}", connection_string(&settings));
      }
    `,
    outcome: 'panic',
    errorCode: 'panic',
    message: `thread 'main' panicked at src/main.rs:5:40:
called \`Option::unwrap()\` on a \`None\` value`,
    options: [
      {
        text: 'The key was inserted as `"DB_NAME "` with a trailing space, so `get("DB_NAME")` returns `None`, and `unwrap` on `None` panics at line 5.',
        correct: true,
        why: 'The panic message names the file and line of the `unwrap` that failed and says it was called on a `None` value. `unwrap` is a checked assertion: it fails exactly where the assumption was made, not later where the value is used.',
      },
      {
        text: '`HashMap::get` panics when the key is missing, the same way the `Dictionary` indexer throws `KeyNotFoundException`.',
        why: 'Tempting, because indexing a `HashMap` with `settings["DB_NAME"]` does panic. But `get` never panics: it returns `Option<&String>`. The panic comes from the `unwrap` called on that `None`.',
      },
      {
        text: '`get` is called with a `&str` on a map with `String` keys, so the lookup compares a string slice against owned strings and never matches.',
        why: '`HashMap<String, _>::get` accepts anything the key type can borrow as, and `String` borrows as `str`. Lookups with `&str` hash and compare identically. The key really is different.',
      },
      {
        text: '`unwrap` moves the `String` out of the map, so the map is left without a value for the second lookup.',
        why: '`get` returns a reference, and `unwrap` on `Option<&String>` gives back a `&String`. Nothing is moved out of the map. Moving out from behind a reference would be a compile error, not a panic.',
      },
    ],
    fixes: [
      {
        label: 'Return a `Result` that names the missing key',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Missing configuration is an expected failure, so it belongs in the return type. `ok_or_else` turns the `None` into an error that says which key, and `main` decides how to report it. The typo is still there, but now it produces a readable message instead of a panic.',
        code: code`
          use std::collections::HashMap;

          fn setting<'a>(settings: &'a HashMap<String, String>, key: &str) -> Result<&'a str, String> {
              settings.get(key).map(String::as_str).ok_or_else(|| format!("missing setting {key}"))
          }

          fn connection_string(settings: &HashMap<String, String>) -> Result<String, String> {
              let host = setting(settings, "DB_HOST")?;
              let name = setting(settings, "DB_NAME")?;
              Ok(format!("postgres://{host}/{name}"))
          }

          fn main() {
              let mut settings = HashMap::new();
              settings.insert(String::from("DB_HOST"), String::from("db.internal"));
              settings.insert(String::from("DB_NAME "), String::from("orders"));
              match connection_string(&settings) {
                  Ok(cs) => println!("{cs}"),
                  Err(e) => eprintln!("configuration error: {e}"),
              }
          }
        `,
      },
      {
        label: 'Fall back to an empty string',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'No panic, and no error either. The service starts with `postgres://db.internal/` and fails later, far from the cause. This is the Rust version of `settings["DB_NAME"] ?? ""`.',
        code: code`
          use std::collections::HashMap;

          fn connection_string(settings: &HashMap<String, String>) -> String {
              let host = settings.get("DB_HOST").map(String::as_str).unwrap_or_default();
              let name = settings.get("DB_NAME").map(String::as_str).unwrap_or_default();
              format!("postgres://{host}/{name}")
          }

          fn main() {
              let mut settings = HashMap::new();
              settings.insert(String::from("DB_HOST"), String::from("db.internal"));
              settings.insert(String::from("DB_NAME "), String::from("orders"));
              println!("{}", connection_string(&settings));
          }
        `,
      },
      {
        label: 'Replace `unwrap` with `expect`',
        verdict: 'wrong',
        expect: 'panics',
        note: 'A better panic message, and still a panic. `expect` is the right tool when absence is a bug in your own code. A value that comes from outside the program can legitimately be missing, so it needs a `Result`.',
        code: code`
          use std::collections::HashMap;

          fn connection_string(settings: &HashMap<String, String>) -> String {
              let host = settings.get("DB_HOST").expect("DB_HOST must be set");
              let name = settings.get("DB_NAME").expect("DB_NAME must be set");
              format!("postgres://{host}/{name}")
          }

          fn main() {
              let mut settings = HashMap::new();
              settings.insert(String::from("DB_HOST"), String::from("db.internal"));
              settings.insert(String::from("DB_NAME "), String::from("orders"));
              println!("{}", connection_string(&settings));
          }
        `,
      },
    ],
  },
  {
    id: 'or-unwrap-behind-ref',
    track: 'option-result',
    title: 'Matching an Option field through &self',
    csharpReflex: '`Nickname is { } nick ? nick : Name` reads a property. Nothing is taken away from the object.',
    code: code`
      struct Customer {
          name: String,
          nickname: Option<String>,
      }

      impl Customer {
          fn display_name(&self) -> String {
              match self.nickname {
                  Some(nickname) => nickname,
                  None => self.name.clone(),
              }
          }
      }

      fn main() {
          let ada = Customer { name: String::from("Ada Lovelace"), nickname: Some(String::from("Ada")) };
          println!("{}", ada.display_name());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0507',
    message: `error[E0507]: cannot move out of \`self.nickname\` as enum variant \`Some\` which is behind a shared reference
 --> src/main.rs:8:15
  |
8 |         match self.nickname {
  |               ^^^^^^^^^^^^^
9 |             Some(nickname) => nickname,
  |                  -------- data moved here because \`nickname\` has type \`String\`, which does not implement the \`Copy\` trait
  |
help: consider borrowing here
  |
8 |         match &self.nickname {
  |               +`,
    options: [
      {
        text: 'The pattern `Some(nickname)` binds the `String` by value, which would move it out of `self.nickname`, and `&self` only lends the customer.',
        correct: true,
        why: 'Matching on the place `self.nickname` and binding `nickname` by value means taking ownership of the string inside a struct you only borrowed. That would leave the customer with a hole in it. rustc suggests matching on `&self.nickname` instead, so the binding becomes a `&String`. `self.nickname.unwrap()` fails the same way, because `unwrap` also takes the option by value.',
      },
      {
        text: 'The `match` is missing a wildcard arm, so the compiler cannot prove `nickname` is initialised.',
        why: '`Some` and `None` are the only two variants, so the match is exhaustive. Missing arms would be E0004. This error is about ownership.',
      },
      {
        text: '`display_name` needs `&mut self` to read an `Option` field.',
        why: 'Reading through `&self` is fine. `&mut self` would not help either: a mutable borrow still does not let you move a value out and leave the field empty. `Option::take()` or `std::mem::replace` can do that, because they put something back.',
      },
      {
        text: 'Arms of a `match` must return the same type, and `nickname` is a `&String` while `clone()` gives a `String`.',
        why: 'That would be E0308, and it is roughly what happens after applying rustc\'s suggestion. As written, `nickname` is a `String`, and producing it is exactly the move rustc refuses.',
      },
    ],
    fixes: [
      {
        label: 'Borrow instead: return `&str`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`as_deref` turns `&Option<String>` into `Option<&str>`, and `unwrap_or` falls back to the name. Nothing is moved or allocated, and the `match` disappears.',
        code: code`
          struct Customer {
              name: String,
              nickname: Option<String>,
          }

          impl Customer {
              fn display_name(&self) -> &str {
                  self.nickname.as_deref().unwrap_or(&self.name)
              }
          }

          fn main() {
              let ada = Customer { name: String::from("Ada Lovelace"), nickname: Some(String::from("Ada")) };
              println!("{}", ada.display_name());
          }
        `,
      },
      {
        label: 'Clone the option first',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Correct, and sometimes the caller really needs an owned `String`. But it allocates on every call to produce something the caller will usually only print. Prefer returning `&str` and let the caller call `to_string()` if it must.',
        code: code`
          struct Customer {
              name: String,
              nickname: Option<String>,
          }

          impl Customer {
              fn display_name(&self) -> String {
                  self.nickname.clone().unwrap_or_else(|| self.name.clone())
              }
          }

          fn main() {
              let ada = Customer { name: String::from("Ada Lovelace"), nickname: Some(String::from("Ada")) };
              println!("{}", ada.display_name());
          }
        `,
      },
      {
        label: 'Take `&mut self`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Same error. An exclusive borrow is still a borrow: you may change the field, but you may not move its value out and leave nothing behind. rustc reports E0507 again.',
        code: code`
          struct Customer {
              name: String,
              nickname: Option<String>,
          }

          impl Customer {
              fn display_name(&mut self) -> String {
                  match self.nickname {
                      Some(nickname) => nickname,
                      None => self.name.clone(),
                  }
              }
          }

          fn main() {
              let mut ada = Customer { name: String::from("Ada Lovelace"), nickname: Some(String::from("Ada")) };
              println!("{}", ada.display_name());
          }
        `,
      },
    ],
  },
  {
    id: 'or-non-exhaustive-match',
    track: 'option-result',
    title: 'A new error variant nobody handled',
    csharpReflex: 'Adding `RateLimitedException` never breaks an existing `catch` chain. Unhandled cases fall through to the global exception middleware as a 500.',
    code: code`
      #[derive(Debug)]
      enum PaymentError {
          CardDeclined { code: String },
          GatewayUnavailable,
          RateLimited { retry_after_secs: u64 },
      }

      fn status_code(error: &PaymentError) -> u16 {
          match error {
              PaymentError::CardDeclined { .. } => 402,
              PaymentError::GatewayUnavailable => 503,
          }
      }

      fn main() {
          let error = PaymentError::RateLimited { retry_after_secs: 30 };
          println!("{} {error:?}", status_code(&error));
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0004',
    message: `error[E0004]: non-exhaustive patterns: \`&PaymentError::RateLimited { .. }\` not covered
  --> src/main.rs:9:11
   |
 9 |     match error {
   |           ^^^^^ pattern \`&PaymentError::RateLimited { .. }\` not covered
   |
note: \`PaymentError\` defined here
  --> src/main.rs:2:6
   |
 2 | enum PaymentError {
   |      ^^^^^^^^^^^^
...
 5 |     RateLimited { retry_after_secs: u64 },
   |     ----------- not covered
   = note: the matched value is of type \`&PaymentError\`
help: ensure that all possible cases are being handled by adding a match arm with a wildcard pattern or an explicit pattern as shown
   |
11 ~         PaymentError::GatewayUnavailable => 503,
12 ~         &PaymentError::RateLimited { .. } => todo!(),
   |`,
    options: [
      {
        text: 'The `match` does not cover `RateLimited`, and a `match` must handle every variant of the enum.',
        correct: true,
        why: 'Exhaustiveness is checked at compile time. rustc names the missing pattern and offers to add an arm. This is the point of an error enum: adding a variant shows you every place that has to decide what it means.',
      },
      {
        text: 'Not every code path returns a value, like CS0161: the function needs a `return` after the `match`.',
        why: 'The `match` is the function\'s final expression, so its value is the return value. The only path that does not produce a `u16` is the variant with no arm, which is what the error is about.',
      },
      {
        text: 'The `match` is on `&PaymentError`, so the arms need `&PaymentError::...` or the scrutinee needs `*error`.',
        why: 'Match ergonomics handle this: matching a reference against non-reference patterns binds through the reference. With the missing arm added, the code compiles as written.',
      },
      {
        text: '`CardDeclined { .. }` is invalid: struct variants have to name all their fields in a pattern.',
        why: '`..` ignores the remaining fields, and it is the normal way to match a variant when you do not need its data.',
      },
    ],
    fixes: [
      {
        label: 'Handle the new variant explicitly',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Rate limiting maps to 429. The next variant someone adds will fail to compile here too, which is what you want from an HTTP status mapping.',
        code: code`
          #[derive(Debug)]
          enum PaymentError {
              CardDeclined { code: String },
              GatewayUnavailable,
              RateLimited { retry_after_secs: u64 },
          }

          fn status_code(error: &PaymentError) -> u16 {
              match error {
                  PaymentError::CardDeclined { .. } => 402,
                  PaymentError::GatewayUnavailable => 503,
                  PaymentError::RateLimited { .. } => 429,
              }
          }

          fn main() {
              let error = PaymentError::RateLimited { retry_after_secs: 30 };
              println!("{} {error:?}", status_code(&error));
          }
        `,
      },
      {
        label: 'Add a wildcard arm',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles, and rate-limited payments now return 500 instead of 429. The wildcard is `catch (Exception)`: it also swallows every variant added later, so the compiler can no longer point you at this function.',
        code: code`
          #[derive(Debug)]
          enum PaymentError {
              CardDeclined { code: String },
              GatewayUnavailable,
              RateLimited { retry_after_secs: u64 },
          }

          fn status_code(error: &PaymentError) -> u16 {
              match error {
                  PaymentError::CardDeclined { .. } => 402,
                  PaymentError::GatewayUnavailable => 503,
                  _ => 500,
              }
          }

          fn main() {
              let error = PaymentError::RateLimited { retry_after_secs: 30 };
              println!("{} {error:?}", status_code(&error));
          }
        `,
      },
      {
        label: 'Match the variant like a unit case',
        verdict: 'wrong',
        expect: 'fails',
        note: '`RateLimited` has fields, so the pattern needs braces: `RateLimited { .. }`. Written like `GatewayUnavailable`, it is a different error.',
        code: code`
          #[derive(Debug)]
          enum PaymentError {
              CardDeclined { code: String },
              GatewayUnavailable,
              RateLimited { retry_after_secs: u64 },
          }

          fn status_code(error: &PaymentError) -> u16 {
              match error {
                  PaymentError::CardDeclined { .. } => 402,
                  PaymentError::GatewayUnavailable => 503,
                  PaymentError::RateLimited => 429,
              }
          }

          fn main() {
              let error = PaymentError::RateLimited { retry_after_secs: 30 };
              println!("{} {error:?}", status_code(&error));
          }
        `,
      },
    ],
  },
  {
    id: 'or-question-in-unit-fn',
    track: 'option-result',
    title: 'Using ? in a function that returns nothing',
    csharpReflex: 'A `void` method can let an `IOException` propagate. The signature does not have to change for a call inside it to fail.',
    code: code`
      use std::fs;

      fn load_allowed_origins(path: &str) {
          let text = fs::read_to_string(path)?;
          for origin in text.lines() {
              println!("allowing {origin}");
          }
      }

      fn main() {
          load_allowed_origins("cors-origins.txt");
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0277',
    message: `error[E0277]: the \`?\` operator can only be used in a function that returns \`Result\` or \`Option\` (or another type that implements \`FromResidual\`)
 --> src/main.rs:4:40
  |
3 | fn load_allowed_origins(path: &str) {
  | ----------------------------------- this function should return \`Result\` or \`Option\` to accept \`?\`
4 |     let text = fs::read_to_string(path)?;
  |                                        ^ cannot use the \`?\` operator in a function that returns \`()\`
  |
help: consider adding return type
  |
3 | fn load_allowed_origins(path: &str) -> Result<(), Box<dyn std::error::Error>> {
  |                                     +++++++++++++++++++++++++++++++++++++++++`,
    options: [
      {
        text: '`?` returns the error from the enclosing function, and `load_allowed_origins` returns `()`, which cannot hold an `io::Error`.',
        correct: true,
        why: '`?` expands to an early `return Err(...)`. A function returning `()` has nowhere to put the error. rustc says `?` can only be used in a function that returns `Result` or `Option`, and suggests changing the return type.',
      },
      {
        text: '`?` has to be inside a `try` block, or in `main`, where errors are handled.',
        why: 'There are no `try` blocks in stable Rust, and `?` is not tied to a handler. It works in any function whose return type can carry the error, including `main` if `main` returns `Result`.',
      },
      {
        text: '`read_to_string` returns `io::Result`, which is a different type from `Result`, and `?` only works with `std::result::Result`.',
        why: '`io::Result<T>` is a type alias for `Result<T, io::Error>`. `?` works on it exactly like any other `Result`. The problem is the function you are returning from, not the value you are applying `?` to.',
      },
    ],
    fixes: [
      {
        label: 'Return `io::Result<()>` and handle it in `main`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The signature now admits the function can fail, `Ok(())` marks success, and the caller chooses what a missing file means. Here that is a warning and an empty allow-list.',
        code: code`
          use std::fs;
          use std::io;

          fn load_allowed_origins(path: &str) -> io::Result<()> {
              let text = fs::read_to_string(path)?;
              for origin in text.lines() {
                  println!("allowing {origin}");
              }
              Ok(())
          }

          fn main() {
              if let Err(e) = load_allowed_origins("cors-origins.txt") {
                  eprintln!("no CORS origins loaded: {e}");
              }
          }
        `,
      },
      {
        label: 'Unwrap instead of propagating',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles, and crashes the process if the file is missing. Acceptable in a one-off script or a test. In a service, a missing optional file should not take everything down.',
        code: code`
          use std::fs;

          fn load_allowed_origins(path: &str) {
              let text = fs::read_to_string(path).expect("cors-origins.txt must exist");
              for origin in text.lines() {
                  println!("allowing {origin}");
              }
          }

          fn main() {
              load_allowed_origins("cors-origins.txt");
          }
        `,
      },
      {
        label: 'Convert to `Option` with `.ok()?`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Throwing away the error does not help: `?` on an `Option` still has to return `None` from the function, and `()` cannot hold that either. Still E0277.',
        code: code`
          use std::fs;

          fn load_allowed_origins(path: &str) {
              let text = fs::read_to_string(path).ok()?;
              for origin in text.lines() {
                  println!("allowing {origin}");
              }
          }

          fn main() {
              load_allowed_origins("cors-origins.txt");
          }
        `,
      },
    ],
  },
  {
    id: 'or-question-option-in-result',
    track: 'option-result',
    title: 'Using ? on an Option inside a Result function',
    csharpReflex: '`emails[customerId]` either returns the value or throws. The failure path takes care of itself.',
    code: code`
      use std::collections::HashMap;

      struct Order {
          id: u32,
          customer_id: u32,
      }

      fn receipt_recipient(order: &Order, emails: &HashMap<u32, String>) -> Result<String, String> {
          let email = emails.get(&order.customer_id)?;
          Ok(format!("{email} (order {})", order.id))
      }

      fn main() {
          let emails = HashMap::from([(42, String::from("ada@contoso.com"))]);
          let order = Order { id: 1001, customer_id: 7 };
          println!("{:?}", receipt_recipient(&order, &emails));
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0277',
    message: `error[E0277]: the \`?\` operator can only be used on \`Result\`s, not \`Option\`s, in a function that returns \`Result\`
 --> src/main.rs:9:47
  |
8 | fn receipt_recipient(order: &Order, emails: &HashMap<u32, String>) -> Result<String, String> {
  | -------------------------------------------------------------------------------------------- this function returns a \`Result\`
9 |     let email = emails.get(&order.customer_id)?;
  |                                               ^ use \`.ok_or(...)?\` to provide an error compatible with \`Result<String, String>\``,
    options: [
      {
        text: '`get` returns an `Option`, and `?` cannot turn `None` into the function\'s `String` error, because `None` carries no error to convert.',
        correct: true,
        why: 'rustc says `?` can only be used on `Result`s in a function that returns `Result`. There is no automatic `From` from "nothing" to your error type. You have to say what the error is, with `ok_or` or `ok_or_else`.',
      },
      {
        text: '`?` cannot be applied to a reference: `get` returns `&String`, so it needs `.cloned()` first.',
        why: '`get` returns `Option<&String>`, and `?` works on options of references. Adding `.cloned()` gives `Option<String>`, which fails with the same error.',
      },
      {
        text: 'The function needs `impl From<Option<&String>> for String` so that `?` can convert the missing value.',
        why: '`?` on `Result` uses `From` on the error type, but `?` on `Option` does not go through `From` at all, and you could not add that impl anyway: both types are defined in `std`.',
      },
    ],
    fixes: [
      {
        label: 'Name the error with `ok_or_else`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`ok_or_else` turns `Option<T>` into `Result<T, E>` with an error you choose, built only when the value is missing. After that, `?` works as usual.',
        code: code`
          use std::collections::HashMap;

          struct Order {
              id: u32,
              customer_id: u32,
          }

          fn receipt_recipient(order: &Order, emails: &HashMap<u32, String>) -> Result<String, String> {
              let email = emails
                  .get(&order.customer_id)
                  .ok_or_else(|| format!("no email on file for customer {}", order.customer_id))?;
              Ok(format!("{email} (order {})", order.id))
          }

          fn main() {
              let emails = HashMap::from([(42, String::from("ada@contoso.com"))]);
              let order = Order { id: 1001, customer_id: 7 };
              println!("{:?}", receipt_recipient(&order, &emails));
          }
        `,
      },
      {
        label: 'Make the function return `Option`',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles, and the caller gets `None` with no idea why. Fine for a pure lookup. Once the function can fail for more than one reason, the reason matters and `Option` cannot carry it.',
        code: code`
          use std::collections::HashMap;

          struct Order {
              id: u32,
              customer_id: u32,
          }

          fn receipt_recipient(order: &Order, emails: &HashMap<u32, String>) -> Option<String> {
              let email = emails.get(&order.customer_id)?;
              Some(format!("{email} (order {})", order.id))
          }

          fn main() {
              let emails = HashMap::from([(42, String::from("ada@contoso.com"))]);
              let order = Order { id: 1001, customer_id: 7 };
              println!("{:?}", receipt_recipient(&order, &emails));
          }
        `,
      },
      {
        label: 'Index the map like a `Dictionary`',
        verdict: 'wrong',
        expect: 'panics',
        note: 'Compiles, because `HashMap` indexing returns the value directly. For a missing key it panics, the way the `Dictionary` indexer throws `KeyNotFoundException`, except a panic is not meant to be caught and handled. The `Result` in the signature is now a lie.',
        code: code`
          use std::collections::HashMap;

          struct Order {
              id: u32,
              customer_id: u32,
          }

          fn receipt_recipient(order: &Order, emails: &HashMap<u32, String>) -> Result<String, String> {
              let email = &emails[&order.customer_id];
              Ok(format!("{email} (order {})", order.id))
          }

          fn main() {
              let emails = HashMap::from([(42, String::from("ada@contoso.com"))]);
              let order = Order { id: 1001, customer_id: 7 };
              println!("{:?}", receipt_recipient(&order, &emails));
          }
        `,
      },
    ],
  },
  {
    id: 'or-question-missing-from',
    track: 'option-result',
    title: 'An error type ? cannot convert',
    csharpReflex: 'Any exception can propagate through any method. A new kind of failure inside a method does not require touching its declaration.',
    code: code`
      use std::fs;
      use std::num::ParseIntError;

      #[derive(Debug)]
      enum PoolConfigError {
          NotANumber(ParseIntError),
      }

      impl From<ParseIntError> for PoolConfigError {
          fn from(e: ParseIntError) -> Self {
              PoolConfigError::NotANumber(e)
          }
      }

      fn max_connections(path: &str) -> Result<u32, PoolConfigError> {
          let text = fs::read_to_string(path)?;
          let max = text.trim().parse()?;
          Ok(max)
      }

      fn main() {
          println!("{:?}", max_connections("pool.conf"));
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0277',
    message: `error[E0277]: \`?\` couldn't convert the error to \`PoolConfigError\`
  --> src/main.rs:16:40
   |
15 | fn max_connections(path: &str) -> Result<u32, PoolConfigError> {
   |                                   ---------------------------- expected \`PoolConfigError\` because of this
16 |     let text = fs::read_to_string(path)?;
   |                ------------------------^ the trait \`From<std::io::Error>\` is not implemented for \`PoolConfigError\`
   |                |
   |                this can't be annotated with \`?\` because it has type \`Result<_, std::io::Error>\`
   |
note: \`PoolConfigError\` needs to implement \`From<std::io::Error>\`
  --> src/main.rs:5:1
   |
 5 | enum PoolConfigError {
   | ^^^^^^^^^^^^^^^^^^^^
   = note: the question mark operation (\`?\`) implicitly performs a conversion on the error value using the \`From\` trait
help: the trait \`From<std::io::Error>\` is not implemented for \`PoolConfigError\`
      but trait \`From<ParseIntError>\` is implemented for it
  --> src/main.rs:9:1
   |
 9 | impl From<ParseIntError> for PoolConfigError {
   | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   = help: for that trait implementation, expected \`ParseIntError\`, found \`std::io::Error\``,
    options: [
      {
        text: '`read_to_string` fails with `io::Error`, and there is no `From<io::Error>` for `PoolConfigError`, so `?` has no way to convert it.',
        correct: true,
        why: '`?` calls `From::from` on the error. The `ParseIntError` on the next line has an impl and is fine. The `io::Error` does not, and rustc says the `?` could not convert the error to `PoolConfigError`.',
      },
      {
        text: '`PoolConfigError` does not implement `std::error::Error`, and `?` only works with types that do.',
        why: 'A reasonable guess from C#, where anything thrown must derive from `Exception`. `?` has no such requirement: `Result<T, String>` works with `?`. Implementing `Error` is good practice, but it would not fix this line.',
      },
      {
        text: 'The target type of `parse()` cannot be inferred, so the compiler cannot tell which error `?` should convert.',
        why: 'The `u32` comes from the return type through `Ok(max)`. The `parse` line compiles; the error points at the `read_to_string` line.',
      },
      {
        text: '`?` can only convert one error type per function, and `ParseIntError` has already claimed it.',
        why: 'There is no such limit. Each `?` does its own conversion. A function can `?` as many different error types as its error type has `From` impls for.',
      },
    ],
    fixes: [
      {
        label: 'Add a variant and a `From<io::Error>` impl',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The error enum now says both ways this can fail, callers can match on either, and both `?` operators convert automatically.',
        code: code`
          use std::fs;
          use std::io;
          use std::num::ParseIntError;

          #[derive(Debug)]
          enum PoolConfigError {
              Unreadable(io::Error),
              NotANumber(ParseIntError),
          }

          impl From<io::Error> for PoolConfigError {
              fn from(e: io::Error) -> Self {
                  PoolConfigError::Unreadable(e)
              }
          }

          impl From<ParseIntError> for PoolConfigError {
              fn from(e: ParseIntError) -> Self {
                  PoolConfigError::NotANumber(e)
              }
          }

          fn max_connections(path: &str) -> Result<u32, PoolConfigError> {
              let text = fs::read_to_string(path)?;
              let max = text.trim().parse()?;
              Ok(max)
          }

          fn main() {
              println!("{:?}", max_connections("pool.conf"));
          }
        `,
      },
      {
        label: 'Return `Box<dyn Error>`',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Every standard error converts into `Box<dyn Error>`, so both `?` compile without any impls. Right for `main` or a script. In a library, callers can no longer match on what went wrong without `downcast_ref`.',
        code: code`
          use std::error::Error;
          use std::fs;

          fn max_connections(path: &str) -> Result<u32, Box<dyn Error>> {
              let text = fs::read_to_string(path)?;
              let max = text.trim().parse()?;
              Ok(max)
          }

          fn main() {
              println!("{:?}", max_connections("pool.conf"));
          }
        `,
      },
      {
        label: 'Implement `std::error::Error` for the enum',
        verdict: 'wrong',
        expect: 'fails',
        note: 'A good thing to do eventually, and irrelevant to this error. `?` still needs a `From<io::Error>`, so rustc reports the same E0277.',
        code: code`
          use std::fmt;
          use std::fs;
          use std::num::ParseIntError;

          #[derive(Debug)]
          enum PoolConfigError {
              NotANumber(ParseIntError),
          }

          impl fmt::Display for PoolConfigError {
              fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                  write!(f, "max connections is not a number")
              }
          }

          impl std::error::Error for PoolConfigError {}

          impl From<ParseIntError> for PoolConfigError {
              fn from(e: ParseIntError) -> Self {
                  PoolConfigError::NotANumber(e)
              }
          }

          fn max_connections(path: &str) -> Result<u32, PoolConfigError> {
              let text = fs::read_to_string(path)?;
              let max = text.trim().parse()?;
              Ok(max)
          }

          fn main() {
              println!("{:?}", max_connections("pool.conf"));
          }
        `,
      },
    ],
  },
];
