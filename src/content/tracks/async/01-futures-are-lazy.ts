import { code } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const futuresAreLazy: Lesson = {
  id: 'as-futures-are-lazy',
  title: 'Futures are lazy',
  summary: 'Calling an `async fn` starts nothing. It returns a state machine, and nothing polls it unless you bring something that does.',
  intro: [
    'In C#, calling an async method runs its body synchronously up to the first incomplete `await`, then hands back a `Task` that is already in flight. That is why `var saving = repo.SaveAsync(order);` followed later by `await saving` works, and why `_ = SendReceiptAsync()` really sends the email.',
    'A Rust `async fn` compiles to a type that implements `Future`, and calling it only builds a value of that type. The body runs when something calls `poll`, and the standard library does not ship anything that does. Every habit that relies on "the task is already running" quietly stops working.',
  ],
  csharp: {
    filename: 'CheckoutService.cs',
    code: code`
      public sealed class CheckoutService(IOrderRepository orders, IEmailSender email)
      {
          public async Task<long> CheckoutAsync(Cart cart)
          {
              var order = Order.From(cart);
              Task saving = orders.SaveAsync(order);   // already running
              _ = email.SendReceiptAsync(order.Id);    // fire and forget
              await saving;
              Console.WriteLine($"charged {order.TotalCents} cents");
              return order.Id;
          }
      }

      // Program.cs
      var id = await checkout.CheckoutAsync(cart);
      Console.WriteLine($"order {id} placed");
    `,
  },
  rust: {
    filename: 'checkout.rs',
    stdout: 'saving order 42\ncharged 1999 cents\norder 42 placed',
    code: code`
      use std::future::Future;
      use std::pin::pin;
      use std::task::{Context, Poll, Waker};

      struct Order {
          id: u64,
          total_cents: u64,
      }

      async fn save_order(order: &Order) {
          println!("saving order {}", order.id);
      }

      async fn send_receipt(order_id: u64) {
          println!("sending receipt for {order_id}");
      }

      async fn checkout(total_cents: u64) -> u64 {
          let order = Order { id: 42, total_cents };
          let saving = save_order(&order); // not running yet
          let _ = send_receipt(order.id); // built and dropped: never runs
          saving.await; // the save runs here
          println!("charged {} cents", order.total_cents);
          order.id
      }

      // What #[tokio::main] provides, reduced to its core: poll until ready.
      fn block_on<F: Future>(future: F) -> F::Output {
          let mut future = pin!(future);
          let mut cx = Context::from_waker(Waker::noop());
          loop {
              if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                  return value;
              }
          }
      }

      fn main() {
          let id = block_on(checkout(1999));
          println!("order {id} placed");
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [18],
      note: '`async Task<long>` becomes `async fn ... -> u64`. The declared return type is what the future produces; the function itself returns an anonymous type that implements `Future<Output = u64>`.',
    },
    {
      csharp: [6],
      rust: [20],
      note: 'Same shape, different meaning. The C# `Task` is already saving. The Rust `saving` is a state machine holding a reference to `order`, and no line of `save_order` has run.',
    },
    {
      csharp: [7],
      rust: [21],
      note: '`_ =` in C# discards a running task. `let _ =` in Rust drops the future on the spot, so the receipt is never sent. It also silences the `unused implementer of Future` warning, which makes it worse than a bare call.',
    },
    {
      csharp: [8],
      rust: [22],
      note: 'In C#, `await` waits for work that already started. In Rust, `.await` is where `save_order` starts: the outer future polls the inner one, which is why "saving order 42" is the first line of output.',
    },
    {
      csharp: [9, 10],
      rust: [23, 24],
      note: 'Identical. There is no `ConfigureAwait` question: a future has no captured `SynchronizationContext` to resume on.',
    },
    {
      csharp: [15],
      rust: [39],
      note: '`Main` can be `async Task` because the C# compiler generates a synchronous entry point that calls `GetAwaiter().GetResult()` on it, and the CLR thread pool runs the continuations. Rust\'s `main` is synchronous, so something has to poll the top-level future. Here it is a hand-written `block_on`; in real code it is a runtime such as tokio.',
    },
    {
      csharp: [16],
      rust: [40],
      note: 'The output has no receipt line. That is the bug the C# version did not have.',
    },
  ],
  breaks: [
    {
      heading: 'Calling an async function is not starting it',
      body: [
        'C# developers use "call now, await later" to get concurrency for free: start two tasks, then await both. In Rust that pattern is sequential, because the second future is not polled until the first `.await` finishes. Concurrency has to be requested explicitly, by joining futures or spawning them onto a runtime.',
        'The benefit is that a future is an ordinary value. It can be stored in a struct, passed to a function, or dropped, and nothing happens until it is polled. Creating one costs no allocation and schedules nothing.',
      ],
    },
    {
      heading: '`let _ =` is not the discard you know',
      body: [
        'In C#, `_ = SendReceiptAsync()` tells the compiler and the reader "this task runs on its own, I am not observing it". CS4014 goes away and the work still happens.',
        'In Rust, `let _ = send_receipt(id);` binds nothing, so the future is dropped at the end of the statement. The call site looks like a deliberate fire-and-forget and does nothing. The equivalent of the C# intent is `tokio::spawn(send_receipt(id))`, which comes with bounds covered two lessons from now.',
      ],
    },
    {
      heading: 'There is no runtime in the box',
      body: [
        'The CLR ships the thread pool, timers, and I/O completion ports, and `Task` is wired into all of them. Rust\'s standard library defines the `Future` trait and the `async`/`.await` syntax, and stops there. No executor, no async timers, no async sockets.',
        'You add one as a dependency. Tokio is the de facto choice, and most of the async ecosystem (reqwest, sqlx, axum, tonic) assumes it.',
      ],
      code: {
        language: 'toml',
        caption: 'Cargo.toml',
        code: code`
          [dependencies]
          tokio = { version = "1", features = ["full"] }
        `,
      },
    },
    {
      heading: '`#[tokio::main]` is a macro, not an async `main`',
      body: [
        '`async fn main` on its own is rejected with E0752. The attribute rewrites your async `main` into a synchronous one that builds a runtime and blocks on your body, which is the real version of the `block_on` in the example above.',
        'Knowing the expansion matters when you need a different runtime shape: a `current_thread` runtime for a CLI, a runtime owned by a library, or a test that builds its own.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the tokio crate. This is roughly what #[tokio::main] expands to.',
        code: code`
          fn main() {
              tokio::runtime::Builder::new_multi_thread()
                  .enable_all()
                  .build()
                  .expect("failed to build the tokio runtime")
                  .block_on(async {
                      println!("running inside the runtime");
                  })
          }
        `,
      },
    },
    {
      heading: 'An unpolled future cannot fail, time out, or leak',
      body: [
        'A C# task you forget still runs, can fault with an exception that surfaces only through `TaskScheduler.UnobservedTaskException`, and holds whatever it captured until it finishes. A Rust future you forget does none of that: it is dropped like any other value and its captures are released.',
        'The rustc warning `unused implementer of Future that must be used` is the only signal you get, so treat it as an error. Many teams set `#![deny(unused_must_use)]`.',
      ],
    },
  ],
  visualize: [],
  timelines: ['task-hot-future-cold', 'as-fire-and-forget'],
  drills: ['as-future-used-as-value', 'as-recursive-async'],
  takeaways: [
    'Calling an `async fn` builds a future. The body runs when something polls it.',
    '`let _ = future;` drops the work. Detaching requires a runtime and `spawn`.',
    'The standard library has no executor. You choose one, usually tokio.',
  ],
};
