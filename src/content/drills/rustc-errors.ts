import { code } from '../code.ts';
import type { Drill } from '../types.ts';

export const drills: Drill[] = [
  {
    id: 'err-e0505',
    track: 'rustc-errors',
    title: 'Archiving orders while still pointing at one',
    csharpReflex: 'Passing a `List<Order>` to another method leaves every local variable that points into it valid. The GC keeps the orders alive for as long as anything references them.',
    code: code`
      struct Order {
          id: u32,
          total_cents: i64,
      }

      fn archive(orders: Vec<Order>) {
          println!("archived {} orders", orders.len());
      }

      fn main() {
          let orders = vec![Order { id: 7, total_cents: 12_500 }, Order { id: 8, total_cents: 900 }];
          let largest = orders.iter().max_by_key(|o| o.total_cents).unwrap();
          archive(orders);
          println!("largest was order {}", largest.id);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0505',
    message: `error[E0505]: cannot move out of \`orders\` because it is borrowed
  --> src/main.rs:13:13
   |
11 |     let orders = vec![Order { id: 7, total_cents: 12_500 }, Order { id: 8, total_cents: 900 }];
   |         ------ binding \`orders\` declared here
12 |     let largest = orders.iter().max_by_key(|o| o.total_cents).unwrap();
   |                   ------ borrow of \`orders\` occurs here
13 |     archive(orders);
   |             ^^^^^^ move out of \`orders\` occurs here
14 |     println!("largest was order {}", largest.id);
   |                                      ---------- borrow later used here`,
    options: [
      {
        text: '`largest` borrows from `orders`, and `archive` takes ownership of `orders` (and frees it) while that borrow is still needed on line 14.',
        correct: true,
        why: 'Read the three labels in order: borrow on line 12, move on line 13, "borrow later used here" on line 14. A move is only illegal while a borrow is alive, and the last label shows what keeps it alive.',
      },
      {
        text: '`max_by_key` consumes the Vec, so `orders` is already gone before `archive` is called.',
        why: '`iter()` borrows; it does not consume. If it had, rustc would report E0382 (use after move), not E0505 (move while borrowed). The code number already rules this out.',
      },
      {
        text: '`archive` should take `&mut Vec<Order>` so that it can modify the list in place.',
        why: 'That would not compile either: `archive(&mut orders)` while `largest` is still in use is E0502, a mutable borrow during a shared one. And `archive` does not modify anything. The real conflict is the ordering on lines 13 and 14, not the parameter type.',
      },
      {
        text: '`unwrap()` returns a temporary that is dropped at the end of line 12.',
        why: 'That would be E0716, temporary dropped while borrowed. `unwrap` returns the `&Order` itself, which is fine until `orders` moves.',
      },
    ],
    fixes: [
      {
        label: 'Finish reading before handing the Vec over',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Copy the id out (a `u32` is `Copy`) and let the borrow end before the move. Most E0505s are fixed by reordering: take what you need, then give the owner away.',
        code: code`
          struct Order {
              id: u32,
              total_cents: i64,
          }

          fn archive(orders: Vec<Order>) {
              println!("archived {} orders", orders.len());
          }

          fn main() {
              let orders = vec![Order { id: 7, total_cents: 12_500 }, Order { id: 8, total_cents: 900 }];
              let largest_id = orders.iter().max_by_key(|o| o.total_cents).unwrap().id;
              archive(orders);
              println!("largest was order {largest_id}");
          }
        `,
      },
      {
        label: 'Clone the whole Vec for the archive',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles once `Order` derives `Clone`, and duplicates every order to preserve one id. This is the reflex `help:` messages nudge you toward. It hides the real question, which was only ever about line order.',
        code: code`
          #[derive(Clone)]
          struct Order {
              id: u32,
              total_cents: i64,
          }

          fn archive(orders: Vec<Order>) {
              println!("archived {} orders", orders.len());
          }

          fn main() {
              let orders = vec![Order { id: 7, total_cents: 12_500 }, Order { id: 8, total_cents: 900 }];
              let largest = orders.iter().max_by_key(|o| o.total_cents).unwrap();
              archive(orders.clone());
              println!("largest was order {}", largest.id);
          }
        `,
      },
      {
        label: 'Copy the id into a local, after the archive call',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Same E0505, with "borrow later used here" now on `largest.id` in the new `let`. Copying the id is the right idea, but it still reads through `largest` after the move. The copy has to happen before `archive(orders)`.',
        code: code`
          struct Order {
              id: u32,
              total_cents: i64,
          }

          fn archive(orders: Vec<Order>) {
              println!("archived {} orders", orders.len());
          }

          fn main() {
              let orders = vec![Order { id: 7, total_cents: 12_500 }, Order { id: 8, total_cents: 900 }];
              let largest = orders.iter().max_by_key(|o| o.total_cents).unwrap();
              archive(orders);
              let id = largest.id;
              println!("largest was order {id}");
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0515',
    track: 'rustc-errors',
    title: 'A display name that does not survive the method',
    csharpReflex: 'A property getter like `public string DisplayName => $"{Customer} (#{Id})";` builds a string and returns it. Returning something you created a line earlier is the most normal thing in C#.',
    code: code`
      struct Invoice {
          id: u32,
          customer: String,
      }

      impl Invoice {
          fn display_name(&self) -> &str {
              let name = format!("{} (#{})", self.customer, self.id);
              &name
          }
      }

      fn main() {
          let invoice = Invoice { id: 1042, customer: String::from("Contoso") };
          println!("{}", invoice.display_name());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0515',
    message: `error[E0515]: cannot return reference to local variable \`name\`
 --> src/main.rs:9:9
  |
9 |         &name
  |         ^^^^^ returns a reference to data owned by the current function`,
    options: [
      {
        text: '`name` is a `String` owned by the method and freed when it returns, so a `&str` into it would dangle. The method has to return the `String` itself.',
        correct: true,
        why: '"data owned by the current function" is the key phrase. The signature `-> &str` promises a borrow from `self`, but the text was built inside the method and belongs to nobody after it returns.',
      },
      {
        text: 'The return type needs a lifetime annotation, like `-> &\'a str`.',
        why: 'Lifetime annotations describe where a reference points; they cannot make a local live longer. With one input reference, elision already ties the result to `&self`, and `name` is not part of `self`.',
      },
      {
        text: '`format!` returns a temporary, so it needs to be stored in a `let` first.',
        why: 'It already is: `name` is a `let` binding. That advice fixes E0716 (temporary dropped while borrowed). Here the binding itself dies at the end of the method.',
      },
    ],
    fixes: [
      {
        label: 'Return an owned String',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The method creates new text, so it hands ownership to the caller. This is exactly what the C# getter did; Rust makes the allocation visible in the signature.',
        code: code`
          struct Invoice {
              id: u32,
              customer: String,
          }

          impl Invoice {
              fn display_name(&self) -> String {
                  format!("{} (#{})", self.customer, self.id)
              }
          }

          fn main() {
              let invoice = Invoice { id: 1042, customer: String::from("Contoso") };
              println!("{}", invoice.display_name());
          }
        `,
      },
      {
        label: 'Leak the string to get a `&\'static str`',
        verdict: 'works-but',
        expect: 'compiles',
        note: '`Box::leak` turns the allocation into memory that is never freed, so the reference is valid forever. It compiles and leaks one string per call. Acceptable for configuration read once at startup, never for something called per request.',
        code: code`
          struct Invoice {
              id: u32,
              customer: String,
          }

          impl Invoice {
              fn display_name(&self) -> &'static str {
                  let name = format!("{} (#{})", self.customer, self.id);
                  Box::leak(name.into_boxed_str())
              }
          }

          fn main() {
              let invoice = Invoice { id: 1042, customer: String::from("Contoso") };
              println!("{}", invoice.display_name());
          }
        `,
      },
      {
        label: 'Declare the result `\'static`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Still E0515. Writing `\'static` in the signature is a promise, not an instruction: the compiler checks the body against it and `name` is still dropped when the method returns.',
        code: code`
          struct Invoice {
              id: u32,
              customer: String,
          }

          impl Invoice {
              fn display_name(&self) -> &'static str {
                  let name = format!("{} (#{})", self.customer, self.id);
                  &name
              }
          }

          fn main() {
              let invoice = Invoice { id: 1042, customer: String::from("Contoso") };
              println!("{}", invoice.display_name());
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0716',
    track: 'rustc-errors',
    title: 'Splitting a header line nobody owns',
    csharpReflex: '`ReadHeaderLine().Split(\',\')` in C# gives you a `string[]` of new strings. Chaining calls on a returned value never leaves you holding something that has been freed.',
    code: code`
      fn read_header_line() -> String {
          String::from("order_id,customer,total")
      }

      fn main() {
          let columns: Vec<&str> = read_header_line().split(',').collect();
          println!("{} columns, first is {}", columns.len(), columns[0]);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0716',
    message: `error[E0716]: temporary value dropped while borrowed
 --> src/main.rs:6:30
  |
6 |     let columns: Vec<&str> = read_header_line().split(',').collect();
  |                              ^^^^^^^^^^^^^^^^^^                     - temporary value is freed at the end of this statement
  |                              |
  |                              creates a temporary value which is freed while still in use
7 |     println!("{} columns, first is {}", columns.len(), columns[0]);
  |                                         ------- borrow later used here
  |
help: consider using a \`let\` binding to create a longer lived value
  |
6 ~     let binding = read_header_line();
7 ~     let columns: Vec<&str> = binding.split(',').collect();
  |`,
    options: [
      {
        text: 'The `String` returned by `read_header_line()` is a temporary that is dropped at the end of line 6, but `columns` holds slices into it until line 7.',
        correct: true,
        why: 'The two labels on line 6 give the lifetime of the temporary: created at the `^^^` span, freed at the `-` under the semicolon. `split` does not copy; each `&str` points into that temporary.',
      },
      {
        text: '`collect()` cannot infer the element type, so the annotation `Vec<&str>` is wrong.',
        why: 'Inference is fine; a type problem would be E0282 or E0308. The annotation is exactly what `split` produces.',
      },
      {
        text: '`split` needs a `&str` pattern, not a `char`.',
        why: '`split` accepts a `char`, a `&str`, a closure and more. The error is about when a value is freed, not about arguments.',
      },
    ],
    fixes: [
      {
        label: 'Give the String a name',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'This is what the `help:` suggests, and here it is right. A `let` binding lives to the end of the block, so the slices into it stay valid.',
        code: code`
          fn read_header_line() -> String {
              String::from("order_id,customer,total")
          }

          fn main() {
              let header = read_header_line();
              let columns: Vec<&str> = header.split(',').collect();
              println!("{} columns, first is {}", columns.len(), columns[0]);
          }
        `,
      },
      {
        label: 'Collect owned Strings',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles, and allocates a new `String` per column to avoid naming one variable. Right when the columns must outlive the header (stored in a struct, sent to another thread), wasteful for a local parse.',
        code: code`
          fn read_header_line() -> String {
              String::from("order_id,customer,total")
          }

          fn main() {
              let columns: Vec<String> = read_header_line().split(',').map(String::from).collect();
              println!("{} columns, first is {}", columns.len(), columns[0]);
          }
        `,
      },
      {
        label: 'Clone before splitting',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Still E0716. `.clone()` produces another temporary `String`, which is dropped at the same semicolon. Cloning does not make anything live longer; only an owner does.',
        code: code`
          fn read_header_line() -> String {
              String::from("order_id,customer,total")
          }

          fn main() {
              let columns: Vec<&str> = read_header_line().clone().split(',').collect();
              println!("{} columns, first is {}", columns.len(), columns[0]);
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0106',
    track: 'rustc-errors',
    title: 'Which endpoint does the result borrow from',
    csharpReflex: 'A method taking two strings and returning one of them needs no annotation in C#. Strings are references to GC objects, and any of them can be returned.',
    code: code`
      fn pick_endpoint(primary: &str, fallback: &str) -> &str {
          if primary.is_empty() { fallback } else { primary }
      }

      fn main() {
          let configured = String::new();
          let endpoint = pick_endpoint(&configured, "https://api.contoso.com");
          println!("calling {endpoint}");
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0106',
    message: `error[E0106]: missing lifetime specifier
 --> src/main.rs:1:52
  |
1 | fn pick_endpoint(primary: &str, fallback: &str) -> &str {
  |                           ----            ----     ^ expected named lifetime parameter
  |
  = help: this function's return type contains a borrowed value, but the signature does not say whether it is borrowed from \`primary\` or \`fallback\`
help: consider introducing a named lifetime parameter
  |
1 | fn pick_endpoint<'a>(primary: &'a str, fallback: &'a str) -> &'a str {
  |                 ++++           ++                 ++          ++`,
    options: [
      {
        text: 'The returned `&str` could borrow from either parameter, and the signature does not say which, so callers cannot know how long the result is valid.',
        correct: true,
        why: 'The `help` line says it outright. Elision only works with one input reference (or `&self`). With two, you state the relationship: here, "the result lives as long as both inputs".',
      },
      {
        text: 'Functions cannot return `&str`; they must return `String`.',
        why: 'Returning `&str` is common and cheap, as long as it borrows from an input. rustc is asking for one annotation, not a different return type.',
      },
      {
        text: '`configured` is an empty `String`, which has no memory to borrow.',
        why: 'This is a signature error, reported before the body or the caller is looked at. Empty strings are ordinary values.',
      },
    ],
    fixes: [
      {
        label: 'Name the lifetime',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`\'a` says both inputs and the output share a lifetime. At the call site the compiler picks the shorter of the two, which is `configured` here. Nothing is extended; the relationship is only written down.',
        code: code`
          fn pick_endpoint<'a>(primary: &'a str, fallback: &'a str) -> &'a str {
              if primary.is_empty() { fallback } else { primary }
          }

          fn main() {
              let configured = String::new();
              let endpoint = pick_endpoint(&configured, "https://api.contoso.com");
              println!("calling {endpoint}");
          }
        `,
      },
      {
        label: 'Return an owned String',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Sidesteps lifetimes by allocating a copy of whichever string is chosen. Fine in cold configuration code; in a hot path it is an allocation per call to avoid writing `\'a` three times.',
        code: code`
          fn pick_endpoint(primary: &str, fallback: &str) -> String {
              if primary.is_empty() { fallback.to_string() } else { primary.to_string() }
          }

          fn main() {
              let configured = String::new();
              let endpoint = pick_endpoint(&configured, "https://api.contoso.com");
              println!("calling {endpoint}");
          }
        `,
      },
      {
        label: 'Mark the result `\'static`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0106 goes away and two "lifetime may not live long enough" errors (no code) take its place: rustc names the parameter lifetimes `\'1` and `\'2` and says each would have to outlive `\'static`. The parameters are not `\'static`, so neither can be returned.',
        code: code`
          fn pick_endpoint(primary: &str, fallback: &str) -> &'static str {
              if primary.is_empty() { fallback } else { primary }
          }

          fn main() {
              let configured = String::new();
              let endpoint = pick_endpoint(&configured, "https://api.contoso.com");
              println!("calling {endpoint}");
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0308',
    track: 'rustc-errors',
    title: 'Mapping a row to a DTO',
    csharpReflex: 'In C#, `Name = row.Name` copies a reference to an immutable string. There is no difference between "the string" and "a reference to the string".',
    code: code`
      struct CustomerRow {
          id: u32,
          name: String,
          email: String,
      }

      struct CustomerDto {
          name: String,
          email: String,
      }

      fn to_dto(row: &CustomerRow) -> CustomerDto {
          CustomerDto {
              name: &row.name,
              email: row.email.to_lowercase(),
          }
      }

      fn main() {
          let row = CustomerRow { id: 1, name: String::from("Ana"), email: String::from("Ana@Contoso.com") };
          let dto = to_dto(&row);
          println!("{} <{}> from row {}", dto.name, dto.email, row.id);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0308',
    message: `error[E0308]: mismatched types
  --> src/main.rs:14:15
   |
14 |         name: &row.name,
   |               ^^^^^^^^^ expected \`String\`, found \`&String\`
   |
help: consider removing the borrow
   |
14 -         name: &row.name,
14 +         name: row.name,
   |`,
    options: [
      {
        text: 'The DTO field is an owned `String`, but `&row.name` is a borrow of the row\'s string. The DTO needs its own copy, or the row has to be given up.',
        correct: true,
        why: '"expected `String`, found `&String`": expected comes from the struct definition, found from your expression. In C# those are the same thing; in Rust one owns heap memory and the other points at someone else\'s.',
      },
      {
        text: 'Follow the `help:` and remove the `&`.',
        why: 'The help is syntactically plausible and semantically wrong here: `row` is a `&CustomerRow`, so `row.name` would move a field out of a borrow. That is E0507. rustc suggests edits that fix the error in front of it, not the next one.',
      },
      {
        text: '`to_lowercase()` returns a `&str`, which makes the struct literal mismatched.',
        why: '`to_lowercase` allocates and returns a `String`, which is why line 15 is fine. The `^^^` is under line 14 only.',
      },
    ],
    fixes: [
      {
        label: 'Take the row by value and move the fields',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'If the caller is done with the row, a conversion should consume it: no copies, only moves. Keep the id first since the row is gone afterwards. When the caller still needs the row, `row.name.clone()` is the honest choice.',
        code: code`
          struct CustomerRow {
              id: u32,
              name: String,
              email: String,
          }

          struct CustomerDto {
              name: String,
              email: String,
          }

          fn into_dto(row: CustomerRow) -> CustomerDto {
              CustomerDto {
                  name: row.name,
                  email: row.email.to_lowercase(),
              }
          }

          fn main() {
              let row = CustomerRow { id: 1, name: String::from("Ana"), email: String::from("Ana@Contoso.com") };
              let id = row.id;
              let dto = into_dto(row);
              println!("{} <{}> from row {}", dto.name, dto.email, id);
          }
        `,
      },
      {
        label: 'Clone the name',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Correct when the row must survive, and a one-string allocation. It becomes a smell when every field of every DTO is cloned out of rows nobody uses again.',
        code: code`
          struct CustomerRow {
              id: u32,
              name: String,
              email: String,
          }

          struct CustomerDto {
              name: String,
              email: String,
          }

          fn to_dto(row: &CustomerRow) -> CustomerDto {
              CustomerDto {
                  name: row.name.clone(),
                  email: row.email.to_lowercase(),
              }
          }

          fn main() {
              let row = CustomerRow { id: 1, name: String::from("Ana"), email: String::from("Ana@Contoso.com") };
              let dto = to_dto(&row);
              println!("{} <{}> from row {}", dto.name, dto.email, row.id);
          }
        `,
      },
      {
        label: 'Apply the `help:` literally',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0507: cannot move out of `row.name`, which is behind a shared reference. The type error is gone and an ownership error takes its place, because the function only borrowed the row.',
        code: code`
          struct CustomerRow {
              id: u32,
              name: String,
              email: String,
          }

          struct CustomerDto {
              name: String,
              email: String,
          }

          fn to_dto(row: &CustomerRow) -> CustomerDto {
              CustomerDto {
                  name: row.name,
                  email: row.email.to_lowercase(),
              }
          }

          fn main() {
              let row = CustomerRow { id: 1, name: String::from("Ana"), email: String::from("Ana@Contoso.com") };
              let dto = to_dto(&row);
              println!("{} <{}> from row {}", dto.name, dto.email, row.id);
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0277',
    track: 'rustc-errors',
    title: 'Counting scans by SKU',
    csharpReflex: 'Any C# object can be a `Dictionary` key: `object.GetHashCode` and `Equals` always exist, and forgetting to override them is a silent bug, not a compile error.',
    code: code`
      use std::collections::HashMap;
      use std::hash::Hash;

      #[derive(Debug, PartialEq, Eq)]
      struct Sku(String);

      fn count_by<K: Hash + Eq>(keys: Vec<K>) -> HashMap<K, usize> {
          let mut counts = HashMap::new();
          for key in keys {
              *counts.entry(key).or_insert(0) += 1;
          }
          counts
      }

      fn main() {
          let scanned = vec![Sku(String::from("KB-01")), Sku(String::from("MS-02")), Sku(String::from("KB-01"))];
          let counts = count_by(scanned);
          println!("{counts:?}");
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0277',
    message: `error[E0277]: the trait bound \`Sku: Hash\` is not satisfied
  --> src/main.rs:17:27
   |
17 |     let counts = count_by(scanned);
   |                  -------- ^^^^^^^ the trait \`Hash\` is not implemented for \`Sku\`
   |                  |
   |                  required by a bound introduced by this call
   |
note: required by a bound in \`count_by\`
  --> src/main.rs:7:16
   |
 7 | fn count_by<K: Hash + Eq>(keys: Vec<K>) -> HashMap<K, usize> {
   |                ^^^^ required by this bound in \`count_by\`
help: consider annotating \`Sku\` with \`#[derive(Hash)]\`
   |
 5 + #[derive(Hash)]
 6 | struct Sku(String);
   |`,
    options: [
      {
        text: '`count_by` requires `K: Hash`, and `Sku` does not implement `Hash`. The call on line 17 is where the requirement meets the type.',
        correct: true,
        why: 'Read the `note: required by a bound in` section: it points at the `Hash` in the generic parameter list on line 7. The primary span is the argument; the reason lives in the signature.',
      },
      {
        text: '`count_by` is wrong: it should not require `Hash`, only `Eq`, like `Dictionary` in C#.',
        why: '`HashMap` needs `Hash` to place keys at all. Remove the bound and the same requirement resurfaces inside the function body, at `counts.entry(key)`. Bounds move errors around; they do not remove requirements.',
      },
      {
        text: 'Tuple structs cannot be used as map keys.',
        why: 'Any type implementing `Hash + Eq` can be a key, tuple struct or not. rustc even suggests the one-line derive.',
      },
      {
        text: '`Debug` must be removed from the derive list because it conflicts with `Hash`.',
        why: 'Derives are independent. `Debug` is what makes `{counts:?}` work.',
      },
    ],
    fixes: [
      {
        label: 'Derive Hash',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Deriving `Hash` alongside `PartialEq, Eq` keeps the two consistent automatically, which is the invariant C# asks you to maintain by hand when you override `Equals` and `GetHashCode`.',
        code: code`
          use std::collections::HashMap;
          use std::hash::Hash;

          #[derive(Debug, PartialEq, Eq, Hash)]
          struct Sku(String);

          fn count_by<K: Hash + Eq>(keys: Vec<K>) -> HashMap<K, usize> {
              let mut counts = HashMap::new();
              for key in keys {
                  *counts.entry(key).or_insert(0) += 1;
              }
              counts
          }

          fn main() {
              let scanned = vec![Sku(String::from("KB-01")), Sku(String::from("MS-02")), Sku(String::from("KB-01"))];
              let counts = count_by(scanned);
              println!("{counts:?}");
          }
        `,
      },
      {
        label: 'Count by the inner String instead',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Unwrapping to `String` keys compiles because `String: Hash`. It throws away the newtype, so a SKU and a customer name are interchangeable again. Usually a sign the derive was the fix.',
        code: code`
          use std::collections::HashMap;
          use std::hash::Hash;

          #[derive(Debug, PartialEq, Eq)]
          struct Sku(String);

          fn count_by<K: Hash + Eq>(keys: Vec<K>) -> HashMap<K, usize> {
              let mut counts = HashMap::new();
              for key in keys {
                  *counts.entry(key).or_insert(0) += 1;
              }
              counts
          }

          fn main() {
              let scanned = vec![Sku(String::from("KB-01")), Sku(String::from("MS-02")), Sku(String::from("KB-01"))];
              let counts = count_by(scanned.into_iter().map(|s| s.0).collect());
              println!("{counts:?}");
          }
        `,
      },
      {
        label: 'Loosen the bound to `K: Eq`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Still E0277, now inside `count_by` at `counts.entry(key)`, with "required by a bound in `HashMap::entry`". The requirement belongs to `HashMap`; a generic function has to repeat it in its own signature.',
        code: code`
          use std::collections::HashMap;

          #[derive(Debug, PartialEq, Eq)]
          struct Sku(String);

          fn count_by<K: Eq>(keys: Vec<K>) -> HashMap<K, usize> {
              let mut counts = HashMap::new();
              for key in keys {
                  *counts.entry(key).or_insert(0) += 1;
              }
              counts
          }

          fn main() {
              let scanned = vec![Sku(String::from("KB-01")), Sku(String::from("MS-02")), Sku(String::from("KB-01"))];
              let counts = count_by(scanned);
              println!("{counts:?}");
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0599',
    track: 'rustc-errors',
    title: 'The CSV method that exists but cannot be found',
    csharpReflex: 'An instance method you wrote is callable anywhere the type is visible. Only extension methods need a `using`, and the IDE adds it for you.',
    code: code`
      mod export {
          pub struct Order {
              pub id: u32,
              pub total_cents: i64,
          }

          pub trait ToCsv {
              fn to_csv(&self) -> String;
          }

          impl ToCsv for Order {
              fn to_csv(&self) -> String {
                  format!("{},{}", self.id, self.total_cents)
              }
          }
      }

      use export::Order;

      fn main() {
          let order = Order { id: 1042, total_cents: 12_500 };
          println!("{}", order.to_csv());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0599',
    message: `error[E0599]: no method named \`to_csv\` found for struct \`Order\` in the current scope
  --> src/main.rs:22:26
   |
 2 |     pub struct Order {
   |     ---------------- method \`to_csv\` not found for this struct
...
 8 |         fn to_csv(&self) -> String;
   |            ------ the method is available for \`Order\` here
...
22 |     println!("{}", order.to_csv());
   |                          ^^^^^^ method not found in \`Order\`
   |
   = help: items from traits can only be used if the trait is in scope
help: trait \`ToCsv\` which provides \`to_csv\` is implemented but not in scope; perhaps you want to import it
   |
 1 + use crate::export::ToCsv;
   |`,
    options: [
      {
        text: '`to_csv` is a trait method, and trait methods are only callable where the trait is in scope. `ToCsv` is never imported into `main`\'s module.',
        correct: true,
        why: 'The `help:` says "implemented but not in scope". This is the C# extension method rule (`using System.Linq;` before `.Where`) applied to every trait, including ones in your own crate.',
      },
      {
        text: '`to_csv` is private because it is not marked `pub` inside the `impl`.',
        why: 'Trait methods are as public as the trait. Writing `pub fn` inside a trait impl is itself a compile error.',
      },
      {
        text: '`Order` does not implement `ToCsv`; the impl needs to be outside the module.',
        why: 'The impl is fine where it is, and rustc says "the method is available for `Order` here". Impls apply crate-wide; only the trait name needs to be visible.',
      },
    ],
    fixes: [
      {
        label: 'Import the trait',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'One `use` line. Crates often ship a `prelude` module that imports all their traits at once for this reason.',
        code: code`
          mod export {
              pub struct Order {
                  pub id: u32,
                  pub total_cents: i64,
              }

              pub trait ToCsv {
                  fn to_csv(&self) -> String;
              }

              impl ToCsv for Order {
                  fn to_csv(&self) -> String {
                      format!("{},{}", self.id, self.total_cents)
                  }
              }
          }

          use export::{Order, ToCsv};

          fn main() {
              let order = Order { id: 1042, total_cents: 12_500 };
              println!("{}", order.to_csv());
          }
        `,
      },
      {
        label: 'Call through the full trait path',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Fully qualified syntax compiles without an import. It is the right tool when two traits define the same method name; as a way to avoid a `use`, it only makes call sites noisier.',
        code: code`
          mod export {
              pub struct Order {
                  pub id: u32,
                  pub total_cents: i64,
              }

              pub trait ToCsv {
                  fn to_csv(&self) -> String;
              }

              impl ToCsv for Order {
                  fn to_csv(&self) -> String {
                      format!("{},{}", self.id, self.total_cents)
                  }
              }
          }

          use export::Order;

          fn main() {
              let order = Order { id: 1042, total_cents: 12_500 };
              println!("{}", export::ToCsv::to_csv(&order));
          }
        `,
      },
      {
        label: 'Call the trait as if it were a static class',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0433: `ToCsv` is an undeclared type here. Calling it by name still needs the name to resolve. The error changes; the missing import does not.',
        code: code`
          mod export {
              pub struct Order {
                  pub id: u32,
                  pub total_cents: i64,
              }

              pub trait ToCsv {
                  fn to_csv(&self) -> String;
              }

              impl ToCsv for Order {
                  fn to_csv(&self) -> String {
                      format!("{},{}", self.id, self.total_cents)
                  }
              }
          }

          use export::Order;

          fn main() {
              let order = Order { id: 1042, total_cents: 12_500 };
              println!("{}", ToCsv::to_csv(&order));
          }
        `,
      },
    ],
  },
  {
    id: 'err-e0373',
    track: 'rustc-errors',
    title: 'A background reindex that borrows the tenant',
    csharpReflex: '`Task.Run(() => Reindex(tenant))` captures `tenant` in a closure class on the heap. The lambda can outlive the method without anyone thinking about it.',
    code: code`
      use std::thread;

      fn main() {
          let tenant = String::from("contoso");
          let worker = thread::spawn(|| {
              println!("reindexing search for {tenant}");
          });
          worker.join().unwrap();
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0373',
    message: `error[E0373]: closure may outlive the current function, but it borrows \`tenant\`, which is owned by the current function
 --> src/main.rs:5:32
  |
5 |     let worker = thread::spawn(|| {
  |                                ^^ may outlive borrowed value \`tenant\`
6 |         println!("reindexing search for {tenant}");
  |                                          ------ \`tenant\` is borrowed here
  |
note: function requires argument type to outlive \`'static\`
 --> src/main.rs:5:18
  |
5 |       let worker = thread::spawn(|| {
  |  __________________^
6 | |         println!("reindexing search for {tenant}");
7 | |     });
  | |______^
help: to force the closure to take ownership of \`tenant\` (and any other referenced variables), use the \`move\` keyword
  |
5 |     let worker = thread::spawn(move || {
  |                                ++++`,
    options: [
      {
        text: 'The closure captures `tenant` by reference, but `thread::spawn` requires a closure that can outlive `main`, so it must own what it uses.',
        correct: true,
        why: 'The note says the function "requires argument type to outlive `\'static`". A spawned thread has no link to the stack frame that started it; `join` is not something the type system can see.',
      },
      {
        text: '`String` is not thread-safe, so it cannot be used from another thread.',
        why: '`String` is `Send` and `Sync`. A thread-safety problem would be E0277 mentioning `Send`. This error is about how long the borrow lasts.',
      },
      {
        text: 'The thread is joined on line 8, so this is a false positive and needs `unsafe`.',
        why: 'The compiler does not reason about `join` calls; a panic between spawn and join could skip it. `thread::scope` is the safe API that makes the join visible to the borrow checker.',
      },
    ],
    fixes: [
      {
        label: 'Move ownership into the closure',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The `help:` is right this time. `move` makes the closure own `tenant`; `main` cannot use it afterwards. If `main` still needs it, clone before spawning or use `thread::scope`.',
        code: code`
          use std::thread;

          fn main() {
              let tenant = String::from("contoso");
              let worker = thread::spawn(move || {
                  println!("reindexing search for {tenant}");
              });
              worker.join().unwrap();
          }
        `,
      },
      {
        label: 'Wrap it in an Arc',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles, and adds atomic reference counting for a value only one thread ever reads. `Arc` earns its place when several threads share the value; for a single worker, `move` is enough.',
        code: code`
          use std::sync::Arc;
          use std::thread;

          fn main() {
              let tenant = Arc::new(String::from("contoso"));
              let for_worker = Arc::clone(&tenant);
              let worker = thread::spawn(move || {
                  println!("reindexing search for {for_worker}");
              });
              worker.join().unwrap();
          }
        `,
      },
      {
        label: 'Move a reference into the closure',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0597: `tenant` does not live long enough. `move` moved the reference, not the String, and the reference still has to be valid for `\'static`. rustc now points at the `F: Send + \'static` bound on `thread::spawn`.',
        code: code`
          use std::thread;

          fn main() {
              let tenant = String::from("contoso");
              let tenant_ref = &tenant;
              let worker = thread::spawn(move || {
                  println!("reindexing search for {tenant_ref}");
              });
              worker.join().unwrap();
          }
        `,
      },
    ],
  },
];
