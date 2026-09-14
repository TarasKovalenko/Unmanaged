import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const runtimes: Lesson = {
  id: 'as-runtimes',
  title: 'Picking a runtime',
  summary: 'An executor is a dependency you choose. `tokio::spawn` plays the role of `Task.Run`, with `Send + \'static` bounds that C# never asked for.',
  intro: [
    'In .NET the scheduling story is decided before your code runs: the thread pool, the default `TaskScheduler`, and whatever `SynchronizationContext` the host installs (none in ASP.NET Core, a UI-thread one in WPF). `Task.Run` queues work to the pool and you rarely think further.',
    'In Rust you pick the executor, and its API decides how work is spawned, which threads it runs on, and what the spawned future must promise. The example below builds the smallest runtime that has the same `spawn` signature as tokio, so the bounds are visible and the code compiles with the standard library alone.',
  ],
  csharp: {
    filename: 'ImportJob.cs',
    code: code`
      public sealed class ImportJob(IBlobStore blobs, ILogger<ImportJob> log)
      {
          public async Task<int> RunAsync(IReadOnlyList<string> files)
          {
              var tasks = files.Select(file => Task.Run(async () =>
              {
                  var rows = await blobs.CountRowsAsync(file);
                  return (file, rows);
              }));

              var total = 0;
              foreach (var (file, rows) in await Task.WhenAll(tasks))
              {
                  log.LogInformation("{File}: {Rows} rows", file, rows);
                  total += rows;
              }
              return total;
          }
      }
    `,
  },
  rust: {
    filename: 'import_job.rs',
    stdout: 'orders.csv: 100 rows\nstock.csv: 90 rows\ntotal: 190',
    code: code`
      use std::future::Future;
      use std::pin::pin;
      use std::task::{Context, Poll, Waker};
      use std::thread::{self, JoinHandle};

      async fn count_rows(file: &str) -> usize {
          file.len() * 10 // stand-in for reading the blob
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

      // The same bounds as tokio::spawn. This toy uses one thread per future.
      fn spawn<F>(future: F) -> JoinHandle<F::Output>
      where
          F: Future + Send + 'static,
          F::Output: Send + 'static,
      {
          thread::spawn(move || block_on(future))
      }

      fn main() {
          let files = vec![String::from("orders.csv"), String::from("stock.csv")];
          let handles: Vec<_> = files
              .into_iter()
              .map(|file| {
                  spawn(async move {
                      let rows = count_rows(&file).await;
                      (file, rows)
                  })
              })
              .collect();

          let mut total = 0;
          for handle in handles {
              let (file, rows) = handle.join().unwrap();
              println!("{file}: {rows} rows");
              total += rows;
          }
          println!("total: {total}");
      }
    `,
  },
  links: [
    {
      csharp: [7],
      rust: lines(6, 8),
      note: 'The async work itself. It knows nothing about threads or runtimes, in either language.',
    },
    {
      csharp: [5],
      rust: lines(20, 27),
      note: '`Task.Run` takes any `Func<Task<T>>`. `spawn` demands `Send` (the future may run on another thread) and `\'static` (it may outlive the caller, so it cannot borrow the caller\'s locals). `tokio::spawn` has exactly these bounds.',
    },
    {
      csharp: [5, 6, 8, 9],
      rust: lines(31, 39),
      note: '`async move` makes the future own `file`. A C# lambda captures the variable and lets the GC keep it alive; a spawned Rust future has to take ownership, or it would violate `\'static`.',
    },
    {
      csharp: [12],
      rust: [42, 43],
      note: '`Task.WhenAll` becomes joining each handle. With tokio it would be `handle.await`, and a panic inside the task comes back as `Err(JoinError)`, where `await Task.WhenAll` rethrows the first exception.',
    },
    {
      csharp: [14, 15],
      rust: [44, 45],
      note: 'Results are printed after joining, in input order, so the output is deterministic. Printing inside the spawned futures would interleave by thread timing, exactly as logging inside `Task.Run` does.',
    },
    {
      csharp: [3],
      rust: lines(10, 18),
      note: 'In C# the CLR owns this loop. Here it is your code, and in production it is a crate: the runtime is the piece that polls futures and wakes them when I/O is ready.',
    },
  ],
  breaks: [
    {
      heading: 'The runtime is a choice, and your libraries make it with you',
      body: [
        'There is no equivalent of "the" thread pool. Tokio is the de facto standard; smol and embassy (for embedded) exist, and async-std is discontinued. A crate that opens sockets or sleeps asynchronously is usually tied to one runtime, so `reqwest` or `sqlx` in your dependencies effectively picks tokio for you.',
        'Tokio also comes in two flavours, and the difference matters the way `SynchronizationContext` matters in WPF: `#[tokio::main]` is multi-threaded, while `#[tokio::test]` defaults to a single-threaded runtime where one blocking call freezes every task.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the tokio crate.',
        code: code`
          #[tokio::main(flavor = "current_thread")]
          async fn main() {
              let handle = tokio::spawn(async { 40 + 2 });
              println!("{}", handle.await.unwrap());
          }
        `,
      },
    },
    {
      heading: '`tokio::spawn` is `Task.Run` with a contract',
      body: [
        '`Task.Run` accepts any lambda and trusts you about thread safety. `tokio::spawn` accepts only futures that are `Send + \'static`, because a multi-threaded runtime may resume the task on a different worker after any `.await`, and the task may still be running after the caller returns.',
        'Most "why won\'t this spawn" errors come from those two words. The next lesson takes them apart.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the tokio crate. The same program as above on a real runtime.',
        code: code`
          async fn count_rows(file: &str) -> usize {
              file.len() * 10
          }

          #[tokio::main]
          async fn main() {
              let files = vec![String::from("orders.csv"), String::from("stock.csv")];
              let handles: Vec<_> = files
                  .into_iter()
                  .map(|file| tokio::spawn(async move {
                      let rows = count_rows(&file).await;
                      (file, rows)
                  }))
                  .collect();

              for handle in handles {
                  let (file, rows) = handle.await.unwrap();
                  println!("{file}: {rows} rows");
              }
          }
        `,
      },
    },
    {
      heading: '`block_on` inside async code is not `.Result`, it is a panic',
      body: [
        'Sync-over-async in C# has two classic failure modes: `.Result` on a UI or classic ASP.NET `SynchronizationContext` deadlocks, and on ASP.NET Core it starves the thread pool under load.',
        'Tokio refuses at runtime instead. Calling `Runtime::block_on` from a thread that is already driving tasks panics with "Cannot start a runtime from within a runtime". A synchronous function that secretly blocks on a future is therefore a landmine for any async caller. Keep async all the way up to `main`, as you would in C#.',
      ],
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Needs the tokio crate. Compiles, then panics when run.',
        code: code`
          fn load_config_blocking() -> String {
              let runtime = tokio::runtime::Runtime::new().unwrap();
              runtime.block_on(async { String::from("appsettings") })
          }

          #[tokio::main]
          async fn main() {
              // panics: this thread is already a runtime worker
              println!("{}", load_config_blocking());
          }
        `,
      },
    },
    {
      heading: 'Blocking calls need `spawn_blocking`, not `spawn`',
      body: [
        'In .NET, `Task.Run(() => File.ReadAllBytes(path))` is a reasonable way to keep synchronous work off a request thread, because the pool grows. Tokio\'s worker pool is fixed at one thread per core, and a future that blocks holds its worker hostage.',
        'Synchronous file I/O, CPU-heavy parsing, and calls into blocking libraries go through `tokio::task::spawn_blocking`, which runs a closure on a separate, growable pool and returns a handle you can `.await`. The timeline below shows what happens without it.',
      ],
    },
  ],
  visualize: [],
  timelines: ['as-sequential-vs-join', 'as-blocking-in-async'],
  drills: ['as-await-in-sync-fn'],
  takeaways: [
    'The executor is a dependency. Tokio is the usual answer, and `#[tokio::main]` builds it.',
    '`tokio::spawn` is `Task.Run` for futures that are `Send + \'static`.',
    'Never block inside async code: use async APIs or `spawn_blocking`.',
  ],
};
