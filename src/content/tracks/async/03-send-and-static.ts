import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const sendAndStatic: Lesson = {
  id: 'as-send-and-static',
  title: 'Send and \'static',
  summary: 'A spawned future must own its data and be safe to move between threads. The compiler works out the second part from what you hold across each `.await`.',
  intro: [
    'C# has essentially one compile-time rule about threads and `await`: CS1996, you cannot `await` inside a `lock` statement, because `Monitor` must be released on the thread that took it. Everything else (captured `List<T>`, a `DbContext` shared across tasks, thread-static state) compiles and fails at runtime, often intermittently.',
    'Rust generalises CS1996. Every future has a type, the type records every value alive across each `.await`, and the future is `Send` only if all of those values are. `tokio::spawn` requires `Send + \'static`, so holding the wrong thing across an await becomes a compile error at the spawn call.',
  ],
  csharp: {
    filename: 'StockCache.cs',
    code: code`
      public sealed class StockCache(IWarehouseClient client)
      {
          private readonly object _gate = new();
          private readonly Dictionary<string, int> _levels = new();

          public async Task RefreshAsync(string sku)
          {
              int level = await client.GetLevelAsync(sku);
              lock (_gate)
              {
                  _levels[sku] = level;
                  // await client.AckAsync(sku); would be CS1996
              }
              await client.AckAsync(sku);
          }
      }

      // Program.cs
      await Task.WhenAll(skus.Select(sku => Task.Run(() => cache.RefreshAsync(sku))));
    `,
  },
  rust: {
    filename: 'stock_cache.rs',
    stdout: '[("GADGET-22", 63), ("WIDGET-1", 56)]',
    code: code`
      use std::collections::HashMap;
      use std::future::Future;
      use std::pin::pin;
      use std::sync::{Arc, Mutex};
      use std::task::{Context, Poll, Waker};
      use std::thread::{self, JoinHandle};

      type Levels = Arc<Mutex<HashMap<String, u32>>>;

      async fn fetch_level(sku: &str) -> u32 {
          sku.len() as u32 * 7 // stand-in for a warehouse API call
      }

      async fn ack(_sku: &str) {}

      async fn refresh(levels: Levels, sku: String) {
          let level = fetch_level(&sku).await;
          {
              let mut map = levels.lock().unwrap();
              map.insert(sku.clone(), level);
          } // guard dropped here, before the next await
          ack(&sku).await;
      }

      fn block_on<F: Future>(future: F) -> F::Output {
          let mut future = pin!(future);
          let mut cx = Context::from_waker(Waker::noop());
          loop {
              if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                  return value;
              }
          }
      }

      // The same bounds as tokio::spawn.
      fn spawn<F>(future: F) -> JoinHandle<F::Output>
      where
          F: Future + Send + 'static,
          F::Output: Send + 'static,
      {
          thread::spawn(move || block_on(future))
      }

      fn main() {
          let levels: Levels = Arc::new(Mutex::new(HashMap::new()));
          let handles: Vec<_> = ["WIDGET-1", "GADGET-22"]
              .into_iter()
              .map(|sku| spawn(refresh(Arc::clone(&levels), sku.to_string())))
              .collect();
          for handle in handles {
              handle.join().unwrap();
          }

          let mut snapshot: Vec<_> = levels.lock().unwrap().clone().into_iter().collect();
          snapshot.sort();
          println!("{snapshot:?}");
      }
    `,
  },
  links: [
    {
      csharp: [3, 4],
      rust: [8],
      note: 'The lock object and the dictionary are one value in Rust: `Mutex<HashMap<..>>`. You cannot reach the map without taking the lock. `Arc` replaces the GC so several tasks can own it.',
    },
    {
      csharp: [6],
      rust: [16],
      note: '`refresh` takes `Levels` and `String` by value rather than `&self` and `&str`. A spawned future must be `\'static`, so it owns everything it touches.',
    },
    {
      csharp: [8],
      rust: [17],
      note: 'Same first await. Nothing is locked yet, so nothing unusual is held across it.',
    },
    {
      csharp: [9, 10, 11, 13],
      rust: lines(18, 21),
      note: 'The block scope is the `lock` statement. The `MutexGuard` is dropped at the closing brace, which releases the lock.',
    },
    {
      csharp: [12],
      rust: [22],
      note: 'C# forbids `await` inside `lock` syntactically. Rust allows it, but a `std::sync::MutexGuard` alive across `.await` makes the whole future non-`Send`, and `spawn` on line 48 would refuse it. See the second break point.',
    },
    {
      csharp: [19],
      rust: lines(45, 52),
      note: '`Task.Run` accepts the lambda without asking anything of it. `spawn` checks `Send + \'static` on the future that `refresh` returns, at compile time.',
    },
  ],
  breaks: [
    {
      heading: '`\'static` means "owns its data", not "lives forever"',
      body: [
        'A C# lambda can capture a local and the GC extends its life for as long as the task needs it. A spawned task in Rust has no such safety net: the runtime may run it after the caller has returned, so the future cannot borrow anything from the caller\'s stack.',
        'A `String` or an `Arc` satisfies `\'static` because the future owns it. A `&str` pointing at the caller\'s `String` does not. This is why spawned code is full of `async move`, `.clone()` and `Arc::clone`. When you do want to borrow and wait, `std::thread::scope` exists for threads; async has no stable equivalent.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::thread::{self, JoinHandle};

          fn spawn_report(title: &str) -> JoinHandle<()> {
              thread::spawn(move || println!("building {title}"))
          }

          fn main() {
              let title = String::from("Q3 revenue");
              spawn_report(&title).join().unwrap();
          }
        `,
      },
    },
    {
      heading: '`Send` is inferred from what you hold across an `.await`',
      body: [
        'An async function\'s state machine stores every local that is still alive at a suspension point. If one of them is not `Send`, the future is not `Send`. Here the `MutexGuard` is still alive at `ack(&sku).await`, and `std::sync::MutexGuard` must be unlocked on the thread that locked it, the same reason CS1996 exists.',
        'The error is reported at the `spawn` call, not in `refresh`, with no error code: "future cannot be sent between threads safely". The note underneath names the value and the await. The fix is the scoped block in the example above, or `drop(map)` before the await.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::sync::{Arc, Mutex};
          use std::task::{Context, Poll, Waker};
          use std::thread::{self, JoinHandle};

          async fn ack(_sku: &str) {}

          async fn refresh(skus: Arc<Mutex<Vec<String>>>, sku: String) {
              let mut list = skus.lock().unwrap();
              list.push(sku.clone());
              ack(&sku).await; // the guard is still alive here
          }

          fn block_on<F: Future>(future: F) -> F::Output {
              let mut future = pin!(future);
              let mut cx = Context::from_waker(Waker::noop());
              loop {
                  if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                      return value;
                  }
              }
          }

          fn spawn<F>(future: F) -> JoinHandle<F::Output>
          where
              F: Future + Send + 'static,
              F::Output: Send + 'static,
          {
              thread::spawn(move || block_on(future))
          }

          fn main() {
              let skus = Arc::new(Mutex::new(Vec::new()));
              spawn(refresh(skus, String::from("WIDGET-1"))).join().unwrap();
          }
        `,
      },
    },
    {
      heading: '`Rc` and `RefCell` borrows break it the same way',
      body: [
        '`Rc` updates its count without synchronisation, so it is not `Send`. Holding an `Rc` across an `.await` in a spawned task gives the same error as the guard. So does a `RefCell` borrow guard, or any type containing a raw pointer.',
        'The rule is about what is alive at the await, not what the function uses. An `Rc` created, used and dropped between two awaits is fine. If a task really needs non-`Send` state, tokio has `spawn_local` on a `LocalSet`, which pins the task to one thread.',
      ],
    },
    {
      heading: 'When you need a lock across an await, use an async mutex',
      body: [
        'The C# answer to CS1996 is `SemaphoreSlim.WaitAsync`, which is not thread-affine. Rust\'s answer is `tokio::sync::Mutex`: its guard is `Send`, and `lock().await` suspends instead of blocking the worker.',
        'Prefer `std::sync::Mutex` with a short scope when the critical section contains no await. It is faster, and holding a lock across network I/O is usually a design smell in either language.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the tokio crate.',
        code: code`
          use std::sync::Arc;
          use tokio::sync::Mutex;

          async fn ack(_sku: &str) {}

          async fn refresh(skus: Arc<Mutex<Vec<String>>>, sku: String) {
              let mut list = skus.lock().await;
              list.push(sku.clone());
              ack(&sku).await; // allowed: the tokio guard is Send
          }

          #[tokio::main]
          async fn main() {
              let skus = Arc::new(Mutex::new(Vec::new()));
              tokio::spawn(refresh(skus, String::from("WIDGET-1"))).await.unwrap();
          }
        `,
      },
    },
    {
      heading: 'None of this applies until you spawn',
      body: [
        'A future that is only ever awaited or joined never crosses a thread, so it does not need to be `Send`. The program in the second break point compiles if you replace `spawn(...).join().unwrap()` with `block_on(...)`.',
        'That makes the errors feel non-local: a helper compiles for months, then someone calls `tokio::spawn` on a caller of it and the error points three functions away. Read the "used across an await" note; it always names the offending value.',
      ],
    },
  ],
  visualize: [],
  drills: ['as-borrow-into-spawn'],
  takeaways: [
    'Spawned futures must own their data (`\'static`) and be movable between threads (`Send`).',
    'A future is `Send` only if everything alive across each `.await` is `Send`.',
    'Scope `std::sync::MutexGuard` so it ends before the next `.await`.',
  ],
};
