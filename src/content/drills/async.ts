import { code } from '../code.ts';
import type { Drill } from '../types.ts';

export const drills: Drill[] = [
  {
    id: 'as-await-in-sync-fn',
    track: 'async',
    title: 'Awaiting inside a plain function',
    csharpReflex: 'When a method needs to await, add `await` and let the IDE fix the signature, or reach for `.GetAwaiter().GetResult()` if the caller cannot be async.',
    code: code`
      async fn read_file(path: &str) -> String {
          format!("contents of {path}")
      }

      fn load_config() -> String {
          let raw = read_file("appsettings.toml").await;
          raw.to_uppercase()
      }

      fn main() {
          println!("{}", load_config());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0728',
    message: `error[E0728]: \`await\` is only allowed inside \`async\` functions and blocks
 --> src/main.rs:6:45
  |
5 | fn load_config() -> String {
  | -------------------------- this is not \`async\`
6 |     let raw = read_file("appsettings.toml").await;
  |                                             ^^^^^ only allowed inside \`async\` functions and blocks`,
    options: [
      {
        text: '`load_config` is a synchronous function, and `.await` only exists inside `async fn` bodies and `async` blocks.',
        correct: true,
        why: 'An `async fn` is compiled into a state machine that can stop at each `.await` and be resumed by whoever polls it. A plain `fn` has no state machine to suspend, so there is nowhere for `.await` to return to. rustc points at the signature: "this is not `async`".',
      },
      {
        text: '`read_file` returns `String`, not a `Task<String>`, so there is nothing to await.',
        why: 'The signature says `-> String`, but an `async fn` actually returns `impl Future<Output = String>`. The declared type is what the future produces, the same way `async Task<string>` in C# declares `string` as the result. Awaiting it is correct; the location is the problem.',
      },
      {
        text: 'The program has no async runtime, so `.await` is not available until tokio is added.',
        why: 'Tempting, since there really is no runtime in the box. But `.await` is language syntax and compiles without any crate. A runtime is only needed to poll the outermost future; the error here is about where `.await` is written.',
      },
    ],
    fixes: [
      {
        label: 'Make the caller async, block once at the top',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Async spreads up the call chain, as it does in C#. The one place that turns a future into a value is the entry point: here a tiny `block_on`, in real code `#[tokio::main]`.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          async fn read_file(path: &str) -> String {
              format!("contents of {path}")
          }

          async fn load_config() -> String {
              let raw = read_file("appsettings.toml").await;
              raw.to_uppercase()
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
              println!("{}", block_on(load_config()));
          }
        `,
      },
      {
        label: 'Block inside the synchronous function',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'This is `.GetAwaiter().GetResult()`. It compiles and works here, but a function that secretly blocks is a trap: call it from inside a tokio task and the runtime panics with "Cannot start a runtime from within a runtime", or the worker thread stalls.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          async fn read_file(path: &str) -> String {
              format!("contents of {path}")
          }

          fn load_config() -> String {
              let raw = block_on(read_file("appsettings.toml"));
              raw.to_uppercase()
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
              println!("{}", load_config());
          }
        `,
      },
      {
        label: 'Make everything async, including `main`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'C# has allowed `async Task Main` since 7.1 because the compiler generates a synchronous entry point that blocks on the returned `Task`, and the CLR thread pool runs the continuations. Rust has no built-in executor, so `async fn main` is E0752. `#[tokio::main]` exists to rewrite it into a plain `main` that builds a runtime.',
        code: code`
          async fn read_file(path: &str) -> String {
              format!("contents of {path}")
          }

          async fn load_config() -> String {
              let raw = read_file("appsettings.toml").await;
              raw.to_uppercase()
          }

          async fn main() {
              println!("{}", load_config().await);
          }
        `,
      },
    ],
  },
  {
    id: 'as-recursive-async',
    track: 'async',
    title: 'Walking a category tree recursively',
    csharpReflex: 'A recursive `async Task<int>` method is unremarkable. Each call allocates its own `Task` on the heap, so depth is only a stack-overflow question.',
    code: code`
      use std::future::Future;
      use std::pin::pin;
      use std::task::{Context, Poll, Waker};

      struct Category {
          name: &'static str,
          children: Vec<Category>,
      }

      async fn fetch_product_count(name: &str) -> usize {
          name.len() // stand-in for a catalogue API call
      }

      async fn count_products(category: &Category) -> usize {
          let mut total = fetch_product_count(category.name).await;
          for child in &category.children {
              total += count_products(child).await;
          }
          total
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
          let catalogue = Category {
              name: "garden",
              children: vec![
                  Category { name: "tools", children: vec![] },
                  Category { name: "furniture", children: vec![] },
              ],
          };
          println!("{} products", block_on(count_products(&catalogue)));
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0733',
    message: `error[E0733]: recursion in an async fn requires boxing
  --> src/main.rs:14:1
   |
14 | async fn count_products(category: &Category) -> usize {
   | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
...
17 |         total += count_products(child).await;
   |                  --------------------------- recursive call here
   |
   = note: a recursive \`async fn\` call must introduce indirection such as \`Box::pin\` to avoid an infinitely sized future`,
    options: [
      {
        text: 'The future returned by `count_products` would have to contain the future of its own recursive call, so its size would be infinite.',
        correct: true,
        why: 'An `async fn` compiles to a state machine that stores the inner future inline while awaiting it, with a size fixed at compile time. Recursion would nest that type inside itself forever. A C# `Task` is a heap object reached through a reference, so the question never comes up. Boxing the recursive call adds the same indirection.',
      },
      {
        text: 'Async functions cannot call themselves because the runtime has no way to schedule a task that awaits itself.',
        why: 'There is no runtime involved and the call is not awaiting itself, it awaits a call on a child. The problem is the type of the future, which rustc must lay out at compile time. With a `Box::pin` in the right place, the recursion is fine.',
      },
      {
        text: 'The recursion could be unbounded, and rustc rejects any recursive function it cannot prove terminates.',
        why: 'rustc happily compiles non-terminating synchronous recursion. The note in the error is about an "infinitely sized future", which is a statement about memory layout, not about termination.',
      },
      {
        text: '`category` is borrowed across the `.await`, so the child borrow conflicts with the parent borrow.',
        why: 'Shared borrows can overlap freely, including across awaits. This would be a borrow-checker error with a different code, and the message would name a borrow. E0733 names the recursive call.',
      },
    ],
    fixes: [
      {
        label: 'Box the recursive call',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`Box::pin` puts the child future on the heap and stores only a pointer in the parent, so the parent has a finite size. One allocation per recursive call, which is what every C# `Task` costs anyway.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          struct Category {
              name: &'static str,
              children: Vec<Category>,
          }

          async fn fetch_product_count(name: &str) -> usize {
              name.len() // stand-in for a catalogue API call
          }

          async fn count_products(category: &Category) -> usize {
              let mut total = fetch_product_count(category.name).await;
              for child in &category.children {
                  total += Box::pin(count_products(child)).await;
              }
              total
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
              let catalogue = Category {
                  name: "garden",
                  children: vec![
                      Category { name: "tools", children: vec![] },
                      Category { name: "furniture", children: vec![] },
                  ],
              };
              println!("{} products", block_on(count_products(&catalogue)));
          }
        `,
      },
      {
        label: 'Return a boxed trait object by hand',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'This is what everyone wrote before Rust 1.77 allowed boxing at the call site, and what the `async-recursion` crate generates. It works, but the signature is noise, it boxes every call including the outermost one, and the `\'_` lifetime is a common source of confusing errors.',
        code: code`
          use std::future::Future;
          use std::pin::{Pin, pin};
          use std::task::{Context, Poll, Waker};

          struct Category {
              name: &'static str,
              children: Vec<Category>,
          }

          async fn fetch_product_count(name: &str) -> usize {
              name.len() // stand-in for a catalogue API call
          }

          fn count_products(category: &Category) -> Pin<Box<dyn Future<Output = usize> + '_>> {
              Box::pin(async move {
                  let mut total = fetch_product_count(category.name).await;
                  for child in &category.children {
                      total += count_products(child).await;
                  }
                  total
              })
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
              let catalogue = Category {
                  name: "garden",
                  children: vec![
                      Category { name: "tools", children: vec![] },
                      Category { name: "furniture", children: vec![] },
                  ],
              };
              println!("{} products", block_on(count_products(&catalogue)));
          }
        `,
      },
      {
        label: 'Put the call in a `Box::new`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'The indirection is there, so E0733 goes away, but `Box<F>` is only a future when `F: Unpin`, and async state machines are not. rustc reports E0283. Futures that may hold references into themselves must be pinned, which is what `Box::pin` does.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          struct Category {
              name: &'static str,
              children: Vec<Category>,
          }

          async fn fetch_product_count(name: &str) -> usize {
              name.len() // stand-in for a catalogue API call
          }

          async fn count_products(category: &Category) -> usize {
              let mut total = fetch_product_count(category.name).await;
              for child in &category.children {
                  total += Box::new(count_products(child)).await;
              }
              total
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
              let catalogue = Category {
                  name: "garden",
                  children: vec![
                      Category { name: "tools", children: vec![] },
                      Category { name: "furniture", children: vec![] },
                  ],
              };
              println!("{} products", block_on(count_products(&catalogue)));
          }
        `,
      },
    ],
  },
  {
    id: 'as-borrow-into-spawn',
    track: 'async',
    title: 'Borrowing a local from a spawned future',
    csharpReflex: 'A lambda passed to `Task.Run` captures the local list, the closure keeps it alive, and awaiting the task before using the list again makes it obviously safe.',
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

      // The same bounds as tokio::spawn.
      fn spawn<F>(future: F) -> JoinHandle<F::Output>
      where
          F: Future + Send + 'static,
          F::Output: Send + 'static,
      {
          thread::spawn(move || block_on(future))
      }

      fn main() {
          let files = vec![String::from("orders.csv"), String::from("stock.csv")];
          let handle = spawn(async {
              let mut total = 0;
              for file in &files {
                  total += count_rows(file).await;
              }
              total
          });
          println!("{} files, {} rows", files.len(), handle.join().unwrap());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0373',
    message: `error[E0373]: async block may outlive the current function, but it borrows \`files\`, which is owned by the current function
  --> src/main.rs:31:24
   |
31 |     let handle = spawn(async {
   |                        ^^^^^ may outlive borrowed value \`files\`
32 |         let mut total = 0;
33 |         for file in &files {
   |                      ----- \`files\` is borrowed here
   |
   = note: async blocks are not executed immediately and must either take a reference or ownership of outside variables they use
help: to force the async block to take ownership of \`files\` (and any other referenced variables), use the \`move\` keyword
   |
31 |     let handle = spawn(async move {
   |                              ++++`,
    options: [
      {
        text: '`spawn` requires a `\'static` future, and this async block only borrows `files`, which belongs to `main`.',
        correct: true,
        why: 'Nothing in `spawn`\'s signature says the task finishes before `main` drops `files`; the `join` on line 38 is invisible to the type system. So the future must own what it uses. `tokio::spawn` has the same bound and produces the same error.',
      },
      {
        text: 'Two threads read `files` at the same time, which is a data race.',
        why: 'Concurrent reads are allowed: `Vec<String>` is `Sync`, so shared references can cross threads. The error is about how long the borrow must live, not about simultaneous access.',
      },
      {
        text: 'Async blocks run immediately, before `files` is fully initialised.',
        why: 'The opposite: the note says async blocks are not executed immediately. That is exactly why a borrow is risky. By the time the block runs, the thing it borrowed might be gone.',
      },
      {
        text: 'Adding `move`, as the help suggests, is the complete fix.',
        why: 'It fixes the async block, but `main` still uses `files.len()` on line 38 after the move. That turns E0373 into E0382. See the third fix.',
      },
    ],
    fixes: [
      {
        label: 'Move ownership in, keep what `main` needs',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Take the count before spawning and give the task ownership with `async move`. The spawned future owns its inputs and returns its outputs, which is the shape tokio code settles into.',
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

          // The same bounds as tokio::spawn.
          fn spawn<F>(future: F) -> JoinHandle<F::Output>
          where
              F: Future + Send + 'static,
              F::Output: Send + 'static,
          {
              thread::spawn(move || block_on(future))
          }

          fn main() {
              let files = vec![String::from("orders.csv"), String::from("stock.csv")];
              let file_count = files.len();
              let handle = spawn(async move {
                  let mut total = 0;
                  for file in &files {
                      total += count_rows(file).await;
                  }
                  total
              });
              println!("{} files, {} rows", file_count, handle.join().unwrap());
          }
        `,
      },
      {
        label: 'Clone the list into the task',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles and keeps `files` usable in `main`, at the cost of copying every `String`. Fine for two file names. If both sides really need the data, `Arc<[String]>` shares it without copying.',
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

          // The same bounds as tokio::spawn.
          fn spawn<F>(future: F) -> JoinHandle<F::Output>
          where
              F: Future + Send + 'static,
              F::Output: Send + 'static,
          {
              thread::spawn(move || block_on(future))
          }

          fn main() {
              let files = vec![String::from("orders.csv"), String::from("stock.csv")];
              let to_count = files.clone();
              let handle = spawn(async move {
                  let mut total = 0;
                  for file in &to_count {
                      total += count_rows(file).await;
                  }
                  total
              });
              println!("{} files, {} rows", files.len(), handle.join().unwrap());
          }
        `,
      },
      {
        label: 'Add `move` as the help suggests',
        verdict: 'wrong',
        expect: 'fails',
        note: 'The async block now owns `files`, so `files.len()` afterwards is a use of a moved value: E0382. rustc\'s help fixes the error it is looking at, not the program.',
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

          // The same bounds as tokio::spawn.
          fn spawn<F>(future: F) -> JoinHandle<F::Output>
          where
              F: Future + Send + 'static,
              F::Output: Send + 'static,
          {
              thread::spawn(move || block_on(future))
          }

          fn main() {
              let files = vec![String::from("orders.csv"), String::from("stock.csv")];
              let handle = spawn(async move {
                  let mut total = 0;
                  for file in &files {
                      total += count_rows(file).await;
                  }
                  total
              });
              println!("{} files, {} rows", files.len(), handle.join().unwrap());
          }
        `,
      },
    ],
  },
  {
    id: 'as-future-used-as-value',
    track: 'async',
    title: 'Using a future as if it were the result',
    csharpReflex: 'Forgetting `await` on a `Task<string>` is usually caught because the types differ, and when it is not, the task still runs and you get the value later.',
    code: code`
      use std::future::Future;
      use std::pin::pin;
      use std::task::{Context, Poll, Waker};

      async fn fetch_customer_name(id: u32) -> String {
          format!("customer-{id}")
      }

      async fn greet(id: u32) {
          let name = fetch_customer_name(id);
          println!("{} chars", name.len());
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
          block_on(greet(7));
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0599',
    message: `error[E0599]: no method named \`len\` found for opaque type \`impl Future<Output = String>\` in the current scope
  --> src/main.rs:11:31
   |
11 |     println!("{} chars", name.len());
   |                               ^^^ method not found in \`impl Future<Output = String>\`
   |
help: consider \`await\`ing on the \`Future\` and calling the method on its \`Output\`
   |
11 |     println!("{} chars", name.await.len());
   |                               ++++++`,
    options: [
      {
        text: '`fetch_customer_name(id)` returns a future that produces a `String`, not a `String`. It has to be awaited first.',
        correct: true,
        why: 'Calling an `async fn` builds an `impl Future<Output = String>` and runs none of its body. That type has no `len` method. rustc even suggests `name.await.len()`.',
      },
      {
        text: '`name` is a `String` that was moved into `println!`, so `len` is called on a moved value.',
        why: '`println!` borrows its arguments; it never moves them. And a move would be E0382, not "method not found". Read the type in the message: `impl Future<Output = String>`.',
      },
      {
        text: '`len` needs `use std::string::String` or a trait import to be in scope.',
        why: '`String::len` is an inherent method and `String` is in the prelude. The method is missing because the value is not a `String` at all.',
      },
      {
        text: 'The future has not finished yet, so the result is not available at this point.',
        why: 'Closer to the C# mental model of a running `Task`, but there is nothing in progress: the future has never been polled and would never run on its own. This is a compile-time type error, not a timing issue.',
      },
    ],
    fixes: [
      {
        label: 'Await the call',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`.await` polls the future to completion inside `greet`\'s own state machine and yields the `String`. Postfix syntax chains, so `fetch_customer_name(id).await.len()` also works.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          async fn fetch_customer_name(id: u32) -> String {
              format!("customer-{id}")
          }

          async fn greet(id: u32) {
              let name = fetch_customer_name(id).await;
              println!("{} chars", name.len());
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
              block_on(greet(7));
          }
        `,
      },
      {
        label: 'Block on it inside the async function',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Same output with this toy executor. On a real runtime it is `.Result` inside an async method: tokio panics if you nest its `block_on`, and a hand-rolled one stalls the worker thread until the inner future finishes.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          async fn fetch_customer_name(id: u32) -> String {
              format!("customer-{id}")
          }

          async fn greet(id: u32) {
              let name = block_on(fetch_customer_name(id));
              println!("{} chars", name.len());
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
              block_on(greet(7));
          }
        `,
      },
      {
        label: 'Annotate the variable as `String`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'A type annotation does not convert anything. rustc now reports E0308, mismatched types, and suggests the same `.await`.',
        code: code`
          use std::future::Future;
          use std::pin::pin;
          use std::task::{Context, Poll, Waker};

          async fn fetch_customer_name(id: u32) -> String {
              format!("customer-{id}")
          }

          async fn greet(id: u32) {
              let name: String = fetch_customer_name(id);
              println!("{} chars", name.len());
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
              block_on(greet(7));
          }
        `,
      },
    ],
  },
];
