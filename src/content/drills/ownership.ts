import { code } from '../code.ts';
import type { Drill } from '../types.ts';

export const drills: Drill[] = [
  {
    id: 'move-in-loop',
    track: 'ownership',
    title: 'Notifying the same admin twice',
    csharpReflex: 'Passing a string to a method never costs the caller anything, so calling it in a loop is unremarkable.',
    code: code`
      fn notify(email: String) {
          println!("notifying {email}");
      }

      fn main() {
          let admin = String::from("ops@contoso.com");
          for incident in ["disk full", "cert expiring"] {
              println!("{incident}");
              notify(admin);
          }
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0382',
    message: `error[E0382]: use of moved value: \`admin\`
 --> src/main.rs:9:16
  |
6 |     let admin = String::from("ops@contoso.com");
  |         ----- move occurs because \`admin\` has type \`String\`, which does not implement the \`Copy\` trait
7 |     for incident in ["disk full", "cert expiring"] {
  |     ---------------------------------------------- inside of this loop
8 |         println!("{incident}");
9 |         notify(admin);
  |                ^^^^^ value moved here, in previous iteration of loop
  |
note: consider changing this parameter type in function \`notify\` to borrow instead if owning the value isn't necessary
 --> src/main.rs:1:18
  |
1 | fn notify(email: String) {
  |    ------        ^^^^^^ this parameter takes ownership of the value
  |    |
  |    in this function
help: consider cloning the value if the performance cost is acceptable
  |
9 |         notify(admin.clone());
  |                     ++++++++`,
    options: [
      {
        text: '`notify` takes the `String` by value, so the first iteration moves `admin` away and the second has nothing left to pass.',
        correct: true,
        why: 'The parameter type `String` means "give me ownership". Ownership can only be given once, and a loop body runs more than once. rustc points at the call and says the value was moved in a previous iteration.',
      },
      {
        text: '`admin` must be declared `let mut` before it can be used inside a loop.',
        why: 'Mutability is about changing the value. Nothing here modifies `admin`; the problem is who owns it.',
      },
      {
        text: 'The `for` loop borrows `admin`, so `notify` cannot take it while the loop runs.',
        why: 'Tempting, but the loop iterates over the array of incidents, not over `admin`. No borrow of `admin` exists; it is moved outright.',
      },
      {
        text: 'String literals cannot be turned into `String` inside a loop.',
        why: 'The `String::from` call is outside the loop and runs once. The loop only uses string literals as `&str`, which is fine.',
      },
    ],
    fixes: [
      {
        label: 'Borrow: take `&str`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`notify` only reads the address, so it should borrow. Taking `&str` rather than `&String` also accepts literals and slices.',
        code: code`
          fn notify(email: &str) {
              println!("notifying {email}");
          }

          fn main() {
              let admin = String::from("ops@contoso.com");
              for incident in ["disk full", "cert expiring"] {
                  println!("{incident}");
                  notify(&admin);
              }
          }
        `,
      },
      {
        label: 'Clone on every call',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles and prints the same thing, but allocates a new String per iteration for a function that only reads it. The signature still claims `notify` needs ownership, which misleads every future caller.',
        code: code`
          fn notify(email: String) {
              println!("notifying {email}");
          }

          fn main() {
              let admin = String::from("ops@contoso.com");
              for incident in ["disk full", "cert expiring"] {
                  println!("{incident}");
                  notify(admin.clone());
              }
          }
        `,
      },
      {
        label: 'Pass a reference without changing the signature',
        verdict: 'wrong',
        expect: 'fails',
        note: 'A `&String` is not a `String`. rustc now reports E0308, mismatched types. The fix has to happen in the signature, because the signature is what demanded ownership.',
        code: code`
          fn notify(email: String) {
              println!("notifying {email}");
          }

          fn main() {
              let admin = String::from("ops@contoso.com");
              for incident in ["disk full", "cert expiring"] {
                  println!("{incident}");
                  notify(&admin);
              }
          }
        `,
      },
    ],
  },
  {
    id: 'own-e0499',
    track: 'ownership',
    title: 'Merging a stale session into the current one',
    csharpReflex: 'Two lookups in a `Dictionary<long, Session>` return two object references. Holding both and mutating each is ordinary C#.',
    code: code`
      use std::collections::HashMap;

      struct Session {
          user: String,
          requests: u32,
      }

      fn main() {
          let mut sessions: HashMap<u64, Session> = HashMap::new();
          sessions.insert(1, Session { user: String::from("ana"), requests: 3 });
          sessions.insert(2, Session { user: String::from("ana"), requests: 5 });

          let current = sessions.get_mut(&1).unwrap();
          let stale = sessions.get_mut(&2).unwrap();
          current.requests += stale.requests;
          stale.requests = 0;
          println!("{} now has {} requests", current.user, current.requests);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0499',
    message: `error[E0499]: cannot borrow \`sessions\` as mutable more than once at a time
  --> src/main.rs:14:17
   |
13 |     let current = sessions.get_mut(&1).unwrap();
   |                   -------- first mutable borrow occurs here
14 |     let stale = sessions.get_mut(&2).unwrap();
   |                 ^^^^^^^^ second mutable borrow occurs here
15 |     current.requests += stale.requests;
   |     ---------------------------------- first borrow later used here`,
    options: [
      {
        text: '`get_mut` borrows the whole map mutably for as long as the returned reference lives, so `current` and `stale` are two live `&mut` borrows of `sessions`.',
        correct: true,
        why: 'The labels show it: first borrow on line 13, second on line 14, first still used on line 15. The checker does not know that keys 1 and 2 are different entries; it only sees two `&mut sessions`.',
      },
      {
        text: '`Session` needs to derive `Clone` before it can be modified through a reference.',
        why: 'Mutating through `&mut` needs no traits at all. `Clone` would only matter if you wanted a copy, and a copy would not update the map.',
      },
      {
        text: '`unwrap()` takes ownership of the session out of the map.',
        why: '`get_mut` returns `Option<&mut Session>`; unwrapping it gives the reference, and the session stays in the map. A move out of the map would not type-check at all.',
      },
      {
        text: 'The map must be wrapped in a `Mutex` to have two writers.',
        why: 'A `Mutex` guards against concurrent access from threads. Here there is one thread and two overlapping borrows; locking a `std::sync::Mutex` twice on one thread deadlocks or panics, it does not help.',
      },
    ],
    fixes: [
      {
        label: 'Take the stale count out first, then mutate the current session',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`std::mem::take` reads the stale count and resets it to 0 in one short borrow. Only then is the current session borrowed. Two sequential borrows instead of two overlapping ones.',
        code: code`
          use std::collections::HashMap;

          struct Session {
              user: String,
              requests: u32,
          }

          fn main() {
              let mut sessions: HashMap<u64, Session> = HashMap::new();
              sessions.insert(1, Session { user: String::from("ana"), requests: 3 });
              sessions.insert(2, Session { user: String::from("ana"), requests: 5 });

              let stale_requests = std::mem::take(&mut sessions.get_mut(&2).unwrap().requests);
              let current = sessions.get_mut(&1).unwrap();
              current.requests += stale_requests;
              println!("{} now has {} requests", current.user, current.requests);
          }
        `,
      },
      {
        label: 'Borrow both entries with `get_disjoint_mut`',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Returns two `&mut` at once and checks at runtime that the keys differ. It compiles and is sometimes necessary, but it **panics** if both keys are equal (merging a session into itself), and here a plain value was all that was needed.',
        code: code`
          use std::collections::HashMap;

          struct Session {
              user: String,
              requests: u32,
          }

          fn main() {
              let mut sessions: HashMap<u64, Session> = HashMap::new();
              sessions.insert(1, Session { user: String::from("ana"), requests: 3 });
              sessions.insert(2, Session { user: String::from("ana"), requests: 5 });

              let [current, stale] = sessions.get_disjoint_mut([&1, &2]);
              let (current, stale) = (current.unwrap(), stale.unwrap());
              current.requests += stale.requests;
              stale.requests = 0;
              println!("{} now has {} requests", current.user, current.requests);
          }
        `,
      },
      {
        label: 'Read the stale session with `get` instead',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0502 instead of E0499: a shared borrow cannot overlap a mutable one either. Weakening one of the two borrows does not help while both are alive at once.',
        code: code`
          use std::collections::HashMap;

          struct Session {
              user: String,
              requests: u32,
          }

          fn main() {
              let mut sessions: HashMap<u64, Session> = HashMap::new();
              sessions.insert(1, Session { user: String::from("ana"), requests: 3 });
              sessions.insert(2, Session { user: String::from("ana"), requests: 5 });

              let current = sessions.get_mut(&1).unwrap();
              let stale = sessions.get(&2).unwrap();
              current.requests += stale.requests;
              println!("{} now has {} requests", current.user, current.requests);
          }
        `,
      },
    ],
  },
  {
    id: 'own-e0502',
    track: 'ownership',
    title: 'Evicting expired cache entries',
    csharpReflex: 'Since .NET Core 3.0, `Dictionary.Remove` during `foreach` is allowed. Evicting while enumerating is a pattern you may have stopped thinking about.',
    code: code`
      use std::collections::HashMap;

      struct CacheEntry {
          body: String,
          expires_at: u64,
      }

      fn main() {
          let now = 1_000;
          let mut cache: HashMap<String, CacheEntry> = HashMap::new();
          cache.insert(String::from("/orders/7"), CacheEntry { body: String::from("{}"), expires_at: 900 });
          cache.insert(String::from("/orders/8"), CacheEntry { body: String::from("{}"), expires_at: 1_200 });

          for (url, entry) in &cache {
              if entry.expires_at < now {
                  cache.remove(url);
              }
          }
          println!("{} entries left", cache.len());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0502',
    message: `error[E0502]: cannot borrow \`cache\` as mutable because it is also borrowed as immutable
  --> src/main.rs:16:13
   |
14 |     for (url, entry) in &cache {
   |                         ------
   |                         |
   |                         immutable borrow occurs here
   |                         immutable borrow later used here
15 |         if entry.expires_at < now {
16 |             cache.remove(url);
   |             ^^^^^^^^^^^^^^^^^ mutable borrow occurs here`,
    options: [
      {
        text: 'The `for` loop holds a shared borrow of `cache` for the whole loop, and `remove` needs a mutable borrow in the middle of it.',
        correct: true,
        why: 'Line 14 carries both "immutable borrow occurs here" and "immutable borrow later used here": the iterator is used again on every turn of the loop, so the borrow spans the `remove` on line 16.',
      },
      {
        text: '`url` is a `&String`, and `remove` needs a `String` key.',
        why: '`remove` takes any borrowed form of the key, so `&String` is accepted. A key type problem would be E0308 or E0277, not a borrow error.',
      },
      {
        text: 'Removing during iteration is safe in .NET, so this is the borrow checker being conservative about hash maps.',
        why: 'It is not conservative here: `url` itself points into the map\'s storage. Removing that entry would free the very key being passed to `remove`, while the iterator is still walking the same table.',
      },
    ],
    fixes: [
      {
        label: 'Use `retain`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`retain` is the one-pass "remove where" that owns the iteration itself, so there is no outside borrow to conflict with. It is also the closest match to `RemoveAll(predicate)` on a `List<T>`, with the predicate inverted: `retain` keeps the entries for which it returns `true`.',
        code: code`
          use std::collections::HashMap;

          struct CacheEntry {
              body: String,
              expires_at: u64,
          }

          fn main() {
              let now = 1_000;
              let mut cache: HashMap<String, CacheEntry> = HashMap::new();
              cache.insert(String::from("/orders/7"), CacheEntry { body: String::from("{}"), expires_at: 900 });
              cache.insert(String::from("/orders/8"), CacheEntry { body: String::from("{}"), expires_at: 1_200 });

              cache.retain(|_, entry| entry.expires_at >= now);
              println!("{} entries left", cache.len());
          }
        `,
      },
      {
        label: 'Collect expired keys, then remove them',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'The classic C# workaround (`.ToList()` first) compiles here too: the shared borrow ends after `collect`, then removal starts. It clones every expired key and walks the map twice to do what `retain` does in one pass.',
        code: code`
          use std::collections::HashMap;

          struct CacheEntry {
              body: String,
              expires_at: u64,
          }

          fn main() {
              let now = 1_000;
              let mut cache: HashMap<String, CacheEntry> = HashMap::new();
              cache.insert(String::from("/orders/7"), CacheEntry { body: String::from("{}"), expires_at: 900 });
              cache.insert(String::from("/orders/8"), CacheEntry { body: String::from("{}"), expires_at: 1_200 });

              let expired: Vec<String> = cache
                  .iter()
                  .filter(|(_, entry)| entry.expires_at < now)
                  .map(|(url, _)| url.clone())
                  .collect();
              for url in &expired {
                  cache.remove(url);
              }
              println!("{} entries left", cache.len());
          }
        `,
      },
      {
        label: 'Iterate with `iter_mut` so the loop is already mutable',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0499: now the loop holds one `&mut cache` and `remove` asks for a second. Upgrading the loop\'s borrow does not give the body permission to use the map; it takes even more away.',
        code: code`
          use std::collections::HashMap;

          struct CacheEntry {
              body: String,
              expires_at: u64,
          }

          fn main() {
              let now = 1_000;
              let mut cache: HashMap<String, CacheEntry> = HashMap::new();
              cache.insert(String::from("/orders/7"), CacheEntry { body: String::from("{}"), expires_at: 900 });
              cache.insert(String::from("/orders/8"), CacheEntry { body: String::from("{}"), expires_at: 1_200 });

              for (url, entry) in cache.iter_mut() {
                  if entry.expires_at < now {
                      cache.remove(url);
                  }
              }
              println!("{} entries left", cache.len());
          }
        `,
      },
    ],
  },
  {
    id: 'own-e0506',
    track: 'ownership',
    title: 'Logging the endpoint you failed over from',
    csharpReflex: '`var failed = _endpoints.Primary; _endpoints.Primary = _endpoints.Secondary;` keeps the old string in `failed`, because C# strings are immutable references and assignment only repoints the field.',
    code: code`
      struct Endpoints {
          primary: String,
          secondary: String,
      }

      fn main() {
          let mut endpoints = Endpoints {
              primary: String::from("https://eu.api.contoso.com"),
              secondary: String::from("https://us.api.contoso.com"),
          };

          let failed = &endpoints.primary;
          endpoints.primary = endpoints.secondary.clone();
          println!("failed over from {failed} to {}", endpoints.primary);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0506',
    message: `error[E0506]: cannot assign to \`endpoints.primary\` because it is borrowed
  --> src/main.rs:13:5
   |
12 |     let failed = &endpoints.primary;
   |                  ------------------ \`endpoints.primary\` is borrowed here
13 |     endpoints.primary = endpoints.secondary.clone();
   |     ^^^^^^^^^^^^^^^^^ \`endpoints.primary\` is assigned to here but it was already borrowed
14 |     println!("failed over from {failed} to {}", endpoints.primary);
   |                                 ------ borrow later used here`,
    options: [
      {
        text: '`failed` is a reference to the `String` stored in `endpoints.primary`. Assigning a new value drops the old String, which would leave `failed` pointing at freed memory.',
        correct: true,
        why: 'In C#, `failed` would hold its own reference to the old string object. In Rust, `&endpoints.primary` points at the field itself, and assignment replaces (and drops) what is in it.',
      },
      {
        text: '`endpoints` is borrowed mutably by `clone()` on line 13.',
        why: '`clone` takes `&self`, a shared borrow of `secondary`, which does not overlap `primary`. The `^^^` is on the assignment target, not the right-hand side.',
      },
      {
        text: 'Struct fields cannot be reassigned after construction without `pub`.',
        why: 'Visibility only matters across modules. Everything here is in one module, and `let mut` already allows assignment.',
      },
    ],
    fixes: [
      {
        label: 'Swap the value out with `mem::replace`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`std::mem::replace` puts the new value in and hands back the old one, owned. `failed` is now a `String` nobody else can change. No copy of the old URL is made.',
        code: code`
          struct Endpoints {
              primary: String,
              secondary: String,
          }

          fn main() {
              let mut endpoints = Endpoints {
                  primary: String::from("https://eu.api.contoso.com"),
                  secondary: String::from("https://us.api.contoso.com"),
              };

              let failed = std::mem::replace(&mut endpoints.primary, endpoints.secondary.clone());
              println!("failed over from {failed} to {}", endpoints.primary);
          }
        `,
      },
      {
        label: 'Clone the old endpoint first',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles and mirrors the C# code most closely. It allocates a copy of a string that was about to be dropped anyway; `mem::replace` reuses it.',
        code: code`
          struct Endpoints {
              primary: String,
              secondary: String,
          }

          fn main() {
              let mut endpoints = Endpoints {
                  primary: String::from("https://eu.api.contoso.com"),
                  secondary: String::from("https://us.api.contoso.com"),
              };

              let failed = endpoints.primary.clone();
              endpoints.primary = endpoints.secondary.clone();
              println!("failed over from {failed} to {}", endpoints.primary);
          }
        `,
      },
      {
        label: 'Take a `&str` instead of a `&String`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Same E0506. `as_str()` is still a borrow into the same heap buffer. Changing the kind of reference does not change what it points at.',
        code: code`
          struct Endpoints {
              primary: String,
              secondary: String,
          }

          fn main() {
              let mut endpoints = Endpoints {
                  primary: String::from("https://eu.api.contoso.com"),
                  secondary: String::from("https://us.api.contoso.com"),
              };

              let failed = endpoints.primary.as_str();
              endpoints.primary = endpoints.secondary.clone();
              println!("failed over from {failed} to {}", endpoints.primary);
          }
        `,
      },
    ],
  },
  {
    id: 'own-e0597',
    track: 'ownership',
    title: 'Remembering the last imported customer',
    csharpReflex: 'Assigning an element of a loop-local `List<string>` to an outer variable keeps that string alive. The list can go out of scope; its elements are separate objects.',
    code: code`
      fn main() {
          let batches = ["ana,li,noor", "sam"];
          let mut last_customer: Option<&str> = None;

          for batch in batches {
              let names: Vec<String> = batch.split(',').map(|n| n.trim().to_uppercase()).collect();
              last_customer = names.last().map(|n| n.as_str());
          }

          println!("last customer imported: {last_customer:?}");
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0597',
    message: `error[E0597]: \`names\` does not live long enough
  --> src/main.rs:7:25
   |
 6 |         let names: Vec<String> = batch.split(',').map(|n| n.trim().to_uppercase()).collect();
   |             ----- binding \`names\` declared here
 7 |         last_customer = names.last().map(|n| n.as_str());
   |                         ^^^^^ borrowed value does not live long enough
 8 |     }
   |     - \`names\` dropped here while still borrowed
 9 |
10 |     println!("last customer imported: {last_customer:?}");
   |                                        ------------- borrow later used here`,
    options: [
      {
        text: '`names` is created fresh in each iteration and dropped at the end of it, but `last_customer` keeps a `&str` into it until line 10.',
        correct: true,
        why: 'The error draws the whole lifetime: declared on line 6, borrowed on line 7, dropped on line 8 (the `}`), used on line 10. The strings are owned by the Vec, and the Vec dies with the loop body.',
      },
      {
        text: '`last_customer` is declared outside the loop, so it cannot be assigned inside it.',
        why: 'Assigning an outer `let mut` inside a loop is fine. The problem is what the assigned value points at.',
      },
      {
        text: '`to_uppercase()` returns a temporary that is dropped at the end of line 6.',
        why: 'Its result is moved into the Vec by `collect`, so it lives as long as `names`. A dropped temporary would be E0716, and the error names `names`, not a temporary.',
      },
    ],
    fixes: [
      {
        label: 'Keep an owned String',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Make the outer variable own its value and move the last name out of the Vec with `pop`. No clone: the Vec was about to be dropped anyway.',
        code: code`
          fn main() {
              let batches = ["ana,li,noor", "sam"];
              let mut last_customer: Option<String> = None;

              for batch in batches {
                  let mut names: Vec<String> = batch.split(',').map(|n| n.trim().to_uppercase()).collect();
                  last_customer = names.pop();
              }

              println!("last customer imported: {last_customer:?}");
          }
        `,
      },
      {
        label: 'Keep every batch alive outside the loop',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Hoisting the owners out of the loop makes the reference valid, and holds every imported name in memory to remember one of them. This is the "make the owner outlive the borrow" fix applied where ownership was the better answer.',
        code: code`
          fn main() {
              let batches = ["ana,li,noor", "sam"];
              let mut imported: Vec<Vec<String>> = Vec::new();

              for batch in batches {
                  imported.push(batch.split(',').map(|n| n.trim().to_uppercase()).collect());
              }

              let last_customer = imported.last().and_then(|names| names.last()).map(|n| n.as_str());
              println!("last customer imported: {last_customer:?}");
          }
        `,
      },
      {
        label: 'Clone the name, then borrow the clone',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0716: the clone is a temporary dropped at the end of line 7, and `as_deref` borrows from it. Cloning into a value nobody owns trades one "does not live long enough" for another. The outer variable\'s type has to change to `Option<String>`.',
        code: code`
          fn main() {
              let batches = ["ana,li,noor", "sam"];
              let mut last_customer: Option<&str> = None;

              for batch in batches {
                  let names: Vec<String> = batch.split(',').map(|n| n.trim().to_uppercase()).collect();
                  last_customer = names.last().cloned().as_deref();
              }

              println!("last customer imported: {last_customer:?}");
          }
        `,
      },
    ],
  },
  {
    id: 'own-e0507',
    track: 'ownership',
    title: 'Returning the primary contact by index',
    csharpReflex: '`return account.Contacts[0];` returns a reference to the same string the list holds. Indexing never removes anything or transfers anything.',
    code: code`
      struct Account {
          name: String,
          contacts: Vec<String>,
      }

      fn primary_contact(account: &Account) -> String {
          account.contacts[0]
      }

      fn main() {
          let account = Account {
              name: String::from("Contoso"),
              contacts: vec![String::from("ana@contoso.com"), String::from("li@contoso.com")],
          };
          let contact = primary_contact(&account);
          println!("emailing {contact} about {}", account.name);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0507',
    message: `error[E0507]: cannot move out of index of \`Vec<String>\`
 --> src/main.rs:7:5
  |
7 |     account.contacts[0]
  |     ^^^^^^^^^^^^^^^^^^^ move occurs because value has type \`String\`, which does not implement the \`Copy\` trait
  |
help: you can \`clone\` the value and consume it, but this might not be your desired behavior
  |
7 |     <String as Clone>::clone(&account.contacts[0])
  |     ++++++++++++++++++++++++++                   +`,
    options: [
      {
        text: 'Returning `String` means moving the element out of the Vec, but the function only has a shared borrow of the account, and a Vec cannot have a hole at index 0.',
        correct: true,
        why: '"cannot move out of index" is the key phrase. `contacts[0]` is a place inside the Vec, and using it by value would move it. A borrow cannot give away what it does not own.',
      },
      {
        text: 'Index 0 might be out of bounds, so the compiler rejects the indexing.',
        why: 'Bounds are checked at runtime: an empty Vec panics. The compiler never rejects `[0]` on a `Vec` for being possibly out of range.',
      },
      {
        text: '`account` needs to be `&mut Account` to read from its Vec.',
        why: 'Reading needs only `&`. Even with `&mut`, moving out by index is still E0507; you would need `remove` or `mem::take`, which change the account.',
      },
    ],
    fixes: [
      {
        label: 'Return a borrowed `&str`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'This is what the C# returned all along: a view of a string the list still owns. Lifetime elision ties the result to `account`, so the caller cannot keep it past the account.',
        code: code`
          struct Account {
              name: String,
              contacts: Vec<String>,
          }

          fn primary_contact(account: &Account) -> &str {
              &account.contacts[0]
          }

          fn main() {
              let account = Account {
                  name: String::from("Contoso"),
                  contacts: vec![String::from("ana@contoso.com"), String::from("li@contoso.com")],
              };
              let contact = primary_contact(&account);
              println!("emailing {contact} about {}", account.name);
          }
        `,
      },
      {
        label: 'Clone the element',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'What the `help:` suggests. Correct when the caller needs to keep the address after the account is gone; otherwise it is an allocation per call in a getter.',
        code: code`
          struct Account {
              name: String,
              contacts: Vec<String>,
          }

          fn primary_contact(account: &Account) -> String {
              account.contacts[0].clone()
          }

          fn main() {
              let account = Account {
                  name: String::from("Contoso"),
                  contacts: vec![String::from("ana@contoso.com"), String::from("li@contoso.com")],
              };
              let contact = primary_contact(&account);
              println!("emailing {contact} about {}", account.name);
          }
        `,
      },
      {
        label: 'Remove it from the Vec',
        verdict: 'wrong',
        expect: 'fails',
        note: 'E0596: cannot borrow `account.contacts` as mutable behind a `&` reference. And if it did compile, a getter would be deleting the contact. `remove` is ownership transfer with a side effect, not a read.',
        code: code`
          struct Account {
              name: String,
              contacts: Vec<String>,
          }

          fn primary_contact(account: &Account) -> String {
              account.contacts.remove(0)
          }

          fn main() {
              let account = Account {
                  name: String::from("Contoso"),
                  contacts: vec![String::from("ana@contoso.com"), String::from("li@contoso.com")],
              };
              let contact = primary_contact(&account);
              println!("emailing {contact} about {}", account.name);
          }
        `,
      },
    ],
  },
];
