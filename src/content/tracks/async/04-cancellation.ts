import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const cancellation: Lesson = {
  id: 'as-cancellation',
  title: 'Cancellation is drop',
  summary: 'There is no `CancellationToken` to thread through. Whoever polls a future can stop polling and drop it, and it ends at its current `.await`.',
  intro: [
    'In .NET, cancellation is cooperative and explicit: a `CancellationToken` parameter on every async method, `ThrowIfCancellationRequested` or an API that observes the token, and an `OperationCanceledException` that unwinds through `catch` and `finally` blocks.',
    'In Rust, a future only makes progress while it is polled. Stop polling and drop it, and it is cancelled: its state machine is destroyed at whichever `.await` it was suspended on, and every local it owned is dropped. No parameter, no exception, no way for the future to refuse.',
  ],
  csharp: {
    filename: 'InventorySync.cs',
    code: code`
      public sealed class InventorySync(IWarehouseApi api, ILogger<InventorySync> log)
      {
          public async Task<int> RunAsync(CancellationToken ct)
          {
              await using var lease = await api.AcquireLeaseAsync(ct);
              var synced = 0;
              try
              {
                  for (var page = 1; page <= 5; page++)
                      synced += await api.FetchPageAsync(page, ct);
                  return synced;
              }
              catch (OperationCanceledException)
              {
                  log.LogWarning("sync cancelled after {Count} items", synced);
                  throw;
              }
          }
      }

      // Caller
      using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
      try { Console.WriteLine($"synced {await sync.RunAsync(cts.Token)} items"); }
      catch (OperationCanceledException) { Console.WriteLine("timed out"); }
    `,
  },
  rust: {
    filename: 'inventory_sync.rs',
    stdout: 'page 1 fetched\npage 2 fetched\nlease released\ntimed out',
    code: code`
      use std::future::Future;
      use std::pin::{Pin, pin};
      use std::task::{Context, Poll, Waker};

      struct Lease;

      impl Drop for Lease {
          fn drop(&mut self) {
              println!("lease released");
          }
      }

      // Pending once, then ready: a stand-in for a network call.
      struct YieldNow(bool);

      impl Future for YieldNow {
          type Output = ();
          fn poll(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<()> {
              if self.0 {
                  return Poll::Ready(());
              }
              self.0 = true;
              Poll::Pending
          }
      }

      async fn fetch_page(page: u32) -> usize {
          YieldNow(false).await;
          println!("page {page} fetched");
          100
      }

      async fn sync_inventory() -> usize {
          let _lease = Lease;
          let mut synced = 0;
          for page in 1..=5 {
              synced += fetch_page(page).await;
          }
          synced
      }

      // Poll at most \`budget\` times, then give up: a stand-in for tokio::time::timeout.
      fn run_with_budget<F: Future>(future: F, budget: usize) -> Option<F::Output> {
          let mut future = pin!(future);
          let mut cx = Context::from_waker(Waker::noop());
          for _ in 0..budget {
              if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                  return Some(value);
              }
          }
          None
      } // an unfinished future is dropped here

      fn main() {
          match run_with_budget(sync_inventory(), 3) {
              Some(count) => println!("synced {count} items"),
              None => println!("timed out"),
          }
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [33],
      note: 'No `CancellationToken` parameter. The caller controls cancellation by controlling polling, so the function signature does not mention it.',
    },
    {
      csharp: [5],
      rust: [34],
      note: '`await using` becomes an ordinary local with a `Drop` impl. It is released on success, on panic, and on cancellation, with no `try`/`finally` in sight.',
    },
    {
      csharp: [9, 10],
      rust: lines(36, 38),
      note: 'Every `.await` is a potential cancellation point, whether or not you pass anything along. In C#, a call that ignores `ct` cannot be interrupted; in Rust, every await can be.',
    },
    {
      csharp: [13, 14, 15, 16],
      rust: lines(5, 11),
      note: 'There is no exception to catch. The only code that runs on cancellation is destructors, and `drop` cannot be async or return an error. Logging "cancelled after N items" needs a guard type that holds the count.',
    },
    {
      csharp: [22],
      rust: lines(42, 52),
      note: '`CancellationTokenSource(TimeSpan)` becomes a wrapper that stops polling. `tokio::time::timeout(duration, future)` does this with a real clock and returns `Err(Elapsed)`.',
    },
    {
      csharp: [23, 24],
      rust: lines(55, 58),
      note: 'The caller sees `None` instead of catching `OperationCanceledException`. Note the output order: "lease released" prints before "timed out", because the future is dropped when `run_with_budget` returns.',
    },
  ],
  breaks: [
    {
      heading: 'Cancellation happens at an `.await`, and only there',
      body: [
        'Between two awaits, a future runs uninterrupted, exactly like C# code between two token checks. A CPU-heavy loop with no `.await` inside cannot be cancelled by dropping, because nothing gets a chance to drop it until the loop returns control.',
        'The difference is the default. A C# method that forgets to pass `ct` to one call is uncancellable at that call. A Rust future is cancellable at every await, whether the author planned for it or not.',
      ],
    },
    {
      heading: 'No `OperationCanceledException`, so no `catch` and no `finally`',
      body: [
        'C# cleanup on cancellation is `finally`, `using`, or a `catch (OperationCanceledException)` that logs and rethrows. None of those exist for a dropped future. The future is not resumed with an error; it is destroyed, and its locals are dropped in reverse order.',
        'That makes `Drop` the only cleanup hook, and `Drop` is synchronous and infallible. Anything that needs to await during shutdown, such as flushing a buffer to a socket or rolling back a transaction, has to happen before the future is dropped, which usually means cooperative shutdown instead of dropping.',
      ],
    },
    {
      heading: 'Half-finished work is not rolled back',
      body: [
        'If a future has done step one and is suspended before step two, dropping it leaves step one done. Here an order is taken off the queue, then the future is cancelled at the await before it is forwarded. The order is gone from both places.',
        'Tokio documents which of its methods are **cancel safe** for this reason. In C# the same bug exists, but cancellation arrives only where you passed the token, so it is rarer and more visible.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: 'still queued: ["order-1"]',
        code: code`
          use std::future::Future;
          use std::pin::{Pin, pin};
          use std::task::{Context, Poll, Waker};

          struct YieldNow(bool);

          impl Future for YieldNow {
              type Output = ();
              fn poll(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<()> {
                  if self.0 {
                      return Poll::Ready(());
                  }
                  self.0 = true;
                  Poll::Pending
              }
          }

          async fn forward_next(queue: &mut Vec<&'static str>) {
              let order = queue.pop().unwrap(); // step one: taken off the queue
              YieldNow(false).await; // cancelled here
              println!("forwarded {order}"); // step two never runs
          }

          fn main() {
              let mut queue = vec!["order-1", "order-2"];
              {
                  let mut future = pin!(forward_next(&mut queue));
                  let mut cx = Context::from_waker(Waker::noop());
                  let _ = future.as_mut().poll(&mut cx); // one poll, then give up
              }
              println!("still queued: {queue:?}");
          }
        `,
      },
    },
    {
      heading: '`select!` cancels every branch that did not win',
      body: [
        '`Task.WhenAny` returns the first task to finish and leaves the others running; you cancel them yourself, if you remember. `tokio::select!` polls several futures and, as soon as one completes, drops all the others.',
        'That is convenient for timeouts and shutdown signals, and it is exactly where the cancel-safety problem above bites: a losing branch that had half-read a message from a stream is dropped mid-way.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the tokio crate.',
        code: code`
          use std::time::Duration;

          async fn fetch_quote() -> u32 {
              tokio::time::sleep(Duration::from_secs(5)).await;
              42
          }

          #[tokio::main]
          async fn main() {
              tokio::select! {
                  quote = fetch_quote() => println!("quote: {quote}"),
                  _ = tokio::time::sleep(Duration::from_secs(1)) => println!("gave up"),
              }
              // fetch_quote's future has been dropped; nothing is still running
          }
        `,
      },
    },
    {
      heading: 'Dropping a `JoinHandle` detaches the task, it does not cancel it',
      body: [
        'The drop rule applies to futures you poll yourself. A future handed to `tokio::spawn` is owned by the runtime, and the `JoinHandle` you get back is only a way to await its result. Drop the handle and the task keeps running, like discarding a `Task` in C#.',
        'To stop a spawned task, call `handle.abort()`, which drops the task at the `.await` it is suspended on, or the next one it reaches if it is running. For graceful shutdown across many tasks, `tokio_util::sync::CancellationToken` exists and looks familiar: tasks `select!` on `token.cancelled()` and clean up asynchronously before returning.',
      ],
    },
  ],
  visualize: [],
  timelines: ['as-fire-and-forget'],
  takeaways: [
    'Dropping a future cancels it at the `.await` where it is suspended.',
    'Cleanup on cancellation is `Drop`: synchronous, infallible, and the only hook you get.',
    'Spawned tasks are not cancelled by dropping their handle. Use `abort()` or a `CancellationToken`.',
  ],
};
