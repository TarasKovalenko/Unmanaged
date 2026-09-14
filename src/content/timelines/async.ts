import { code } from '../code.ts';
import type { Timeline } from '../types.ts';

export const timelines: Timeline[] = [
  {
    id: 'task-hot-future-cold',
    title: 'Created is not started',
    summary: 'A C# Task runs up to its first await the moment you call the method. A Rust future does nothing until something polls it.',
    ticks: 4,
    tickNotes: [
      'Call the async function.',
      'Print from the caller.',
      'Wait for the result.',
      'Use the result.',
    ],
    csharp: {
      filename: 'Program.cs',
      code: code`
        var pending = SendEmailAsync("ada@contoso.com");
        Console.WriteLine("task created");
        var sent = await pending;
        Console.WriteLine($"sent: {sent}");

        static async Task<bool> SendEmailAsync(string to)
        {
            Console.WriteLine($"sending to {to}");
            await Task.Yield();
            return true;
        }
      `,
      lineAtTick: [1, 2, 3, 4],
      events: [
        { lane: 'Main', kind: 'running', start: 0, end: 1, label: 'calls SendEmailAsync, keeps going' },
        { lane: 'Main', kind: 'waiting', start: 2, end: 2, label: 'await pending' },
        { lane: 'Main', kind: 'running', start: 3, end: 3 },
        { lane: 'SendEmailAsync', kind: 'running', start: 0, end: 0, label: 'runs synchronously up to its first await' },
        { lane: 'SendEmailAsync', kind: 'waiting', start: 1, end: 1, label: 'suspended at Task.Yield' },
        { lane: 'SendEmailAsync', kind: 'running', start: 2, end: 2, label: 'resumes on the thread pool' },
        { lane: 'SendEmailAsync', kind: 'done', start: 3, end: 3, label: 'returns true' },
      ],
      output: 'sending to ada@contoso.com\ntask created\nsent: True',
    },
    rust: {
      filename: 'main.rs',
      expect: 'compiles',
      code: code`
        use std::future::Future;
        use std::pin::pin;
        use std::task::{Context, Poll, Waker};

        async fn send_email(to: &str) -> bool {
            println!("sending to {to}");
            true
        }

        // The smallest possible executor: poll until ready. Real code uses tokio.
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
            let pending = send_email("ada@contoso.com");
            println!("future created");
            let sent = block_on(pending);
            println!("sent: {sent}");
        }
      `,
      lineAtTick: [22, 23, 24, 25],
      events: [
        { lane: 'main', kind: 'running', start: 0, end: 1, label: 'builds a future value, runs none of its body' },
        { lane: 'main', kind: 'blocked', start: 2, end: 2, label: 'block_on polls the future' },
        { lane: 'main', kind: 'running', start: 3, end: 3 },
        { lane: 'send_email', kind: 'inert', start: 0, end: 1, label: 'a state machine that has never been polled' },
        { lane: 'send_email', kind: 'running', start: 2, end: 2, label: 'first poll: body runs' },
        { lane: 'send_email', kind: 'done', start: 3, end: 3, label: 'Poll::Ready(true)' },
      ],
      output: 'future created\nsending to ada@contoso.com\nsent: true',
    },
    explanation: [
      'Read the output order. C# prints "sending" before "task created", because calling an async method starts it. Rust prints "future created" first: calling `send_email` only builds a state machine, and its body runs on the first poll.',
      'That is why "fire and forget" in Rust silently does nothing. `send_email("...");` on its own line creates a future and immediately drops it. rustc warns (`unused implementer of Future that must be used`), but it compiles.',
    ],
  },
  {
    id: 'as-fire-and-forget',
    title: 'Fire and forget',
    summary: 'Discarding a Task in C# still sends the email. Discarding a future in Rust throws the work away before it starts.',
    ticks: 5,
    tickNotes: [
      'The handler starts placing the order.',
      'The receipt call is made and its result discarded.',
      'The handler reports the order as saved.',
      'The handler has returned.',
      'The request finishes.',
    ],
    csharp: {
      filename: 'Program.cs',
      code: code`
        PlaceOrder(42);
        await Task.Delay(100);
        Console.WriteLine("request finished");

        static void PlaceOrder(int orderId)
        {
            _ = SendReceiptAsync(orderId); // started, never observed
            Console.WriteLine($"order {orderId} saved");
        }

        static async Task SendReceiptAsync(int orderId)
        {
            Console.WriteLine($"sending receipt for {orderId}");
            await Task.Delay(10);
            Console.WriteLine($"receipt for {orderId} sent");
        }
      `,
      lineAtTick: [1, 13, 8, 15, 3],
      events: [
        { lane: 'Main', kind: 'running', start: 0, end: 2, label: 'PlaceOrder runs to completion' },
        { lane: 'Main', kind: 'waiting', start: 3, end: 3, label: 'await Task.Delay(100)' },
        { lane: 'Main', kind: 'running', start: 4, end: 4 },
        { lane: 'SendReceiptAsync', kind: 'running', start: 1, end: 1, label: 'runs synchronously up to its first await' },
        { lane: 'SendReceiptAsync', kind: 'waiting', start: 2, end: 2, label: 'suspended at Task.Delay(10)' },
        { lane: 'SendReceiptAsync', kind: 'running', start: 3, end: 3, label: 'resumes on a thread-pool thread' },
        { lane: 'SendReceiptAsync', kind: 'done', start: 4, end: 4, label: 'nobody awaited it, but it ran' },
      ],
      output: 'sending receipt for 42\norder 42 saved\nreceipt for 42 sent\nrequest finished',
    },
    rust: {
      filename: 'main.rs',
      expect: 'compiles',
      code: code`
        use std::future::Future;
        use std::pin::pin;
        use std::task::{Context, Poll, Waker};

        async fn send_receipt(order_id: u32) {
            println!("sending receipt for {order_id}");
            println!("receipt for {order_id} sent");
        }

        async fn place_order(order_id: u32) {
            send_receipt(order_id); // warning: unused implementer of \`Future\` that must be used
            println!("order {order_id} saved");
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

        fn main() {
            block_on(place_order(42));
            println!("request finished");
        }
      `,
      lineAtTick: [26, 11, 12, 13, 27],
      events: [
        { lane: 'main', kind: 'blocked', start: 0, end: 3, label: 'block_on polls place_order' },
        { lane: 'main', kind: 'running', start: 4, end: 4 },
        { lane: 'place_order', kind: 'running', start: 0, end: 2 },
        { lane: 'place_order', kind: 'done', start: 3, end: 4, label: 'Poll::Ready(())' },
        { lane: 'send_receipt', kind: 'inert', start: 1, end: 1, label: 'a future is built, its body does not run' },
        { lane: 'send_receipt', kind: 'dropped', start: 2, end: 4, label: 'dropped at the semicolon, never polled' },
      ],
      output: 'order 42 saved\nrequest finished',
    },
    explanation: [
      '`_ = SendReceiptAsync(orderId)` is a real pattern in C# code bases, and it works in the sense that the email goes out: the method runs up to its first `await` on the calling thread, and the continuation is scheduled on the thread pool whether or not anyone holds the `Task`. The cost is that a failure is only reported through `TaskScheduler.UnobservedTaskException`, raised when the GC finalizes the faulted task, and since .NET 4.5 that does not crash the process, so usually nobody hears about it. The "receipt sent" line appears before "request finished" only because 10 ms is shorter than 100 ms: that order is timing, not a guarantee.',
      'The same line in Rust is not a fire-and-forget, it is a no-op. `send_receipt(order_id)` builds a state machine and the `;` drops it. There are no "receipt" lines in the output at all. rustc warns, because the future type is `#[must_use]`, but it compiles.',
      'To actually detach work in Rust you hand the future to a runtime: `tokio::spawn(send_receipt(order_id))`. That is the closest thing to `_ = SendReceiptAsync(...)`, and it comes with `Send + \'static` requirements that the Async track covers next.',
    ],
  },
  {
    id: 'as-sequential-vs-join',
    title: 'Sequential awaits and joins',
    summary: 'In C# the tasks start when you call the methods, so `WhenAll` only waits. In Rust nothing runs concurrently unless one future polls several others.',
    ticks: 12,
    tickNotes: [
      'First call: the orders request goes out.',
      'Orders is waiting on the network.',
      'Orders response arrives.',
      'Only now does the stock call start.',
      'Stock is waiting on the network.',
      'Stock response arrives.',
      'Second phase begins.',
      'Both calls are made, as arguments.',
      'Both requests are in flight.',
      'Still waiting on both.',
      'Both responses arrive.',
      'The combined await completes.',
    ],
    csharp: {
      filename: 'Program.cs',
      code: code`
        Console.WriteLine("-- sequential");
        await FetchAsync("orders", 100);
        await FetchAsync("stock", 200);

        Console.WriteLine("-- WhenAll");
        await Task.WhenAll(FetchAsync("orders", 100), FetchAsync("stock", 200));

        static async Task<int> FetchAsync(string name, int latencyMs)
        {
            Console.WriteLine($"{name}: request sent");
            await Task.Delay(latencyMs);
            Console.WriteLine($"{name}: response received");
            return name.Length;
        }
      `,
      lineAtTick: [10, 11, 12, 10, 11, 12, 5, 10, 11, 11, 12, 6],
      events: [
        { lane: 'Main', kind: 'waiting', start: 0, end: 2, label: 'await FetchAsync("orders")' },
        { lane: 'Main', kind: 'waiting', start: 3, end: 5, label: 'await FetchAsync("stock")' },
        { lane: 'Main', kind: 'running', start: 6, end: 6 },
        { lane: 'Main', kind: 'waiting', start: 7, end: 10, label: 'await Task.WhenAll' },
        { lane: 'Main', kind: 'running', start: 11, end: 11 },
        { lane: 'orders', kind: 'running', start: 0, end: 0, label: 'request sent' },
        { lane: 'orders', kind: 'waiting', start: 1, end: 1 },
        { lane: 'orders', kind: 'running', start: 2, end: 2, label: 'response received' },
        { lane: 'orders', kind: 'done', start: 3, end: 3 },
        { lane: 'orders', kind: 'running', start: 7, end: 7, label: 'started while evaluating the argument list' },
        { lane: 'orders', kind: 'waiting', start: 8, end: 9 },
        { lane: 'orders', kind: 'running', start: 10, end: 10, label: 'response received' },
        { lane: 'orders', kind: 'done', start: 11, end: 11 },
        { lane: 'stock', kind: 'running', start: 3, end: 3, label: 'request sent' },
        { lane: 'stock', kind: 'waiting', start: 4, end: 4 },
        { lane: 'stock', kind: 'running', start: 5, end: 5, label: 'response received' },
        { lane: 'stock', kind: 'done', start: 6, end: 6 },
        { lane: 'stock', kind: 'running', start: 7, end: 7, label: 'started before WhenAll is even called' },
        { lane: 'stock', kind: 'waiting', start: 8, end: 9 },
        { lane: 'stock', kind: 'running', start: 10, end: 10, label: 'response received' },
        { lane: 'stock', kind: 'done', start: 11, end: 11 },
      ],
      output: '-- sequential\norders: request sent\norders: response received\nstock: request sent\nstock: response received\n-- WhenAll\norders: request sent\nstock: request sent\norders: response received\nstock: response received',
    },
    rust: {
      filename: 'main.rs',
      expect: 'compiles',
      code: code`
        use std::future::{Future, poll_fn};
        use std::pin::{Pin, pin};
        use std::task::{Context, Poll, Waker};

        // Pending once, then ready: a stand-in for waiting on the network.
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

        async fn fetch(name: &str) -> usize {
            println!("{name}: request sent");
            YieldNow(false).await;
            println!("{name}: response received");
            name.len()
        }

        // A two-future join: poll both on every pass until both are ready.
        async fn join<A: Future, B: Future>(a: A, b: B) -> (A::Output, B::Output) {
            let (mut a, mut b) = (pin!(a), pin!(b));
            let (mut a_out, mut b_out) = (None, None);
            poll_fn(|cx| {
                if a_out.is_none() {
                    if let Poll::Ready(v) = a.as_mut().poll(cx) {
                        a_out = Some(v);
                    }
                }
                if b_out.is_none() {
                    if let Poll::Ready(v) = b.as_mut().poll(cx) {
                        b_out = Some(v);
                    }
                }
                if a_out.is_some() && b_out.is_some() {
                    Poll::Ready((a_out.take().unwrap(), b_out.take().unwrap()))
                } else {
                    Poll::Pending
                }
            })
            .await
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

        fn main() {
            block_on(async {
                println!("-- sequential");
                fetch("orders").await;
                fetch("stock").await;

                println!("-- joined");
                join(fetch("orders"), fetch("stock")).await;
            });
        }
      `,
      lineAtTick: [20, 21, 22, 20, 21, 22, 66, 67, 20, 21, 22, 67],
      events: [
        { lane: 'main', kind: 'blocked', start: 0, end: 11, label: 'block_on drives the whole async block' },
        { lane: 'orders', kind: 'running', start: 0, end: 0, label: 'first poll: request sent' },
        { lane: 'orders', kind: 'waiting', start: 1, end: 1, label: 'Poll::Pending' },
        { lane: 'orders', kind: 'running', start: 2, end: 2, label: 'polled again: response received' },
        { lane: 'orders', kind: 'done', start: 3, end: 3 },
        { lane: 'orders', kind: 'inert', start: 7, end: 7, label: 'argument evaluated: a future, not a request' },
        { lane: 'orders', kind: 'running', start: 8, end: 8, label: 'join polls it first' },
        { lane: 'orders', kind: 'waiting', start: 9, end: 9 },
        { lane: 'orders', kind: 'running', start: 10, end: 10, label: 'response received' },
        { lane: 'orders', kind: 'done', start: 11, end: 11 },
        { lane: 'stock', kind: 'running', start: 3, end: 3, label: 'not created until orders finished' },
        { lane: 'stock', kind: 'waiting', start: 4, end: 4 },
        { lane: 'stock', kind: 'running', start: 5, end: 5, label: 'response received' },
        { lane: 'stock', kind: 'done', start: 6, end: 6 },
        { lane: 'stock', kind: 'inert', start: 7, end: 7, label: 'built, not started' },
        { lane: 'stock', kind: 'running', start: 8, end: 8, label: 'join polls it second, on the same pass' },
        { lane: 'stock', kind: 'waiting', start: 9, end: 9 },
        { lane: 'stock', kind: 'running', start: 10, end: 10, label: 'response received' },
        { lane: 'stock', kind: 'done', start: 11, end: 11 },
      ],
      output: '-- sequential\norders: request sent\norders: response received\nstock: request sent\nstock: response received\n-- joined\norders: request sent\nstock: request sent\norders: response received\nstock: response received',
    },
    explanation: [
      'The outputs match, but for different reasons. In C#, `FetchAsync("orders", 100)` starts the request as the argument is evaluated. `Task.WhenAll` starts nothing; it waits for tasks that are already running. You could write `var a = FetchAsync(...); var b = FetchAsync(...); await a; await b;` and still get concurrency. The two "request sent" lines are ordered because each runs synchronously during the call; the two "response received" lines follow the 100 ms and 200 ms delays, so that part of the C# order is timing. In Rust the order is fixed by `join` polling its first future before its second.',
      'In Rust that last pattern is sequential. `let a = fetch("orders"); let b = fetch("stock"); a.await; b.await;` sends the stock request only after orders has completed, because `b` is not polled until then. Concurrency comes from a future that polls several others, which is what `join` does here and what `tokio::join!` and `futures::future::join_all` do in real code.',
      'All of this happens on one thread. A join is concurrent, not parallel: both requests are in flight at once, but only one piece of Rust code runs at a time. Parallelism needs `tokio::spawn` on a multi-threaded runtime.',
    ],
  },
  {
    id: 'as-blocking-in-async',
    title: 'Blocking inside async code',
    summary: '`Thread.Sleep` in an async method wastes one thread-pool thread. `std::thread::sleep` in a future stalls every future sharing that executor thread.',
    ticks: 9,
    tickNotes: [
      'The heartbeat prints and schedules its next tick.',
      'The report starts its first section.',
      'Section one blocks its thread.',
      'Section one completes.',
      'Second heartbeat is due.',
      'Section two completes.',
      'Third heartbeat is due.',
      'Section three completes.',
      'Everything has finished.',
    ],
    csharp: {
      filename: 'Program.cs',
      code: code`
        var heartbeat = HeartbeatAsync();
        var report = BuildReportAsync();
        await Task.WhenAll(heartbeat, report);

        static async Task HeartbeatAsync()
        {
            for (var i = 1; i <= 3; i++)
            {
                Console.WriteLine($"heartbeat {i}");
                await Task.Delay(500);
            }
        }

        static async Task BuildReportAsync()
        {
            await Task.Yield();
            foreach (var section in new[] { "sales", "stock", "returns" })
            {
                Thread.Sleep(400); // blocks one thread-pool thread
                Console.WriteLine($"report: {section} done");
            }
        }
      `,
      lineAtTick: [9, 16, 19, 20, 9, 20, 9, 20, 3],
      events: [
        { lane: 'Main', kind: 'running', start: 0, end: 1 },
        { lane: 'Main', kind: 'waiting', start: 2, end: 7, label: 'await Task.WhenAll' },
        { lane: 'Main', kind: 'running', start: 8, end: 8 },
        { lane: 'HeartbeatAsync', kind: 'running', start: 0, end: 0, label: 'heartbeat 1' },
        { lane: 'HeartbeatAsync', kind: 'waiting', start: 1, end: 3, label: 'Task.Delay(500)' },
        { lane: 'HeartbeatAsync', kind: 'running', start: 4, end: 4, label: 'heartbeat 2, on another pool thread' },
        { lane: 'HeartbeatAsync', kind: 'waiting', start: 5, end: 5 },
        { lane: 'HeartbeatAsync', kind: 'running', start: 6, end: 6, label: 'heartbeat 3' },
        { lane: 'HeartbeatAsync', kind: 'waiting', start: 7, end: 7 },
        { lane: 'HeartbeatAsync', kind: 'done', start: 8, end: 8 },
        { lane: 'BuildReportAsync', kind: 'running', start: 1, end: 1, label: 'Task.Yield moves it to the pool' },
        { lane: 'BuildReportAsync', kind: 'blocked', start: 2, end: 2, label: 'Thread.Sleep(400)' },
        { lane: 'BuildReportAsync', kind: 'running', start: 3, end: 3, label: 'sales done' },
        { lane: 'BuildReportAsync', kind: 'blocked', start: 4, end: 4 },
        { lane: 'BuildReportAsync', kind: 'running', start: 5, end: 5, label: 'stock done' },
        { lane: 'BuildReportAsync', kind: 'blocked', start: 6, end: 6 },
        { lane: 'BuildReportAsync', kind: 'running', start: 7, end: 7, label: 'returns done' },
        { lane: 'BuildReportAsync', kind: 'done', start: 8, end: 8 },
      ],
      output: 'heartbeat 1\nreport: sales done\nheartbeat 2\nreport: stock done\nheartbeat 3\nreport: returns done',
    },
    rust: {
      filename: 'main.rs',
      expect: 'compiles',
      code: code`
        use std::future::Future;
        use std::pin::{Pin, pin};
        use std::task::{Context, Poll, Waker};
        use std::thread;
        use std::time::Duration;

        // Pending once, then ready: a stand-in for a timer.
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

        async fn heartbeat() {
            for i in 1..=3 {
                println!("heartbeat {i}");
                YieldNow(false).await;
            }
        }

        async fn build_report() {
            for section in ["sales", "stock", "returns"] {
                thread::sleep(Duration::from_millis(400)); // blocks the executor's only thread
                println!("report: {section} done");
            }
        }

        // Poll both futures on one thread until both are ready.
        fn block_on_both(a: impl Future<Output = ()>, b: impl Future<Output = ()>) {
            let (mut a, mut b) = (pin!(a), pin!(b));
            let mut cx = Context::from_waker(Waker::noop());
            let (mut a_done, mut b_done) = (false, false);
            while !(a_done && b_done) {
                a_done = a_done || a.as_mut().poll(&mut cx).is_ready();
                b_done = b_done || b.as_mut().poll(&mut cx).is_ready();
            }
        }

        fn main() {
            block_on_both(heartbeat(), build_report());
        }
      `,
      lineAtTick: [23, 30, 31, 30, 31, 30, 31, 23, 23],
      events: [
        { lane: 'main thread', kind: 'blocked', start: 0, end: 8, label: 'the only thread, driving both futures' },
        { lane: 'heartbeat', kind: 'running', start: 0, end: 0, label: 'heartbeat 1' },
        { lane: 'heartbeat', kind: 'waiting', start: 1, end: 6, label: 'ready to run, but the thread is asleep' },
        { lane: 'heartbeat', kind: 'running', start: 7, end: 7, label: 'heartbeat 2, only after 1.2 seconds of blocking' },
        { lane: 'heartbeat', kind: 'running', start: 8, end: 8, label: 'heartbeat 3' },
        { lane: 'build_report', kind: 'blocked', start: 1, end: 1, label: 'thread::sleep never returns Pending' },
        { lane: 'build_report', kind: 'running', start: 2, end: 2, label: 'sales done' },
        { lane: 'build_report', kind: 'blocked', start: 3, end: 3 },
        { lane: 'build_report', kind: 'running', start: 4, end: 4, label: 'stock done' },
        { lane: 'build_report', kind: 'blocked', start: 5, end: 5 },
        { lane: 'build_report', kind: 'running', start: 6, end: 6, label: 'returns done' },
        { lane: 'build_report', kind: 'done', start: 7, end: 8 },
      ],
      output: 'heartbeat 1\nreport: sales done\nreport: stock done\nreport: returns done\nheartbeat 2\nheartbeat 3',
    },
    explanation: [
      'In C#, `Thread.Sleep` inside an async method is a known smell, but the program still behaves: the thread pool has other threads, so the heartbeat continuation runs on one of them while the report holds another. The damage shows up under load, as thread-pool starvation and the pool slowly injecting threads. The C# interleaving follows the timers (400 ms report steps against 500 ms heartbeats), so it is timing-dependent; the Rust output is not.',
      'A Rust future is only ever running while something calls `poll` on it. `build_report` contains no `.await`, so its first poll runs all three blocking sections before returning, and the executor cannot poll `heartbeat` until it does. Every future on that thread freezes. On a multi-threaded tokio runtime that worker is lost until the call returns, and tasks queued on it can stall until another worker steals them; on a `current_thread` runtime the whole program freezes.',
      'The fixes map to what you already know. `tokio::time::sleep(...).await` is `Task.Delay`. `tokio::task::spawn_blocking(...)` is the honest version of `Task.Run` for synchronous work, and it moves that work onto a separate pool of threads meant for blocking.',
    ],
  },
];
