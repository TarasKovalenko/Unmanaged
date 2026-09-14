import { code } from '../code.ts';
import type { Drill } from '../types.ts';

export const drills: Drill[] = [
  {
    id: 'rc-reentrant-cache',
    track: 'rc-refcell',
    title: 'A log line that crashes the price cache',
    csharpReflex: 'Calling a helper property like `Count` from inside a method of the same class is always safe; at worst it takes the same lock again, and `lock` is re-entrant.',
    code: code`
      use std::cell::RefCell;
      use std::collections::HashMap;

      struct PriceCache {
          entries: RefCell<HashMap<String, u32>>,
      }

      impl PriceCache {
          fn size(&self) -> usize {
              self.entries.borrow().len()
          }

          fn price(&self, sku: &str) -> u32 {
              let mut entries = self.entries.borrow_mut();
              if !entries.contains_key(sku) {
                  println!("loading {sku} (cache holds {})", self.size());
                  entries.insert(sku.to_string(), 1999);
              }
              entries[sku]
          }
      }

      fn main() {
          let cache = PriceCache { entries: RefCell::new(HashMap::new()) };
          println!("{}", cache.price("SKU-42"));
      }
    `,
    outcome: 'panic',
    errorCode: 'panic',
    message: `thread 'main' panicked at src/main.rs:10:22:
RefCell already mutably borrowed`,
    options: [
      {
        text: '`price` holds a `RefMut` guard in `entries` until the end of the method, and `size()` asks the same `RefCell` for a shared borrow while that guard is alive.',
        correct: true,
        why: 'The guard is a local with `Drop`, so it lives to the closing brace, not to its last use. `size()` looks harmless because it only reads, but a `borrow()` while a `RefMut` exists is exactly the conflict `RefCell` checks for. Unlike a C# `lock`, a `RefCell` is not re-entrant.',
      },
      {
        text: 'Indexing `entries[sku]` panics because the key is missing.',
        why: 'That is the `KeyNotFoundException` reflex. The key is inserted on the line before, and a missing key would panic with a different message. The panic points at the `borrow()` inside `size`.',
      },
      {
        text: 'The compiler should have rejected this; `price` needs to take `&mut self` to call `borrow_mut`.',
        why: '`borrow_mut` takes `&self`, which is the whole point of `RefCell`. Nothing here is a compile error: the aliasing check has been moved to runtime, so the mistake surfaces as a panic.',
      },
      {
        text: '`println!` cannot evaluate a method call inside its format arguments while a mutable variable is in scope.',
        why: 'Format arguments are ordinary expressions. Replace `self.size()` with a constant and the program runs fine: the problem is what `size` does, not where it is called.',
      },
    ],
    fixes: [
      {
        label: 'Use the guard you already hold',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'While `price` holds `entries`, it has full access to the map. Asking the guard for `len()` needs no second borrow. Once a method takes a guard, it should not call other methods on the same object that borrow the same cell.',
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          struct PriceCache {
              entries: RefCell<HashMap<String, u32>>,
          }

          impl PriceCache {
              fn price(&self, sku: &str) -> u32 {
                  let mut entries = self.entries.borrow_mut();
                  if !entries.contains_key(sku) {
                      println!("loading {sku} (cache holds {})", entries.len());
                      entries.insert(sku.to_string(), 1999);
                  }
                  entries[sku]
              }
          }

          fn main() {
              let cache = PriceCache { entries: RefCell::new(HashMap::new()) };
              println!("{}", cache.price("SKU-42"));
          }
        `,
      },
      {
        label: 'Drop the guard, log, then borrow again',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Runs, but the check and the insert are now two separate borrows. Any call between them that touches the cache (a load function that itself consults the cache, say) can change the answer, which is the check-then-act race from `ConcurrentDictionary` code, single-threaded.',
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          struct PriceCache {
              entries: RefCell<HashMap<String, u32>>,
          }

          impl PriceCache {
              fn size(&self) -> usize {
                  self.entries.borrow().len()
              }

              fn price(&self, sku: &str) -> u32 {
                  let missing = !self.entries.borrow().contains_key(sku);
                  if missing {
                      println!("loading {sku} (cache holds {})", self.size());
                      self.entries.borrow_mut().insert(sku.to_string(), 1999);
                  }
                  self.entries.borrow()[sku]
              }
          }

          fn main() {
              let cache = PriceCache { entries: RefCell::new(HashMap::new()) };
              println!("{}", cache.price("SKU-42"));
          }
        `,
      },
      {
        label: 'Make size() fall back when the cell is busy',
        verdict: 'wrong',
        expect: 'compiles',
        note: 'No panic, and a wrong log line: `try_borrow` fails while `price` holds the guard, so `size` reports 0 regardless of what is cached. Silencing the conflict does not remove it.',
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          struct PriceCache {
              entries: RefCell<HashMap<String, u32>>,
          }

          impl PriceCache {
              fn size(&self) -> usize {
                  self.entries.try_borrow().map(|entries| entries.len()).unwrap_or(0)
              }

              fn price(&self, sku: &str) -> u32 {
                  let mut entries = self.entries.borrow_mut();
                  if !entries.contains_key(sku) {
                      println!("loading {sku} (cache holds {})", self.size());
                      entries.insert(sku.to_string(), 1999);
                  }
                  entries[sku]
              }
          }

          fn main() {
              let cache = PriceCache { entries: RefCell::new(HashMap::new()) };
              println!("{}", cache.price("SKU-42"));
          }
        `,
      },
    ],
  },
  {
    id: 'rc-push-through-rc',
    track: 'rc-refcell',
    title: 'An audit log shared by reference',
    csharpReflex: 'Inject the same `AuditLog` instance into every service that needs it, and let each one call `Entries.Add`.',
    code: code`
      use std::rc::Rc;

      struct AuditLog {
          entries: Vec<String>,
      }

      struct OrderService {
          audit: Rc<AuditLog>,
      }

      impl OrderService {
          fn place(&self, order_id: &str) {
              self.audit.entries.push(format!("placed {order_id}"));
          }
      }

      fn main() {
          let audit = Rc::new(AuditLog { entries: Vec::new() });
          let orders = OrderService { audit: Rc::clone(&audit) };
          orders.place("ORD-1");
          println!("{:?}", audit.entries);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0596',
    message: `error[E0596]: cannot borrow data in an \`Rc\` as mutable
  --> src/main.rs:13:9
   |
13 |         self.audit.entries.push(format!("placed {order_id}"));
   |         ^^^^^^^^^^^^^^^^^^ cannot borrow as mutable
   |
   = help: trait \`DerefMut\` is required to modify through a dereference, but it is not implemented for \`Rc<AuditLog>\``,
    options: [
      {
        text: '`Rc` only gives shared access to the `AuditLog`. With more than one owner there is no way to get the exclusive `&mut` that `push` needs.',
        correct: true,
        why: '`Rc<T>` implements `Deref` but not `DerefMut`. Two handles exist (`audit` in `main` and the one in `OrderService`), so a mutable borrow through either could never be exclusive. rustc says so directly: `DerefMut` is required, and not implemented for `Rc<AuditLog>`.',
      },
      {
        text: '`place` takes `&self`; changing it to `&mut self` would allow the push.',
        why: 'Tempting, and it moves the error rather than fixing it. `&mut self` gives exclusive access to the `OrderService`, including its `Rc` field, but the `AuditLog` behind that `Rc` is still shared with `main`.',
      },
      {
        text: '`audit` in `main` must be declared `let mut`.',
        why: '`mut` on a binding lets you reassign or mutably borrow that binding. The push happens through a different handle inside `OrderService`, and even `let mut` on an `Rc` does not make the value inside it mutable.',
      },
      {
        text: '`Rc::clone` made a copy of the log, so `OrderService` is writing to a value nobody else can see.',
        why: 'That is the `ICloneable` reading of `clone`. `Rc::clone` copies the pointer and bumps a count; both handles refer to the same `AuditLog`. And the error is not about who can see the value: it says `Rc<AuditLog>` does not implement `DerefMut`.',
      },
    ],
    fixes: [
      {
        label: 'One owner, lend it as `&mut` per call',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The service only needs the log while placing an order. `main` owns it and lends it out, the signature says `place` writes to the audit log, and the borrow checker verifies there is exactly one writer at a time.',
        code: code`
          struct AuditLog {
              entries: Vec<String>,
          }

          struct OrderService;

          impl OrderService {
              fn place(&self, order_id: &str, audit: &mut AuditLog) {
                  audit.entries.push(format!("placed {order_id}"));
              }
          }

          fn main() {
              let mut audit = AuditLog { entries: Vec::new() };
              let orders = OrderService;
              orders.place("ORD-1", &mut audit);
              println!("{:?}", audit.entries);
          }
        `,
      },
      {
        label: 'Wrap it in `Rc<RefCell<AuditLog>>`',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'The literal port of constructor injection. It compiles and runs, but every `borrow_mut()` is now a potential runtime panic, `place` claims to take `&self` while writing, and nothing stops a second service from holding a guard at the wrong moment. Right when the log really must outlive any single call; a smell as the default.',
        code: code`
          use std::cell::RefCell;
          use std::rc::Rc;

          struct AuditLog {
              entries: Vec<String>,
          }

          struct OrderService {
              audit: Rc<RefCell<AuditLog>>,
          }

          impl OrderService {
              fn place(&self, order_id: &str) {
                  self.audit.borrow_mut().entries.push(format!("placed {order_id}"));
              }
          }

          fn main() {
              let audit = Rc::new(RefCell::new(AuditLog { entries: Vec::new() }));
              let orders = OrderService { audit: Rc::clone(&audit) };
              orders.place("ORD-1");
              println!("{:?}", audit.borrow().entries);
          }
        `,
      },
      {
        label: 'Take `&mut self` in `place`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Still E0596. Exclusive access to the service does not grant exclusive access to a value it shares through `Rc`.',
        code: code`
          use std::rc::Rc;

          struct AuditLog {
              entries: Vec<String>,
          }

          struct OrderService {
              audit: Rc<AuditLog>,
          }

          impl OrderService {
              fn place(&mut self, order_id: &str) {
                  self.audit.entries.push(format!("placed {order_id}"));
              }
          }

          fn main() {
              let audit = Rc::new(AuditLog { entries: Vec::new() });
              let mut orders = OrderService { audit: Rc::clone(&audit) };
              orders.place("ORD-1");
              println!("{:?}", audit.entries);
          }
        `,
      },
    ],
  },
  {
    id: 'rc-send-to-thread',
    track: 'rc-refcell',
    title: 'Sharing pricing config with a worker thread',
    csharpReflex: 'Any object reference can be captured by `Task.Run`. If the object is never modified, sharing it across threads is safe.',
    code: code`
      use std::rc::Rc;
      use std::thread;

      struct PricingConfig {
          currency: String,
          vat_percent: u32,
      }

      fn main() {
          let config = Rc::new(PricingConfig { currency: String::from("EUR"), vat_percent: 21 });
          let for_worker = Rc::clone(&config);
          let worker = thread::spawn(move || {
              println!("worker prices in {} at {}% VAT", for_worker.currency, for_worker.vat_percent);
          });
          worker.join().unwrap();
          println!("main prices in {}", config.currency);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0277',
    message: `error[E0277]: \`Rc<PricingConfig>\` cannot be sent between threads safely
   --> src/main.rs:12:32
    |
 12 |       let worker = thread::spawn(move || {
    |                    ------------- ^------
    |                    |             |
    |  __________________|_____________within this \`{closure@src/main.rs:12:32: 12:39}\`
    | |                  |
    | |                  required by a bound introduced by this call
 13 | |         println!("worker prices in {} at {}% VAT", for_worker.currency, for_worker.vat_percent);
 14 | |     });
    | |_____^ \`Rc<PricingConfig>\` cannot be sent between threads safely
    |
    = help: within \`{closure@src/main.rs:12:32: 12:39}\`, the trait \`Send\` is not implemented for \`Rc<PricingConfig>\`
note: required because it's used within this closure
   --> src/main.rs:12:32
    |
 12 |     let worker = thread::spawn(move || {
    |                                ^^^^^^^
note: required by a bound in \`spawn\`
   --> /rustc/8bab26f4f68e0e26f0bb7960be334d5b520ea452/library/std/src/thread/functions.rs:128:8
    |
125 | pub fn spawn<F, T>(f: F) -> JoinHandle<T>
    |        ----- required by a bound in this function
...
128 |     F: Send + 'static,
    |        ^^^^ required by this bound in \`spawn\``,
    options: [
      {
        text: '`Rc` updates its reference count without synchronisation, so it is not `Send`, and `thread::spawn` only accepts closures whose captures are `Send`.',
        correct: true,
        why: 'The config is never mutated, but the `Rc` count is: every clone and drop writes to it. Two threads doing that at once would corrupt the count and free the value too early or never. The type system encodes this as `Rc<T>: !Send`, and `spawn` requires `Send`.',
      },
      {
        text: '`PricingConfig` needs `#[derive(Send)]` before it can be used on another thread.',
        why: '`Send` is an auto trait: `PricingConfig` is already `Send` because `String` and `u32` are. There is no derive for it. The type that is not `Send` is the `Rc` wrapper.',
      },
      {
        text: 'The closure borrows `for_worker`, and the borrow might not outlive `main`.',
        why: 'That would be E0373, and the fix for it is `move`, which is already there. The closure owns its `Rc` handle; the problem is that the handle itself cannot change threads.',
      },
      {
        text: '`join().unwrap()` is not allowed while `config` is still in use on the main thread.',
        why: '`join` blocks until the worker finishes and returns its result. Using other values on the main thread afterwards is normal. The error points at `spawn`, not `join`.',
      },
    ],
    fixes: [
      {
        label: 'Use `Arc` for shared ownership across threads',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`Arc` is `Rc` with an atomic count, and `Arc<T>` is `Send` when `T` is `Send + Sync`. If the worker is guaranteed to finish before `main` continues, `std::thread::scope` lets it borrow `&config` with no counting at all.',
        code: code`
          use std::sync::Arc;
          use std::thread;

          struct PricingConfig {
              currency: String,
              vat_percent: u32,
          }

          fn main() {
              let config = Arc::new(PricingConfig { currency: String::from("EUR"), vat_percent: 21 });
              let for_worker = Arc::clone(&config);
              let worker = thread::spawn(move || {
                  println!("worker prices in {} at {}% VAT", for_worker.currency, for_worker.vat_percent);
              });
              worker.join().unwrap();
              println!("main prices in {}", config.currency);
          }
        `,
      },
      {
        label: 'Give the worker its own deep copy',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles because the worker owns a separate `PricingConfig`. Fine for a small struct read once. For large or frequently shared config it duplicates every string, and the two copies can drift if either side is ever allowed to change.',
        code: code`
          use std::thread;

          #[derive(Clone)]
          struct PricingConfig {
              currency: String,
              vat_percent: u32,
          }

          fn main() {
              let config = PricingConfig { currency: String::from("EUR"), vat_percent: 21 };
              let for_worker = config.clone();
              let worker = thread::spawn(move || {
                  println!("worker prices in {} at {}% VAT", for_worker.currency, for_worker.vat_percent);
              });
              worker.join().unwrap();
              println!("main prices in {}", config.currency);
          }
        `,
      },
      {
        label: 'Use `Arc<RefCell<PricingConfig>>`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Still E0277, now about `RefCell`: its borrow counter is not thread-safe either, so `RefCell<T>` is not `Sync` and `Arc<RefCell<T>>` is not `Send`. For shared mutation across threads the pair is `Arc<Mutex<T>>`; for read-only config, plain `Arc<T>`.',
        code: code`
          use std::cell::RefCell;
          use std::sync::Arc;
          use std::thread;

          struct PricingConfig {
              currency: String,
              vat_percent: u32,
          }

          fn main() {
              let config = Arc::new(RefCell::new(PricingConfig { currency: String::from("EUR"), vat_percent: 21 }));
              let for_worker = Arc::clone(&config);
              let worker = thread::spawn(move || {
                  let config = for_worker.borrow();
                  println!("worker prices in {} at {}% VAT", config.currency, config.vat_percent);
              });
              worker.join().unwrap();
              println!("main prices in {}", config.borrow().currency);
          }
        `,
      },
    ],
  },
  {
    id: 'rc-match-guard-held',
    track: 'rc-refcell',
    title: 'Get or create a session',
    csharpReflex: '`TryGetValue`, and if the session is missing, call `Create`. Reading and writing the same dictionary one after the other is routine.',
    code: code`
      use std::cell::RefCell;
      use std::collections::HashMap;

      struct SessionStore {
          sessions: RefCell<HashMap<String, String>>,
      }

      impl SessionStore {
          fn create(&self, token: &str) -> String {
              let user = format!("guest-{token}");
              self.sessions.borrow_mut().insert(token.to_string(), user.clone());
              user
          }

          fn user_for(&self, token: &str) -> String {
              match self.sessions.borrow().get(token) {
                  Some(user) => user.clone(),
                  None => self.create(token),
              }
          }
      }

      fn main() {
          let store = SessionStore { sessions: RefCell::new(HashMap::new()) };
          println!("{}", store.user_for("abc123"));
      }
    `,
    outcome: 'panic',
    errorCode: 'panic',
    message: `thread 'main' panicked at src/main.rs:11:23:
RefCell already borrowed`,
    options: [
      {
        text: 'The `Ref` created in the `match` scrutinee lives until the end of the whole `match`, so `create` calls `borrow_mut()` while the shared guard is still alive.',
        correct: true,
        why: 'Temporaries in a `match` scrutinee are kept alive for all arms, because an arm might hold a reference into them (as `Some(user)` does). In the `None` arm nothing uses the guard any more, but it has not been dropped, and `RefCell` checks live guards, not uses.',
      },
      {
        text: '`get` returned `None` for a missing token and the `match` unwrapped it.',
        why: 'The `None` arm handles the missing token. The panic is in `create`, at the `borrow_mut()` call, and says the cell is already borrowed.',
      },
      {
        text: 'A `RefCell` can only be borrowed once per method, so `user_for` and `create` cannot both borrow it.',
        why: 'Borrowing is not counted per method. Any number of sequential borrows are fine, and several `borrow()`s can even overlap. Only an overlap involving `borrow_mut()` panics.',
      },
      {
        text: '`create` should take `&mut self`, because it inserts into the map.',
        why: 'That would move the problem into the compiler: `user_for` takes `&self` and could not call a `&mut self` method. The runtime rule `RefCell` enforces is the same one, and the fix is to stop the borrows overlapping.',
      },
    ],
    fixes: [
      {
        label: 'One `borrow_mut()` and the entry API',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Lookup and insert become a single operation under a single guard, like `ConcurrentDictionary.GetOrAdd`. There is no window between the read and the write, and no second borrow to collide with.',
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          struct SessionStore {
              sessions: RefCell<HashMap<String, String>>,
          }

          impl SessionStore {
              fn user_for(&self, token: &str) -> String {
                  self.sessions
                      .borrow_mut()
                      .entry(token.to_string())
                      .or_insert_with(|| format!("guest-{token}"))
                      .clone()
              }
          }

          fn main() {
              let store = SessionStore { sessions: RefCell::new(HashMap::new()) };
              println!("{}", store.user_for("abc123"));
          }
        `,
      },
      {
        label: 'Clone the value out, then match',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'The guard is a temporary in the `let` statement and drops at the semicolon, so `create` finds the cell free. It works, at the cost of a clone on every hit and a lookup-then-insert split into two borrows. Reasonable when `create` is genuinely complex; otherwise prefer `entry`.',
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          struct SessionStore {
              sessions: RefCell<HashMap<String, String>>,
          }

          impl SessionStore {
              fn create(&self, token: &str) -> String {
                  let user = format!("guest-{token}");
                  self.sessions.borrow_mut().insert(token.to_string(), user.clone());
                  user
              }

              fn user_for(&self, token: &str) -> String {
                  let existing = self.sessions.borrow().get(token).cloned();
                  match existing {
                      Some(user) => user,
                      None => self.create(token),
                  }
              }
          }

          fn main() {
              let store = SessionStore { sessions: RefCell::new(HashMap::new()) };
              println!("{}", store.user_for("abc123"));
          }
        `,
      },
    ],
  },
];
