import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const interiorMutability: Lesson = {
  id: 'rc-interior-mutability',
  title: 'Mutation through a shared reference',
  summary: '`Cell` and `RefCell` let `&self` methods change state by moving the aliasing check from the compiler to a runtime counter.',
  intro: [
    'Two services injected with the same `StockLedger` singleton is ordinary .NET: checkout reserves stock, returns restock it, both through the same reference. After the last lesson you can share the ledger with `Rc`, but `Rc` only hands out `&StockLedger`, and nothing behind a `&` can change.',
    '**Interior mutability** is the sanctioned way around that. The type promises to check the shared-or-mutable rule itself, at runtime, so it can offer mutation through `&self`. It is the same rule, enforced later, with a panic instead of a compile error when you break it.',
  ],
  csharp: {
    filename: 'StockLedger.cs',
    code: code`
      public sealed class StockLedger
      {
          private readonly Dictionary<string, int> _onHand = new();
          public int Lookups { get; private set; }

          public void Receive(string sku, int qty) =>
              _onHand[sku] = _onHand.GetValueOrDefault(sku) + qty;

          public bool TryReserve(string sku, int qty)
          {
              Lookups++;
              if (_onHand.GetValueOrDefault(sku) < qty) return false;
              _onHand[sku] -= qty;
              return true;
          }
      }

      public sealed class CheckoutService(StockLedger ledger)
      {
          public bool Place(string sku, int qty) => ledger.TryReserve(sku, qty);
      }

      public sealed class ReturnsService(StockLedger ledger)
      {
          public void Restock(string sku, int qty) => ledger.Receive(sku, qty);
      }
    `,
  },
  rust: {
    filename: 'stock_ledger.rs',
    code: code`
      use std::cell::{Cell, RefCell};
      use std::collections::HashMap;
      use std::rc::Rc;

      #[derive(Default)]
      struct StockLedger {
          on_hand: RefCell<HashMap<String, u32>>,
          lookups: Cell<u32>,
      }

      impl StockLedger {
          fn receive(&self, sku: &str, qty: u32) {
              *self.on_hand.borrow_mut().entry(sku.to_string()).or_insert(0) += qty;
          }

          fn try_reserve(&self, sku: &str, qty: u32) -> bool {
              self.lookups.set(self.lookups.get() + 1);
              let mut on_hand = self.on_hand.borrow_mut();
              match on_hand.get_mut(sku) {
                  Some(available) if *available >= qty => {
                      *available -= qty;
                      true
                  }
                  _ => false,
              }
          }
      }

      struct CheckoutService {
          ledger: Rc<StockLedger>,
      }

      impl CheckoutService {
          fn place(&self, sku: &str, qty: u32) -> bool {
              self.ledger.try_reserve(sku, qty)
          }
      }

      struct ReturnsService {
          ledger: Rc<StockLedger>,
      }

      impl ReturnsService {
          fn restock(&self, sku: &str, qty: u32) {
              self.ledger.receive(sku, qty);
          }
      }

      fn main() {
          let ledger = Rc::new(StockLedger::default());
          let checkout = CheckoutService { ledger: Rc::clone(&ledger) };
          let returns = ReturnsService { ledger: Rc::clone(&ledger) };

          returns.restock("SKU-42", 3);
          println!("first order: {}", checkout.place("SKU-42", 2));
          println!("second order: {}", checkout.place("SKU-42", 2));
          println!("lookups: {}", ledger.lookups.get());
      }
    `,
    stdout: `first order: true
second order: false
lookups: 2
`,
  },
  links: [
    {
      csharp: [3],
      rust: [7],
      note: '`readonly` in C# protects the field, not the dictionary. In Rust, anything reached through `&self` is frozen, so the map sits in a `RefCell` that is allowed to hand out `&mut HashMap` at runtime.',
    },
    {
      csharp: [4],
      rust: [8],
      note: 'A plain counter does not need guards. `Cell<u32>` copies values in and out with `get` and `set`, never lends a reference, and therefore cannot panic.',
    },
    {
      csharp: [6, 7],
      rust: lines(12, 14),
      note: '`&self`, not `&mut self`: the signature says "shared access" even though it mutates. `borrow_mut()` returns a `RefMut` guard that lives until the end of the statement.',
    },
    {
      csharp: [11],
      rust: [17],
      note: '`Lookups++` becomes an explicit read and write. There is no `+=` on a `Cell`, because you never get a reference to its contents; `Cell::update` is the one-call form.',
    },
    {
      csharp: [12, 13, 14],
      rust: lines(18, 26),
      note: 'One `borrow_mut()` for the whole check-then-decrement. The guard `on_hand` is alive until the closing brace of the method, so calling another method that borrows the map in between would panic.',
    },
    {
      csharp: [18, 23],
      rust: [30, 40],
      note: 'The primary-constructor parameter is a shared reference. In Rust the sharing is a type: `Rc<StockLedger>`, cloned once per service.',
    },
    {
      csharp: [20, 25],
      rust: [34, 35, 36, 44, 45, 46],
      note: 'The services take `&self` too. Nothing in this call chain needs `&mut`, which is precisely what interior mutability buys and what it hides.',
    },
    {
      csharp: [18, 23],
      rust: lines(50, 52),
      note: 'Composition root. What the DI container did with a singleton registration, `main` does with `Rc::new` and two `Rc::clone`s.',
    },
  ],
  breaks: [
    {
      heading: 'The aliasing rule did not go away. It moved to runtime.',
      body: [
        'C# lets any number of callers mutate `_onHand` at once and trusts you. `RefCell` does not: it counts live `Ref` and `RefMut` guards and panics when a `borrow_mut()` meets any other live guard, or a `borrow()` meets a `RefMut`. It is the `List<T>` version check, applied to whatever you put in the cell.',
        'A panic here is not a recoverable exception you catch at the controller. It unwinds the thread, and in most services it is a bug report. Code that compiles cleanly can still contain this conflict, which is the real price of `RefCell`.',
      ],
      code: {
        language: 'rust',
        expect: 'panics',
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          fn main() {
              let on_hand = RefCell::new(HashMap::from([(String::from("SKU-42"), 3u32)]));
              let report = on_hand.borrow();
              on_hand.borrow_mut().insert(String::from("SKU-7"), 1);
              println!("{} skus", report.len());
          }
        `,
      },
    },
    {
      heading: 'A guard lives until it is dropped, not until its last use',
      body: [
        'Ordinary borrows end at their last use. `Ref` and `RefMut` are values with `Drop`, so they live to the end of their scope, like a `using` declaration. A named guard (`let map = cell.borrow();`) holds the cell until the closing brace, even if you never touch `map` again.',
        'Temporaries matter too. `cell.borrow().len()` drops its guard at the semicolon. A `match cell.borrow().get(key) { ... }` keeps the guard alive for the entire `match`, including arms that call back into the cell. Keep guards in short statements or explicit blocks, and `drop(guard)` when you need to end one early.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `SKU-42 had 3, now 4
`,
        code: code`
          use std::cell::RefCell;
          use std::collections::HashMap;

          fn main() {
              let on_hand = RefCell::new(HashMap::from([(String::from("SKU-42"), 3u32)]));
              let before = {
                  let map = on_hand.borrow();
                  map["SKU-42"]
              };
              *on_hand.borrow_mut().get_mut("SKU-42").unwrap() += 1;
              println!("SKU-42 had {before}, now {}", on_hand.borrow()["SKU-42"]);
          }
        `,
      },
    },
    {
      heading: '`try_borrow_mut` exists, and needing it is a signal',
      body: [
        '`try_borrow` and `try_borrow_mut` return `Result` instead of panicking, a little like `Monitor.TryEnter`. They are useful at a re-entrancy boundary, such as an event callback that may fire while the ledger is mid-update and can safely skip its work.',
        'If you reach for them to paper over a panic in ordinary code, the design has two paths mutating the same state without knowing about each other. That is a bug in C# too; `RefCell` is only the first thing to notice it.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `audit skipped: ledger busy
`,
        code: code`
          use std::cell::RefCell;

          fn audit(ledger: &RefCell<Vec<u32>>) {
              match ledger.try_borrow_mut() {
                  Ok(mut entries) => entries.push(0),
                  Err(_) => println!("audit skipped: ledger busy"),
              }
          }

          fn main() {
              let ledger = RefCell::new(vec![3, 1]);
              let mut entries = ledger.borrow_mut();
              entries.push(5);
              audit(&ledger);
              drop(entries);
          }
        `,
      },
    },
    {
      heading: '`RefCell` is not a lock. `Mutex` and `RwLock` are the threaded versions.',
      body: [
        'The counters inside `RefCell` are not atomic, so `RefCell<T>` is not `Sync` and `Rc<RefCell<T>>` cannot cross a thread boundary. The threaded equivalents are `Arc<Mutex<T>>` and `Arc<RwLock<T>>`: same shape, but a conflicting access blocks instead of panicking.',
        'Unlike `lock (_sync) { ... }`, a Rust `Mutex` owns the data. You cannot reach the dictionary without going through `lock()`, and the guard unlocks on drop. A thread that panics while holding the guard **poisons** the mutex, so later `lock()` calls return `Err` rather than silently handing out half-updated state.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `on hand: 5
`,
        code: code`
          use std::collections::HashMap;
          use std::sync::{Arc, Mutex};
          use std::thread;

          fn main() {
              let on_hand = Arc::new(Mutex::new(HashMap::from([(String::from("SKU-42"), 3u32)])));
              let workers: Vec<_> = (0..2)
                  .map(|_| {
                      let on_hand = Arc::clone(&on_hand);
                      thread::spawn(move || *on_hand.lock().unwrap().get_mut("SKU-42").unwrap() += 1)
                  })
                  .collect();
              for worker in workers {
                  worker.join().unwrap();
              }
              println!("on hand: {}", on_hand.lock().unwrap()["SKU-42"]);
          }
        `,
      },
    },
  ],
  visualize: ['refcell-double-borrow', 'rc-borrow-in-loop', 'rc-guard-scoped'],
  drills: ['rc-reentrant-cache', 'rc-match-guard-held'],
  takeaways: [
    '`Cell` for small `Copy` values, `RefCell` for everything else: both mutate through `&self`.',
    'The shared-XOR-mutable rule still applies; `RefCell` checks it at runtime and panics.',
    'Guards live until dropped. Keep them in short statements, never across calls into the same object.',
  ],
};
