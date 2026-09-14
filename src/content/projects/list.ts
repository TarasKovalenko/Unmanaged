import { code } from '../code.ts';
import type { Project } from '../types.ts';

const cliTodo: Project = {
  id: 'proj-cli-todo',
  title: 'A command-line task list',
  summary: 'A `todo` CLI with subcommands, JSON file persistence, typed errors and unit tests.',
  dotnetEquivalent: 'Console app + System.CommandLine + System.Text.Json + xUnit',
  crates: [
    { name: 'clap', version: '4', dotnet: 'System.CommandLine', why: 'Derive a parser, help text and subcommands from a struct and an enum.' },
    { name: 'serde', version: '1', dotnet: 'System.Text.Json attributes / source generator', why: 'Compile-time generated (de)serialisation for your task types.' },
    { name: 'serde_json', version: '1', dotnet: 'JsonSerializer', why: 'The JSON format backend for serde.' },
  ],
  spec: [
    'Build `todo add "Renew TLS certificate"`, `todo list [--all]`, `todo done <id>` and `todo remove <id>`. Tasks are stored in a JSON file (default `tasks.json`, overridable with `--file`). A missing file means an empty list; a corrupt file is an error, never silently overwritten.',
    'In C# you would reach for exceptions and a mutable `List<TodoItem>` passed around freely. Here the core `TaskList` type returns `Result` from every operation that can fail, and `main` is the only place that turns an error into a message and an exit code.',
    'Keep the domain logic free of I/O and of clap, so it can be tested with plain `#[test]` functions and no temp files.',
  ],
  milestones: [
    {
      id: 'scaffold',
      title: 'Create the crate and add dependencies',
      goal: [
        'Create a binary crate and add the three dependencies with the features you need. This is `dotnet new console` plus `dotnet add package`, but features are part of the dependency line.',
      ],
      hints: [
        '`cargo new todo` creates `Cargo.toml`, `src/main.rs` and a git repository.',
        '`cargo add clap --features derive` edits `Cargo.toml` for you; do the same for serde.',
        'serde_json needs no features. Run `cargo build` once so the first compile is out of the way.',
      ],
      checkpoint: '`cargo run -- --help` compiles and prints the default hello world (clap is not wired up yet), and `Cargo.toml` lists all three crates.',
      code: {
        language: 'toml',
        caption: 'Cargo.toml',
        code: code`
          [package]
          name = "todo"
          version = "0.1.0"
          edition = "2024"

          [dependencies]
          clap = { version = "4", features = ["derive"] }
          serde = { version = "1", features = ["derive"] }
          serde_json = "1"
        `,
      },
    },
    {
      id: 'domain',
      title: 'Model tasks and typed errors',
      goal: [
        'Write `Task`, `TaskList` and a `TodoError` enum with no I/O. Operations that can fail (`add` with a blank title, `complete` on a missing or finished task) return `Result`, not a bool and not a panic.',
        'This is where you meet `iter_mut().find(..)` handing back a `&mut Task` that borrows the list, and why you can return `&Task` from `complete` but cannot push to the list while holding it.',
      ],
      hints: [
        'Start with `enum TodoError { EmptyTitle, NotFound(u32), AlreadyDone(u32) }` and implement `Display` so errors print nicely.',
        '`Option::ok_or(TodoError::NotFound(id))?` turns a failed `find` into an early return.',
        'Keep a `next_id` counter in `TaskList` rather than computing `max + 1`, so removed ids are never reused.',
        'Return filtered views as `impl Iterator<Item = &Task>` instead of building a new `Vec`.',
      ],
      checkpoint: 'The program below compiles and prints the pending task, then `error: task 1 is already done` and `error: task 99 does not exist`.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/tasks.rs (as a standalone program)',
        code: code`
          use std::fmt;

          #[derive(Debug, Clone, PartialEq)]
          struct Task {
              id: u32,
              title: String,
              done: bool,
          }

          #[derive(Debug, Default)]
          struct TaskList {
              next_id: u32,
              tasks: Vec<Task>,
          }

          #[derive(Debug, PartialEq)]
          enum TodoError {
              EmptyTitle,
              NotFound(u32),
              AlreadyDone(u32),
          }

          impl fmt::Display for TodoError {
              fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                  match self {
                      TodoError::EmptyTitle => write!(f, "task title cannot be empty"),
                      TodoError::NotFound(id) => write!(f, "task {id} does not exist"),
                      TodoError::AlreadyDone(id) => write!(f, "task {id} is already done"),
                  }
              }
          }

          impl std::error::Error for TodoError {}

          impl TaskList {
              fn add(&mut self, title: &str) -> Result<u32, TodoError> {
                  let title = title.trim();
                  if title.is_empty() {
                      return Err(TodoError::EmptyTitle);
                  }
                  self.next_id += 1;
                  self.tasks.push(Task { id: self.next_id, title: title.to_string(), done: false });
                  Ok(self.next_id)
              }

              fn complete(&mut self, id: u32) -> Result<&Task, TodoError> {
                  let task = self.tasks.iter_mut().find(|t| t.id == id).ok_or(TodoError::NotFound(id))?;
                  if task.done {
                      return Err(TodoError::AlreadyDone(id));
                  }
                  task.done = true;
                  Ok(&*task)
              }

              fn pending(&self) -> impl Iterator<Item = &Task> {
                  self.tasks.iter().filter(|t| !t.done)
              }
          }

          fn main() {
              let mut list = TaskList::default();
              let renew = list.add("Renew TLS certificate").unwrap();
              list.add("Rotate API keys").unwrap();
              list.complete(renew).unwrap();

              for task in list.pending() {
                  println!("[{}] {}", task.id, task.title);
              }
              if let Err(e) = list.complete(renew) {
                  println!("error: {e}");
              }
              if let Err(e) = list.complete(99) {
                  println!("error: {e}");
              }
          }
        `,
      },
    },
    {
      id: 'cli',
      title: 'Parse the command line with clap',
      goal: [
        'Describe the CLI as types: a `Cli` struct with global options and a `Command` enum with one variant per subcommand. clap generates `--help`, validation and error messages from them.',
        'Dispatch with a `match` on the enum. Because it is exhaustive, adding a subcommand later forces you to handle it.',
      ],
      hints: [
        'Doc comments (`///`) on fields and variants become help text.',
        'Positional arguments are plain fields; options need `#[arg(long)]`.',
        'Use `PathBuf` for the file option and `#[arg(long, default_value = "tasks.json")]`.',
        'Parse with `Cli::parse()`; it exits with a usage message on bad input, like System.CommandLine does.',
      ],
      checkpoint: '`cargo run -- --help` lists add, list, done and remove; `cargo run -- done abc` prints a clap error saying `abc` is not a valid value.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses the clap crate (derive feature).',
        caption: 'src/main.rs',
        code: code`
          use clap::{Parser, Subcommand};
          use std::path::PathBuf;

          /// A small task list stored in a JSON file.
          #[derive(Parser)]
          #[command(name = "todo", version)]
          struct Cli {
              /// Path to the task file
              #[arg(long, global = true, default_value = "tasks.json")]
              file: PathBuf,

              #[command(subcommand)]
              command: Command,
          }

          #[derive(Subcommand)]
          enum Command {
              /// Add a task
              Add { title: String },
              /// List pending tasks
              List {
                  /// Include finished tasks
                  #[arg(long)]
                  all: bool,
              },
              /// Mark a task as done
              Done { id: u32 },
              /// Delete a task
              Remove { id: u32 },
          }

          fn main() {
              let cli = Cli::parse();
              match cli.command {
                  Command::Add { title } => println!("would add {title:?} to {}", cli.file.display()),
                  Command::List { all } => println!("would list (all: {all})"),
                  Command::Done { id } => println!("would complete {id}"),
                  Command::Remove { id } => println!("would remove {id}"),
              }
          }
        `,
      },
    },
    {
      id: 'persistence',
      title: 'Load and save the list as JSON',
      goal: [
        'Derive `Serialize` and `Deserialize` on `Task` and `TaskList`, then write `load(path)` and `save(path, &list)`. A missing file is an empty list; any other I/O or JSON failure is an error.',
        'Give the store its own error enum with `From` impls, so `?` converts `io::Error` and `serde_json::Error` automatically.',
      ],
      hints: [
        'Match on `fs::read_to_string(path)`, with a guard `Err(e) if e.kind() == io::ErrorKind::NotFound`.',
        '`impl From<io::Error> for StoreError` is what lets `?` work across error types. There is no implicit base class to catch.',
        'Write to a temporary file and `fs::rename` it over the original, so a crash mid-write cannot corrupt the list.',
        '`serde_json::to_string_pretty` keeps the file readable in diffs.',
      ],
      checkpoint: '`todo add "Rotate API keys"` creates `tasks.json`; running `todo list` in a new process shows the task; hand-corrupting the file makes `todo list` fail with a JSON error and leaves the file untouched.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses serde (derive) and serde_json.',
        caption: 'src/store.rs',
        code: code`
          use serde::{Deserialize, Serialize};
          use std::{fmt, fs, io, path::Path};

          #[derive(Debug, Default, Serialize, Deserialize)]
          pub struct TaskList {
              next_id: u32,
              tasks: Vec<Task>,
          }

          #[derive(Debug, Clone, Serialize, Deserialize)]
          pub struct Task {
              id: u32,
              title: String,
              done: bool,
          }

          #[derive(Debug)]
          pub enum StoreError {
              Io(io::Error),
              Json(serde_json::Error),
          }

          impl fmt::Display for StoreError {
              fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                  match self {
                      StoreError::Io(e) => write!(f, "could not access task file: {e}"),
                      StoreError::Json(e) => write!(f, "task file is not valid JSON: {e}"),
                  }
              }
          }

          impl std::error::Error for StoreError {}

          impl From<io::Error> for StoreError {
              fn from(e: io::Error) -> Self { StoreError::Io(e) }
          }

          impl From<serde_json::Error> for StoreError {
              fn from(e: serde_json::Error) -> Self { StoreError::Json(e) }
          }

          pub fn load(path: &Path) -> Result<TaskList, StoreError> {
              match fs::read_to_string(path) {
                  Ok(text) => Ok(serde_json::from_str(&text)?),
                  Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(TaskList::default()),
                  Err(e) => Err(e.into()),
              }
          }

          pub fn save(path: &Path, list: &TaskList) -> Result<(), StoreError> {
              let json = serde_json::to_string_pretty(list)?;
              let tmp = path.with_extension("json.tmp");
              fs::write(&tmp, json)?;
              fs::rename(&tmp, path)?;
              Ok(())
          }
        `,
      },
    },
    {
      id: 'exit-codes',
      title: 'Report errors and exit codes from main',
      goal: [
        'Move all work into `fn run() -> Result<(), Box<dyn Error>>` and let `main` print the error chain and return an `ExitCode`. This replaces a top-level `try/catch` in `Program.cs` that sets `Environment.ExitCode`.',
        'Walk `Error::source()` to print wrapped causes, the equivalent of logging `InnerException`s.',
      ],
      hints: [
        '`Box<dyn Error>` accepts any error type through `?`, because of a blanket `From` impl.',
        'Return `ExitCode::from(2)` for user errors so scripts can tell them apart from success.',
        'Implement `source()` on your error enum for variants that wrap another error.',
      ],
      checkpoint: 'The program below compiles and prints `error: could not load tasks.json` followed by `  caused by: permission denied`, and exits with code 2.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/main.rs (error plumbing only)',
        code: code`
          use std::error::Error;
          use std::fmt;
          use std::io;
          use std::process::ExitCode;

          #[derive(Debug)]
          struct LoadError {
              path: String,
              source: io::Error,
          }

          impl fmt::Display for LoadError {
              fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                  write!(f, "could not load {}", self.path)
              }
          }

          impl Error for LoadError {
              fn source(&self) -> Option<&(dyn Error + 'static)> {
                  Some(&self.source)
              }
          }

          fn load(path: &str) -> Result<Vec<String>, LoadError> {
              let source = io::Error::new(io::ErrorKind::PermissionDenied, "permission denied");
              Err(LoadError { path: path.to_string(), source })
          }

          fn run() -> Result<(), Box<dyn Error>> {
              let tasks = load("tasks.json")?;
              println!("{} tasks", tasks.len());
              Ok(())
          }

          fn main() -> ExitCode {
              match run() {
                  Ok(()) => ExitCode::SUCCESS,
                  Err(e) => {
                      eprintln!("error: {e}");
                      let mut cause = e.source();
                      while let Some(inner) = cause {
                          eprintln!("  caused by: {inner}");
                          cause = inner.source();
                      }
                      ExitCode::from(2)
                  }
              }
          }
        `,
      },
    },
    {
      id: 'tests',
      title: 'Test the domain with cargo test',
      goal: [
        'Add a `#[cfg(test)] mod tests` next to `TaskList` and cover each error path. Assert on the exact `TodoError` variant, which is only possible because errors are values with `PartialEq`, not exception types.',
      ],
      hints: [
        '`use super::*;` gives the test module access to private items, so no `InternalsVisibleTo` is needed.',
        '`assert_eq!(list.complete(9), Err(TodoError::NotFound(9)))` needs `PartialEq` and `Debug` on both the `Ok` and `Err` types.',
        '`assert!(matches!(result, Err(TodoError::EmptyTitle)))` works when the `Ok` type does not implement `PartialEq`.',
        'For the store, write to a path under `std::env::temp_dir()` and remove it at the end, or use the `tempfile` crate.',
      ],
      checkpoint: '`cargo test` reports at least four passing tests, and deliberately breaking the blank-title check makes exactly one of them fail.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/tasks.rs (tests at the bottom)',
        code: code`
          #[derive(Debug, PartialEq)]
          enum TodoError {
              EmptyTitle,
              NotFound(u32),
          }

          #[derive(Debug, Default)]
          struct TaskList {
              next_id: u32,
              titles: Vec<(u32, String)>,
          }

          impl TaskList {
              fn add(&mut self, title: &str) -> Result<u32, TodoError> {
                  if title.trim().is_empty() {
                      return Err(TodoError::EmptyTitle);
                  }
                  self.next_id += 1;
                  self.titles.push((self.next_id, title.trim().to_string()));
                  Ok(self.next_id)
              }

              fn remove(&mut self, id: u32) -> Result<String, TodoError> {
                  let index = self.titles.iter().position(|(i, _)| *i == id).ok_or(TodoError::NotFound(id))?;
                  Ok(self.titles.remove(index).1)
              }
          }

          fn main() {
              let mut list = TaskList::default();
              let id = list.add("Renew TLS certificate").unwrap();
              println!("removed {:?}", list.remove(id));
          }

          #[cfg(test)]
          mod tests {
              use super::*;

              #[test]
              fn blank_title_is_rejected() {
                  let mut list = TaskList::default();
                  assert_eq!(list.add("   "), Err(TodoError::EmptyTitle));
              }

              #[test]
              fn ids_are_not_reused_after_remove() {
                  let mut list = TaskList::default();
                  let first = list.add("a").unwrap();
                  list.remove(first).unwrap();
                  assert_eq!(list.add("b"), Ok(2));
              }

              #[test]
              fn removing_missing_task_fails() {
                  let mut list = TaskList::default();
                  assert_eq!(list.remove(7), Err(TodoError::NotFound(7)));
              }

              #[test]
              fn remove_returns_the_title() {
                  let mut list = TaskList::default();
                  let id = list.add("  Rotate API keys ").unwrap();
                  assert_eq!(list.remove(id), Ok("Rotate API keys".to_string()));
              }
          }
        `,
      },
    },
  ],
  stretch: [
    'Add `todo edit <id> <title>` and a `--json` flag on `list` that prints machine-readable output with `serde_json::to_writer(io::stdout(), ..)`.',
    'Add due dates with the `jiff` or `chrono` crate and sort `list` by due date, overdue first.',
    'Replace the hand-written `Display` and `From` impls with `thiserror` and compare the amount of code.',
    'Write an integration test in `tests/cli.rs` that runs the built binary with `assert_cmd` against a temp directory.',
  ],
  exercises: ['ownership', 'option-result', 'structs'],
};

const logAnalyzer: Project = {
  id: 'proj-log-analyzer',
  title: 'A web server log analyzer',
  summary: 'Parse an access log and report the top endpoints and status codes, borrowing from the input buffer instead of copying.',
  dotnetEquivalent: 'Console app + File.ReadLines + LINQ GroupBy (+ PLINQ for the stretch)',
  crates: [
    { name: 'rayon', version: '1', dotnet: 'PLINQ / Parallel.ForEach', why: 'Only for the final milestone: parallel parsing with a one-word change from `lines()` to `par_lines()`.' },
  ],
  spec: [
    'Read a Common Log Format access log (`203.0.113.9 - - [12/Sep/2026:10:15:32 +0000] "GET /api/orders/42 HTTP/1.1" 200 512`) and print the ten most requested paths, a count per status code, total bytes, and the number of malformed lines.',
    'The C# version allocates a `string` per field per line without a second thought. The Rust version should allocate almost nothing: read the file into one `String` and parse each line into a `LogEntry<\'a>` whose fields are `&\'a str` slices of that buffer. This is lifetimes in practice: the compiler proves no entry outlives the text it points into.',
    'Everything up to the last milestone uses only the standard library.',
  ],
  milestones: [
    {
      id: 'parse-line',
      title: 'Parse one line into borrowed fields',
      goal: [
        'Write `fn parse_line(line: &str) -> Option<LogEntry<\'_>>`. The struct holds `&str` fields pointing into `line`, plus parsed numbers.',
        'Resist `Regex` and `.to_string()`. `split_once`, `split` and `split_whitespace` return slices of the original string, so parsing allocates nothing.',
      ],
      hints: [
        'A struct that holds references needs a lifetime parameter: `struct LogEntry<\'a> { path: &\'a str, .. }`.',
        'The request is between the first pair of double quotes: `rest.split_once(\'"\')` twice.',
        'Inside a function returning `Option`, `?` on each `Option` bails out on the first missing piece, like a chain of `TryParse` checks.',
        'The byte count is `-` when there is no body; treat that as 0 rather than a malformed line.',
      ],
      checkpoint: 'The program prints `GET /api/orders/42 -> 200 (512 bytes) from 203.0.113.9` and `malformed` for the second line.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/main.rs',
        code: code`
          struct LogEntry<'a> {
              ip: &'a str,
              method: &'a str,
              path: &'a str,
              status: u16,
              bytes: u64,
          }

          fn parse_line(line: &str) -> Option<LogEntry<'_>> {
              let (ip, rest) = line.split_once(' ')?;
              let (_, rest) = rest.split_once('"')?;
              let (request, rest) = rest.split_once('"')?;

              let mut request_parts = request.split(' ');
              let method = request_parts.next()?;
              let path = request_parts.next()?;

              let mut tail = rest.split_whitespace();
              let status = tail.next()?.parse().ok()?;
              let bytes = tail.next()?.parse().unwrap_or(0);

              Some(LogEntry { ip, method, path, status, bytes })
          }

          fn main() {
              let lines = [
                  r#"203.0.113.9 - - [12/Sep/2026:10:15:32 +0000] "GET /api/orders/42 HTTP/1.1" 200 512"#,
                  "garbage without quotes",
              ];
              for line in lines {
                  match parse_line(line) {
                      Some(e) => println!("{} {} -> {} ({} bytes) from {}", e.method, e.path, e.status, e.bytes, e.ip),
                      None => println!("malformed"),
                  }
              }
          }
        `,
      },
    },
    {
      id: 'aggregate',
      title: 'Count endpoints and status codes',
      goal: [
        'Fold every entry into a `Report<\'a>` with `HashMap<&\'a str, usize>` for paths and `HashMap<u16, usize>` for status codes. The keys are still slices of the input, so building the report copies no strings.',
        'Then sort the path counts into a top-ten list. There is no `OrderByDescending(..).Take(10)`: collect into a `Vec` and sort it.',
      ],
      hints: [
        '`*report.paths.entry(entry.path).or_insert(0) += 1;` is the `GetValueOrDefault + 1` idiom with one lookup.',
        'Strip query strings before counting: `path.split(\'?\').next().unwrap_or(path)`.',
        'Sort by count descending, then path ascending for a stable report: `sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)))`.',
        'Notice that `Report<\'a>` cannot outlive the `&str` it was built from. Try returning it from a function that owns the text and read the error.',
      ],
      checkpoint: 'The program prints `/api/orders` with 3 hits first, `/health` with 2 hits second, and `malformed lines: 1`.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/main.rs',
        code: code`
          use std::collections::HashMap;

          struct LogEntry<'a> {
              path: &'a str,
              status: u16,
              bytes: u64,
          }

          fn parse_line(line: &str) -> Option<LogEntry<'_>> {
              let (_, rest) = line.split_once('"')?;
              let (request, rest) = rest.split_once('"')?;
              let path = request.split(' ').nth(1)?;
              let mut tail = rest.split_whitespace();
              let status = tail.next()?.parse().ok()?;
              let bytes = tail.next()?.parse().unwrap_or(0);
              Some(LogEntry { path, status, bytes })
          }

          #[derive(Default)]
          struct Report<'a> {
              paths: HashMap<&'a str, usize>,
              statuses: HashMap<u16, usize>,
              bytes: u64,
              malformed: usize,
          }

          fn analyze(text: &str) -> Report<'_> {
              let mut report = Report::default();
              for line in text.lines().filter(|l| !l.trim().is_empty()) {
                  let Some(entry) = parse_line(line) else {
                      report.malformed += 1;
                      continue;
                  };
                  let path = entry.path.split('?').next().unwrap_or(entry.path);
                  *report.paths.entry(path).or_insert(0) += 1;
                  *report.statuses.entry(entry.status).or_insert(0) += 1;
                  report.bytes += entry.bytes;
              }
              report
          }

          fn top_paths<'a>(report: &Report<'a>, n: usize) -> Vec<(&'a str, usize)> {
              let mut counts: Vec<(&str, usize)> = report.paths.iter().map(|(p, c)| (*p, *c)).collect();
              counts.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
              counts.truncate(n);
              counts
          }

          const SAMPLE: &str = r#"
          203.0.113.9 - - [12/Sep/2026:10:15:32 +0000] "GET /api/orders?page=2 HTTP/1.1" 200 512
          203.0.113.9 - - [12/Sep/2026:10:15:33 +0000] "GET /health HTTP/1.1" 200 2
          198.51.100.4 - - [12/Sep/2026:10:15:34 +0000] "POST /api/orders HTTP/1.1" 201 88
          198.51.100.4 - - [12/Sep/2026:10:15:35 +0000] "GET /api/orders HTTP/1.1" 500 -
          198.51.100.7 - - [12/Sep/2026:10:15:36 +0000] "GET /health HTTP/1.1" 200 2
          this line is truncated
          "#;

          fn main() {
              let report = analyze(SAMPLE);
              for (path, hits) in top_paths(&report, 10) {
                  println!("{hits:>6}  {path}");
              }
              let mut statuses: Vec<_> = report.statuses.iter().collect();
              statuses.sort();
              for (status, count) in statuses {
                  println!("status {status}: {count}");
              }
              println!("bytes: {}", report.bytes);
              println!("malformed lines: {}", report.malformed);
          }
        `,
      },
    },
    {
      id: 'errors',
      title: 'Explain why a line was rejected',
      goal: [
        'Replace `Option` with `Result<LogEntry<\'_>, ParseError>` so the report can show the first few malformed lines with a line number and a reason. The error borrows nothing, so it can outlive the line.',
      ],
      hints: [
        '`ok_or(ParseError::MissingRequest)?` converts each `Option` step into a specific error.',
        'Number parsing errors carry their own type (`ParseIntError`). Wrap it in a variant or map it to a reason with `map_err`.',
        'Use `enumerate()` on `lines()` and add 1 for human line numbers.',
        'Store at most five examples in a `Vec<(usize, ParseError)>`; count the rest.',
      ],
      checkpoint: 'The program prints `line 2: missing quoted request` and `line 3: status "OK" is not a number`.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/parse.rs (as a standalone program)',
        code: code`
          use std::fmt;

          #[derive(Debug)]
          enum ParseError {
              MissingRequest,
              MissingPath,
              BadStatus(String),
          }

          impl fmt::Display for ParseError {
              fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                  match self {
                      ParseError::MissingRequest => write!(f, "missing quoted request"),
                      ParseError::MissingPath => write!(f, "request has no path"),
                      ParseError::BadStatus(s) => write!(f, "status {s:?} is not a number"),
                  }
              }
          }

          struct LogEntry<'a> {
              path: &'a str,
              status: u16,
          }

          fn parse_line(line: &str) -> Result<LogEntry<'_>, ParseError> {
              let (_, rest) = line.split_once('"').ok_or(ParseError::MissingRequest)?;
              let (request, rest) = rest.split_once('"').ok_or(ParseError::MissingRequest)?;
              let path = request.split(' ').nth(1).ok_or(ParseError::MissingPath)?;
              let raw_status = rest.split_whitespace().next().unwrap_or("");
              let status = raw_status
                  .parse()
                  .map_err(|_| ParseError::BadStatus(raw_status.to_string()))?;
              Ok(LogEntry { path, status })
          }

          fn main() {
              let text = "10.0.0.1 - - [x] \"GET /health HTTP/1.1\" 200 2\nno request here\n10.0.0.2 - - [x] \"GET /api HTTP/1.1\" OK 0";
              let mut rejected = Vec::new();
              for (index, line) in text.lines().enumerate() {
                  match parse_line(line) {
                      Ok(entry) => println!("ok: {} {}", entry.status, entry.path),
                      Err(e) if rejected.len() < 5 => rejected.push((index + 1, e)),
                      Err(_) => {}
                  }
              }
              for (line_no, e) in &rejected {
                  println!("line {line_no}: {e}");
              }
          }
        `,
      },
    },
    {
      id: 'read-file',
      title: 'Read a real file and feel the lifetime',
      goal: [
        'Take the log path from the command line, read the whole file into a `String`, and analyze it. The `Report` borrows from that `String`, so the `String` must live in `main` for as long as the report does.',
        'Then try the streaming version with `BufReader::lines()` for files that do not fit in memory. Each line is a fresh `String` dropped at the end of the loop body, so `HashMap<&str, usize>` stops compiling. Switching to owned keys is the fix, and `get_mut` before `insert` avoids allocating for keys you have already seen.',
      ],
      hints: [
        '`std::env::args().nth(1)` is `args[0]` in C#: `nth(0)` is the program name.',
        'Write `fn analyze(text: &str) -> Report<\'_>` and call it with `&text`. Returning `Report` from a function that also reads the file is the classic error: the buffer would be dropped while the report still points into it.',
        'For streaming, count into `HashMap<String, usize>` with `if let Some(n) = counts.get_mut(path) { *n += 1 } else { counts.insert(path.to_owned(), 1); }`.',
        'Compare memory use of both versions on a large file with `/usr/bin/time -l` (macOS) or `-v` (Linux).',
      ],
      checkpoint: '`cargo run --release -- access.log` prints the report for a real log; the streaming version produces identical numbers on the same file.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/main.rs (streaming variant)',
        code: code`
          use std::collections::HashMap;
          use std::fs::File;
          use std::io::{self, BufRead, BufReader};

          fn path_of(line: &str) -> Option<&str> {
              let (_, rest) = line.split_once('"')?;
              let (request, _) = rest.split_once('"')?;
              let path = request.split(' ').nth(1)?;
              Some(path.split('?').next().unwrap_or(path))
          }

          fn count_paths(reader: impl BufRead) -> io::Result<HashMap<String, usize>> {
              let mut counts: HashMap<String, usize> = HashMap::new();
              for line in reader.lines() {
                  let line = line?;
                  let Some(path) = path_of(&line) else { continue };
                  // \`line\` is dropped at the end of this iteration, so the key must be owned.
                  if let Some(n) = counts.get_mut(path) {
                      *n += 1;
                  } else {
                      counts.insert(path.to_owned(), 1);
                  }
              }
              Ok(counts)
          }

          fn main() -> io::Result<()> {
              let Some(path) = std::env::args().nth(1) else {
                  eprintln!("usage: log-analyzer <access.log>");
                  return Ok(());
              };
              let counts = count_paths(BufReader::new(File::open(&path)?))?;
              let mut top: Vec<_> = counts.into_iter().collect();
              top.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
              for (path, hits) in top.iter().take(10) {
                  println!("{hits:>8}  {path}");
              }
              Ok(())
          }
        `,
      },
    },
    {
      id: 'time-window',
      title: 'Add a busiest-minute breakdown',
      goal: [
        'Group requests per minute using the timestamp between `[` and `]`, and print the three busiest minutes. Use a `BTreeMap<&str, usize>` keyed by the `12/Sep/2026:10:15` prefix, so iteration is already ordered by time.',
        'This is a `GroupBy` over a derived key. It should still borrow the key from the buffer.',
      ],
      hints: [
        'The timestamp slice is `line.split_once(\'[\')?.1.split_once(\']\')?.0`.',
        'The minute key is the first 17 bytes: `ts.get(..17)?`. `get` returns `None` instead of panicking if the line is short or the index is not on a character boundary.',
        '`BTreeMap` is `SortedDictionary`; take the top three by collecting into a `Vec` and sorting by count.',
      ],
      checkpoint: 'On the sample log from the aggregate milestone every request falls in `12/Sep/2026:10:15`, which is reported with 5 requests.',
    },
    {
      id: 'parallel',
      title: 'Parse in parallel with rayon',
      goal: [
        'Replace `text.lines()` with `text.par_lines()` and combine per-thread reports with `fold` and `reduce`. The `Report<\'a>` still borrows from one shared buffer; `&str` is `Send` and `Sync`, so the compiler allows it without locks.',
        'Measure before and after on a log of a few hundred megabytes. Parsing is cheap relative to reading, so the speed-up is real but sub-linear.',
      ],
      hints: [
        'Add `rayon = "1"` and `use rayon::prelude::*;`.',
        '`fold(Report::default, |mut r, line| { r.add_line(line); r })` builds one report per worker; `reduce(Report::default, Report::merge)` combines them.',
        '`merge` takes two reports by value and adds the counts of the smaller map into the larger one.',
        'Always benchmark with `--release`; debug builds can be ten times slower.',
      ],
      checkpoint: 'The parallel and sequential versions print identical reports, and the parallel one is measurably faster on a large file.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses the rayon crate.',
        caption: 'src/main.rs (parallel analyze)',
        code: code`
          use rayon::prelude::*;
          use std::collections::HashMap;

          #[derive(Default)]
          struct Report<'a> {
              paths: HashMap<&'a str, usize>,
              malformed: usize,
          }

          impl<'a> Report<'a> {
              fn add_line(&mut self, line: &'a str) {
                  match path_of(line) {
                      Some(path) => *self.paths.entry(path).or_insert(0) += 1,
                      None => self.malformed += 1,
                  }
              }

              fn merge(mut self, mut other: Report<'a>) -> Report<'a> {
                  if self.paths.len() < other.paths.len() {
                      std::mem::swap(&mut self, &mut other);
                  }
                  for (path, n) in other.paths {
                      *self.paths.entry(path).or_insert(0) += n;
                  }
                  self.malformed += other.malformed;
                  self
              }
          }

          fn path_of(line: &str) -> Option<&str> {
              let (_, rest) = line.split_once('"')?;
              rest.split_once('"')?.0.split(' ').nth(1)
          }

          fn analyze(text: &str) -> Report<'_> {
              text.par_lines()
                  .fold(Report::default, |mut report, line| {
                      report.add_line(line);
                      report
                  })
                  .reduce(Report::default, Report::merge)
          }

          fn main() -> std::io::Result<()> {
              let path = std::env::args().nth(1).expect("usage: log-analyzer <file>");
              let text = std::fs::read_to_string(path)?;
              let report = analyze(&text);
              println!("{} distinct paths, {} malformed", report.paths.len(), report.malformed);
              Ok(())
          }
        `,
      },
    },
  ],
  stretch: [
    'Accept `-` as the path and read from `stdin().lock()`, so the tool works in a pipeline with `zcat`.',
    'Memory-map the file with the `memmap2` crate and parse `&[u8]` directly, skipping UTF-8 validation.',
    'Add percentile response sizes (p50, p95) per endpoint using a sorted `Vec<u64>` per path.',
    'Write a criterion benchmark comparing the borrowed and owned-key parsers.',
  ],
  exercises: ['ownership', 'option-result', 'structs', 'rustc-errors'],
};

const minimalApi: Project = {
  id: 'proj-minimal-api',
  title: 'A JSON REST API for orders',
  summary: 'An in-memory orders service with axum: typed JSON, shared state, proper error responses, structured logging and integration tests.',
  dotnetEquivalent: 'ASP.NET Core Minimal API + System.Text.Json + ILogger + WebApplicationFactory',
  crates: [
    { name: 'axum', version: '0.8', dotnet: 'ASP.NET Core Minimal API', why: 'Router, extractors (`Json`, `Path`, `State`) and the `IntoResponse` trait.' },
    { name: 'tokio', version: '1', dotnet: 'Kestrel thread pool + TPL', why: 'The async runtime that runs the server and your handlers.' },
    { name: 'serde', version: '1', dotnet: 'System.Text.Json attributes', why: 'Derive request and response (de)serialisation.' },
    { name: 'serde_json', version: '1', dotnet: 'JsonSerializer', why: 'JSON bodies, and `json!` for ad hoc error payloads.' },
    { name: 'tracing', version: '0.1', dotnet: 'ILogger / Serilog', why: 'Structured log events and spans.' },
    { name: 'tracing-subscriber', version: '0.3', dotnet: 'Serilog sinks / logging providers', why: 'Formats and filters the events; the `env-filter` feature reads log levels from an environment variable.' },
    { name: 'tower-http', version: '0.6', dotnet: 'UseHttpLogging middleware', why: '`TraceLayer` logs every request with method, path, status and latency.' },
    { name: 'tower', version: '0.5', dotnet: 'WebApplicationFactory / TestServer', why: 'Dev-dependency: `ServiceExt::oneshot` sends a request to the router without opening a socket.' },
    { name: 'http-body-util', version: '0.1', dotnet: 'HttpContent.ReadAsStringAsync', why: 'Dev-dependency: collect a response body in tests.' },
  ],
  spec: [
    'Expose `POST /orders` (create, returns 201 with the order), `GET /orders` (list), `GET /orders/{id}` (404 when missing) and `POST /orders/{id}/cancel` (409 when already shipped). Orders have an id, a customer email, lines with SKU, quantity and unit price in cents, and a status.',
    'In ASP.NET Core you would register a singleton repository in DI and inject it. axum has no container: you build an `AppState` in `main`, wrap the mutable part in `Arc<RwLock<_>>`, and handlers ask for it with the `State` extractor. Validation failures and missing orders become an `ApiError` enum that implements `IntoResponse`, replacing `Results.NotFound()` and `ProblemDetails`.',
    'Build the router in a `fn app(state: AppState) -> Router` so tests can call it directly.',
  ],
  milestones: [
    {
      id: 'scaffold',
      title: 'Hello, JSON',
      goal: [
        'Create the crate, add dependencies, and serve `GET /health` returning `{"status":"ok"}` on port 3000. This is `app.MapGet("/health", () => new { status = "ok" })`, with an explicit runtime and listener.',
      ],
      hints: [
        '`#[tokio::main]` turns `async fn main` into a normal `main` that starts the runtime.',
        'Return `Json(serde_json::json!({ "status": "ok" }))`; `Json<T>` implements `IntoResponse` for any `T: Serialize`.',
        'Bind with `tokio::net::TcpListener::bind("127.0.0.1:3000")` and hand it to `axum::serve`.',
      ],
      checkpoint: '`curl -s localhost:3000/health` prints `{"status":"ok"}`.',
      code: {
        language: 'toml',
        caption: 'Cargo.toml',
        code: code`
          [package]
          name = "orders-api"
          version = "0.1.0"
          edition = "2024"

          [dependencies]
          axum = "0.8"
          tokio = { version = "1", features = ["full"] }
          serde = { version = "1", features = ["derive"] }
          serde_json = "1"
          tracing = "0.1"
          tracing-subscriber = "0.3"
          tower-http = { version = "0.6", features = ["trace"] }

          [dev-dependencies]
          tower = { version = "0.5", features = ["util"] }
          http-body-util = "0.1"
        `,
      },
    },
    {
      id: 'store',
      title: 'Design the shared store without the framework',
      goal: [
        'Write the order store as plain Rust first: a `Clone`able handle around `Arc<RwLock<HashMap<u64, Order>>>`. Cloning the handle clones the `Arc`, so every handler shares one map, the way a DI singleton would.',
        'Choose between `Mutex` and `RwLock` deliberately. `RwLock` lets many `GET`s read at once; `Mutex` is simpler and often as fast when critical sections are tiny. Both guards unlock on drop, and neither should be held across an `.await`.',
      ],
      hints: [
        'Methods take `&self`, not `&mut self`: the lock provides the mutability. This is interior mutability, the part that feels most like C#.',
        'Return clones (`Option<Order>`) from reads so the guard is released before the handler serialises the response.',
        'Keep the id counter inside the same lock as the map, or use an `AtomicU64`, so two concurrent creates cannot get the same id.',
        'Spawning threads that share the store is a quick way to prove it is `Send + Sync` before axum asks for it.',
      ],
      checkpoint: 'The program below compiles, creates 8 orders from 4 threads, and prints `8 orders, ids unique: true`.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/store.rs (as a standalone program)',
        code: code`
          use std::collections::{HashMap, HashSet};
          use std::sync::{Arc, RwLock};
          use std::thread;

          #[derive(Debug, Clone, Copy, PartialEq)]
          enum Status {
              Placed,
              Cancelled,
          }

          #[derive(Debug, Clone)]
          struct Order {
              id: u64,
              customer: String,
              status: Status,
          }

          #[derive(Default)]
          struct Inner {
              next_id: u64,
              orders: HashMap<u64, Order>,
          }

          #[derive(Clone, Default)]
          struct OrderStore {
              inner: Arc<RwLock<Inner>>,
          }

          impl OrderStore {
              fn create(&self, customer: &str) -> Order {
                  let mut inner = self.inner.write().unwrap();
                  inner.next_id += 1;
                  let order = Order { id: inner.next_id, customer: customer.to_string(), status: Status::Placed };
                  inner.orders.insert(order.id, order.clone());
                  order
              }

              fn get(&self, id: u64) -> Option<Order> {
                  self.inner.read().unwrap().orders.get(&id).cloned()
              }

              fn cancel(&self, id: u64) -> Option<Order> {
                  let mut inner = self.inner.write().unwrap();
                  let order = inner.orders.get_mut(&id)?;
                  order.status = Status::Cancelled;
                  Some(order.clone())
              }

              fn all(&self) -> Vec<Order> {
                  self.inner.read().unwrap().orders.values().cloned().collect()
              }
          }

          fn main() {
              let store = OrderStore::default();
              let handles: Vec<_> = (0..4)
                  .map(|worker| {
                      let store = store.clone();
                      thread::spawn(move || {
                          for _ in 0..2 {
                              store.create(&format!("worker{worker}@example.com"));
                          }
                      })
                  })
                  .collect();
              for h in handles {
                  h.join().unwrap();
              }

              let orders = store.all();
              let ids: HashSet<u64> = orders.iter().map(|o| o.id).collect();
              println!("{} orders, ids unique: {}", orders.len(), ids.len() == orders.len());

              let cancelled = store.cancel(1).map(|o| o.status);
              println!("order 1 after cancel: {cancelled:?}");
              if let Some(order) = store.get(1) {
                  println!("order 1 belongs to {}", order.customer);
              }
          }
        `,
      },
    },
    {
      id: 'routes',
      title: 'Wire handlers, extractors and state',
      goal: [
        'Add the four routes. Handlers are `async fn`s whose parameters are extractors: `State<AppState>`, `Path<u64>`, `Json<CreateOrder>`. The request body extractor must be the last parameter, because it consumes the body.',
        'Return `(StatusCode::CREATED, Json(order))` from create. Tuples of status, headers and body all implement `IntoResponse`.',
      ],
      hints: [
        'axum 0.8 path parameters use braces: `.route("/orders/{id}", get(get_order))`.',
        'Chain methods on one path: `post(create_order).get(list_orders)`.',
        'Separate the request DTO (`CreateOrder`, `Deserialize`) from the stored model (`Order`, `Serialize`), as you would in C#.',
        'If a handler does not compile with a long "the trait `Handler<_, _>` is not implemented" error, add `#[axum::debug_handler]` (feature `macros`) to get a readable message.',
      ],
      checkpoint: '`curl -s -X POST localhost:3000/orders -H "content-type: application/json" -d \'{"customer":"ada@example.com","lines":[{"sku":"KB-01","quantity":1,"unit_price_cents":8900}]}\'` returns 201 with an id, and `GET /orders/1` returns the same order.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses axum 0.8, tokio and serde.',
        caption: 'src/main.rs',
        code: code`
          use axum::{
              Json, Router,
              extract::{Path, State},
              http::StatusCode,
              routing::{get, post},
          };
          use serde::{Deserialize, Serialize};
          use std::collections::HashMap;
          use std::sync::{Arc, RwLock};

          #[derive(Clone, Serialize)]
          struct OrderLine {
              sku: String,
              quantity: u32,
              unit_price_cents: i64,
          }

          #[derive(Clone, Serialize)]
          struct Order {
              id: u64,
              customer: String,
              lines: Vec<OrderLine>,
          }

          #[derive(Deserialize)]
          struct CreateLine {
              sku: String,
              quantity: u32,
              unit_price_cents: i64,
          }

          #[derive(Deserialize)]
          struct CreateOrder {
              customer: String,
              lines: Vec<CreateLine>,
          }

          #[derive(Clone, Default)]
          struct AppState {
              orders: Arc<RwLock<HashMap<u64, Order>>>,
          }

          fn app(state: AppState) -> Router {
              Router::new()
                  .route("/orders", post(create_order).get(list_orders))
                  .route("/orders/{id}", get(get_order))
                  .with_state(state)
          }

          async fn create_order(State(state): State<AppState>, Json(req): Json<CreateOrder>) -> (StatusCode, Json<Order>) {
              let mut orders = state.orders.write().unwrap();
              let id = orders.len() as u64 + 1;
              let lines = req
                  .lines
                  .into_iter()
                  .map(|l| OrderLine { sku: l.sku, quantity: l.quantity, unit_price_cents: l.unit_price_cents })
                  .collect();
              let order = Order { id, customer: req.customer, lines };
              orders.insert(id, order.clone());
              (StatusCode::CREATED, Json(order))
          }

          async fn list_orders(State(state): State<AppState>) -> Json<Vec<Order>> {
              Json(state.orders.read().unwrap().values().cloned().collect())
          }

          async fn get_order(State(state): State<AppState>, Path(id): Path<u64>) -> Result<Json<Order>, StatusCode> {
              state.orders.read().unwrap().get(&id).cloned().map(Json).ok_or(StatusCode::NOT_FOUND)
          }

          #[tokio::main]
          async fn main() {
              let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
              axum::serve(listener, app(AppState::default())).await.unwrap();
          }
        `,
      },
    },
    {
      id: 'errors',
      title: 'Error responses with IntoResponse',
      goal: [
        'Replace bare status codes with an `ApiError` enum (`NotFound(u64)`, `Validation(String)`, `Conflict(String)`) that implements `IntoResponse` and renders a consistent JSON body. Handlers return `Result<Json<T>, ApiError>` and use `?`.',
        'This is the equivalent of `Results.Problem(...)` plus an exception handler middleware, except nothing is thrown: every failure is visible in the handler signature.',
      ],
      hints: [
        'In `into_response`, map each variant to a `(StatusCode, Json(json!({ "error": .. })))` tuple and call `.into_response()` on it.',
        'Validate in a function `fn validate(req: &CreateOrder) -> Result<(), ApiError>`: empty lines, zero quantity, missing `@` in the email.',
        'Malformed JSON is rejected by the `Json` extractor before your handler runs, with a 400 or 422 and a plain-text body. Wrap it with `WithRejection` from `axum-extra`, or accept that for now.',
        'Cancel returns `ApiError::Conflict` when the order is already shipped. Check and update under one write lock, so no other request can ship it in between.',
      ],
      checkpoint: '`GET /orders/999` returns 404 with `{"error":"order 999 not found"}`; posting an order with no lines returns 422 with a validation message.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses axum and serde_json.',
        caption: 'src/error.rs',
        code: code`
          use axum::{
              Json,
              http::StatusCode,
              response::{IntoResponse, Response},
          };
          use serde_json::json;

          #[derive(Debug)]
          pub enum ApiError {
              NotFound(u64),
              Validation(String),
              Conflict(String),
          }

          impl IntoResponse for ApiError {
              fn into_response(self) -> Response {
                  let (status, message) = match self {
                      ApiError::NotFound(id) => (StatusCode::NOT_FOUND, format!("order {id} not found")),
                      ApiError::Validation(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg),
                      ApiError::Conflict(msg) => (StatusCode::CONFLICT, msg),
                  };
                  (status, Json(json!({ "error": message }))).into_response()
              }
          }

          // in a handler:
          // async fn get_order(State(state): State<AppState>, Path(id): Path<u64>) -> Result<Json<Order>, ApiError> {
          //     let order = state.store.get(id).ok_or(ApiError::NotFound(id))?;
          //     Ok(Json(order))
          // }
        `,
      },
    },
    {
      id: 'tracing',
      title: 'Structured logging with tracing',
      goal: [
        'Initialise `tracing_subscriber` in `main`, add `TraceLayer::new_for_http()` to the router, and log domain events with fields: `info!(order_id = order.id, lines = order.lines.len(), "order created")`.',
        'This maps to Serilog message templates. The difference is that fields are typed key-value pairs at the call site, and spans (`#[instrument]`) attach context to everything logged inside a handler.',
      ],
      hints: [
        '`tracing_subscriber::fmt().with_target(false).with_max_level(Level::DEBUG).init();` shows the request lines. `TraceLayer` logs at `DEBUG` by default, and the subscriber default is `INFO`, which would hide them.',
        '`Router::layer(TraceLayer::new_for_http())` is middleware, like `app.UseHttpLogging()`. Layers wrap the routes added before them.',
        'Put `#[tracing::instrument(skip(state))]` on a handler to record its arguments as span fields without logging the whole state.',
        'Log errors once, in `ApiError::into_response`, rather than in each handler.',
      ],
      checkpoint: 'Each request prints a line with method, URI, status and latency, and creating an order prints `order created` with `order_id` and `lines` fields.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses axum, tokio, tracing, tracing-subscriber and tower-http.',
        caption: 'src/main.rs (startup)',
        code: code`
          use axum::{Router, routing::get};
          use tower_http::trace::TraceLayer;
          use tracing::{Level, info};

          #[tokio::main]
          async fn main() {
              tracing_subscriber::fmt().with_target(false).with_max_level(Level::DEBUG).init();

              let app = Router::new()
                  .route("/health", get(|| async { "ok" }))
                  .layer(TraceLayer::new_for_http());

              let addr = "127.0.0.1:3000";
              let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
              info!(addr, "listening");
              axum::serve(listener, app).await.unwrap();
          }
        `,
      },
    },
    {
      id: 'integration-tests',
      title: 'Integration tests without a socket',
      goal: [
        'Test the real router in-process. `app(AppState::default())` returns a `Router`, which is a tower `Service`, so `oneshot(request)` runs one request through routing, extractors, handlers and error mapping, like `WebApplicationFactory` without a test host.',
      ],
      hints: [
        'Mark tests `#[tokio::test]`; each gets its own runtime.',
        'Bring `tower::ServiceExt` into scope for `oneshot`, and `http_body_util::BodyExt` for `collect()`.',
        '`oneshot` consumes the router. Clone it (routers are cheap to clone) or build a new one per request when a test needs several.',
        'Deserialise response bodies into `serde_json::Value` to assert on individual fields.',
      ],
      checkpoint: '`cargo test` passes tests for 201 on create, 404 on a missing order with the JSON error body, and 422 on an order with no lines.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses axum, tokio, tower and http-body-util; also depends on the app() function from earlier milestones.',
        caption: 'src/main.rs (test module)',
        code: code`
          #[cfg(test)]
          mod tests {
              use super::*;
              use axum::body::Body;
              use axum::http::{Request, StatusCode};
              use http_body_util::BodyExt;
              use tower::ServiceExt;

              #[tokio::test]
              async fn missing_order_returns_404_with_json_error() {
                  let app = app(AppState::default());

                  let response = app
                      .oneshot(Request::builder().uri("/orders/999").body(Body::empty()).unwrap())
                      .await
                      .unwrap();

                  assert_eq!(response.status(), StatusCode::NOT_FOUND);
                  let bytes = response.into_body().collect().await.unwrap().to_bytes();
                  let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
                  assert_eq!(body["error"], "order 999 not found");
              }

              #[tokio::test]
              async fn create_returns_201() {
                  let app = app(AppState::default());
                  let payload = r#"{"customer":"ada@example.com","lines":[{"sku":"KB-01","quantity":1,"unit_price_cents":8900}]}"#;

                  let response = app
                      .oneshot(
                          Request::post("/orders")
                              .header("content-type", "application/json")
                              .body(Body::from(payload))
                              .unwrap(),
                      )
                      .await
                      .unwrap();

                  assert_eq!(response.status(), StatusCode::CREATED);
              }
          }
        `,
      },
    },
  ],
  stretch: [
    'Swap the in-memory store for PostgreSQL with `sqlx` and compile-time checked queries, keeping the same handler signatures by hiding the store behind a trait.',
    'Add graceful shutdown with `axum::serve(..).with_graceful_shutdown(signal)` so in-flight requests finish on Ctrl+C.',
    'Add request timeouts and a concurrency limit with `tower_http::timeout::TimeoutLayer` and `tower::limit::ConcurrencyLimitLayer`.',
    'Generate an OpenAPI document with `utoipa` and serve Swagger UI.',
  ],
  exercises: ['ownership', 'option-result', 'structs', 'rc-refcell', 'async'],
};

const jobQueue: Project = {
  id: 'proj-job-queue',
  title: 'A background job worker',
  summary: 'A tokio worker pool fed by a bounded channel, with retries, backoff, concurrency limits and graceful shutdown.',
  dotnetEquivalent: 'Worker Service (BackgroundService) + System.Threading.Channels + Polly',
  crates: [
    { name: 'tokio', version: '1', dotnet: 'TPL + System.Threading.Channels', why: 'Runtime, `mpsc` channels, `Semaphore`, `JoinSet`, timers and Ctrl+C handling.' },
    { name: 'tokio-util', version: '0.7', dotnet: 'CancellationTokenSource', why: '`CancellationToken` with `cancelled().await` and child tokens.' },
    { name: 'tracing', version: '0.1', dotnet: 'ILogger<T>', why: 'Structured events with job id and attempt number.' },
    { name: 'tracing-subscriber', version: '0.3', dotnet: 'Console logging provider', why: 'Prints the events.' },
  ],
  spec: [
    'Producers submit jobs (send an email, generate an invoice PDF, call a webhook) into a bounded channel. A dispatcher reads from the channel and runs up to N jobs at once. Transient failures are retried with exponential backoff up to a maximum number of attempts; permanent failures are logged and dropped.',
    'On Ctrl+C the service stops accepting new jobs, lets in-flight jobs finish within a grace period, and exits. In .NET, `BackgroundService.ExecuteAsync` receives a `stoppingToken` from the host. In Rust there is no host: you create the token, listen for the signal, and await every task handle yourself.',
    'A key difference to keep in mind: dropping a Rust future cancels it at its current `.await`. That makes timeouts trivial, and it also means an abandoned task stops mid-job unless you design for it.',
  ],
  milestones: [
    {
      id: 'retry-policy',
      title: 'A retry policy with no async yet',
      goal: [
        'Model job failures as `enum JobError { Transient(String), Permanent(String) }` and write a retry loop generic over the operation. Doing it synchronously first separates the retry logic from the runtime.',
        'This is what a Polly `WaitAndRetry` policy does, but the decision of which errors to retry is a `match` on your own enum instead of `Handle<HttpRequestException>()`.',
      ],
      hints: [
        'Take the operation as `impl FnMut(u32) -> Result<T, JobError>`, passing the attempt number so the operation can log it.',
        'Compute the delay as `base * 2^attempt`, capped: `base.saturating_mul(2u32.saturating_pow(attempt)).min(max)`.',
        'A match guard (`Err(JobError::Transient(_)) if attempt + 1 < max_attempts`) keeps the "should retry" rule in one arm.',
        'Real systems add jitter so many workers do not retry in lockstep; add it later with `rand` or a hash of the job id.',
      ],
      checkpoint: 'The program prints two retry lines with delays of 10ms and 20ms, then `Ok("sent")`, then `Err(permanent: mailbox does not exist)` with no retries.',
      code: {
        language: 'rust',
        expect: 'compiles',
        caption: 'src/retry.rs (as a standalone program)',
        code: code`
          use std::fmt;
          use std::thread;
          use std::time::Duration;

          enum JobError {
              Transient(String),
              Permanent(String),
          }

          impl fmt::Debug for JobError {
              fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                  match self {
                      JobError::Transient(msg) => write!(f, "transient: {msg}"),
                      JobError::Permanent(msg) => write!(f, "permanent: {msg}"),
                  }
              }
          }

          fn backoff(attempt: u32, base: Duration, max: Duration) -> Duration {
              base.saturating_mul(2u32.saturating_pow(attempt)).min(max)
          }

          fn retry<T>(max_attempts: u32, mut op: impl FnMut(u32) -> Result<T, JobError>) -> Result<T, JobError> {
              let mut attempt = 0;
              loop {
                  match op(attempt) {
                      Ok(value) => return Ok(value),
                      Err(JobError::Transient(msg)) if attempt + 1 < max_attempts => {
                          let delay = backoff(attempt, Duration::from_millis(10), Duration::from_millis(200));
                          println!("attempt {} failed ({msg}), retrying in {delay:?}", attempt + 1);
                          thread::sleep(delay);
                          attempt += 1;
                      }
                      Err(e) => return Err(e),
                  }
              }
          }

          fn main() {
              let flaky = retry(5, |attempt| {
                  if attempt < 2 {
                      Err(JobError::Transient("smtp timeout".to_string()))
                  } else {
                      Ok("sent")
                  }
              });
              println!("{flaky:?}");

              let bounced: Result<&str, JobError> =
                  retry(5, |_| Err(JobError::Permanent("mailbox does not exist".to_string())));
              println!("{bounced:?}");
          }
        `,
      },
    },
    {
      id: 'single-worker',
      title: 'One producer, one worker, one channel',
      goal: [
        'Create a bounded `mpsc::channel::<Job>(100)`, spawn a worker task that loops on `rx.recv().await`, and send a handful of jobs from `main`. Port the retry loop to async: `tokio::time::sleep(delay).await` instead of `thread::sleep`.',
        'When `main` drops the last `Sender`, `recv()` returns `None` and the worker loop ends. That replaces `channel.Writer.Complete()`.',
      ],
      hints: [
        '`tokio::spawn` needs a `\'static` future: move the receiver into the task with `async move`.',
        'Keep the `JoinHandle` and `.await` it at the end of `main`; otherwise the runtime shuts down and cancels the worker mid-job.',
        '`thread::sleep` inside a tokio task blocks a runtime worker thread. If you forget to port it, everything else on that thread stalls.',
        '`send(job).await` waits when the channel is full. That is backpressure, like `WriteAsync` on a bounded channel.',
      ],
      checkpoint: 'Running the binary logs each job as started and finished in order, then `worker stopped: channel closed`, and the process exits on its own.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses tokio (rt-multi-thread, macros, sync, time).',
        caption: 'src/main.rs',
        code: code`
          use std::time::Duration;
          use tokio::sync::mpsc;

          #[derive(Debug)]
          enum Job {
              SendEmail { to: String },
              RenderInvoice { invoice_id: u64 },
          }

          async fn run(job: &Job) -> Result<(), String> {
              tokio::time::sleep(Duration::from_millis(50)).await;
              match job {
                  Job::SendEmail { to } if to.ends_with("@bounce.test") => Err(format!("{to} bounced")),
                  _ => Ok(()),
              }
          }

          async fn worker(mut rx: mpsc::Receiver<Job>) {
              while let Some(job) = rx.recv().await {
                  println!("started {job:?}");
                  match run(&job).await {
                      Ok(()) => println!("finished {job:?}"),
                      Err(e) => println!("failed {job:?}: {e}"),
                  }
              }
              println!("worker stopped: channel closed");
          }

          #[tokio::main]
          async fn main() {
              let (tx, rx) = mpsc::channel::<Job>(100);
              let handle = tokio::spawn(worker(rx));

              tx.send(Job::SendEmail { to: "ada@example.com".into() }).await.unwrap();
              tx.send(Job::RenderInvoice { invoice_id: 1042 }).await.unwrap();
              tx.send(Job::SendEmail { to: "nobody@bounce.test".into() }).await.unwrap();

              drop(tx);
              handle.await.unwrap();
          }
        `,
      },
    },
    {
      id: 'concurrency',
      title: 'Run N jobs at once',
      goal: [
        'A tokio `mpsc::Receiver` has a single consumer, unlike a .NET channel reader that many tasks can share. Keep one dispatcher loop that receives jobs and spawns each one into a `JoinSet`, gated by a `Semaphore` with N permits.',
        'The permit is acquired **before** spawning and moved into the task, so the dispatcher stops pulling from the channel when all workers are busy and backpressure reaches the producers.',
      ],
      hints: [
        'Wrap the semaphore in `Arc` and use `acquire_owned().await`; an `OwnedSemaphorePermit` can move into a `\'static` task and releases on drop.',
        '`JoinSet::spawn` keeps handles for you; `join_set.join_next().await` collects results and surfaces panics as `JoinError`.',
        'Clean up finished tasks periodically with `while join_set.try_join_next().is_some() {}` so the set does not grow unbounded.',
        'The alternative, `Arc<Mutex<Receiver>>` shared by N worker loops, works but serialises every `recv` through the mutex.',
      ],
      checkpoint: 'With N = 3 and 10 jobs that each sleep 200ms, the whole batch finishes in roughly 800ms, and the log never shows more than 3 jobs running at once.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses tokio (sync, task, time).',
        caption: 'src/dispatcher.rs',
        code: code`
          use std::sync::Arc;
          use std::time::Duration;
          use tokio::sync::{Semaphore, mpsc};
          use tokio::task::JoinSet;

          pub async fn dispatch(mut rx: mpsc::Receiver<u64>, max_concurrent: usize) {
              let permits = Arc::new(Semaphore::new(max_concurrent));
              let mut running = JoinSet::new();

              while let Some(job_id) = rx.recv().await {
                  let permit = permits.clone().acquire_owned().await.expect("semaphore closed");
                  running.spawn(async move {
                      let _permit = permit; // released when this task ends
                      tokio::time::sleep(Duration::from_millis(200)).await;
                      job_id
                  });
                  while let Some(done) = running.try_join_next() {
                      if let Err(e) = done {
                          eprintln!("job task panicked: {e}");
                      }
                  }
              }

              while let Some(done) = running.join_next().await {
                  if let Ok(job_id) = done {
                      println!("finished job {job_id}");
                  }
              }
          }
        `,
      },
    },
    {
      id: 'async-retry',
      title: 'Retries and timeouts per job',
      goal: [
        'Wrap each job in `tokio::time::timeout` and the async retry loop from the first milestone. A timed-out attempt counts as transient.',
        'Notice what `timeout` does when it fires: it drops the inner future. The job is cancelled at whatever `.await` it was suspended on, with no `OperationCanceledException` and no cooperation from the job.',
      ],
      hints: [
        '`timeout(Duration::from_secs(5), run(&job)).await` returns `Result<Result<T, JobError>, Elapsed>`; flatten it with a `match`.',
        'An async closure in the retry helper is the painful part. Take `impl FnMut(u32) -> Fut` with `Fut: Future<Output = Result<T, JobError>>`, or use `async || { .. }` closures (stable since Rust 1.85) with `AsyncFnMut`.',
        'Cancellation-at-await means a job that writes a file then updates a database can stop between the two. Make jobs idempotent, or do the non-cancellable part inside `tokio::spawn` and await its handle.',
        'Log with fields: `warn!(job_id, attempt, ?error, "job attempt failed")`.',
      ],
      checkpoint: 'A job that always sleeps longer than the timeout is attempted exactly `max_attempts` times with growing delays and then reported as failed; a job that fails once succeeds on its second attempt.',
    },
    {
      id: 'graceful-shutdown',
      title: 'Graceful shutdown with a cancellation token',
      goal: [
        'Create a `CancellationToken` in `main`. A task waits for `tokio::signal::ctrl_c()` and cancels it. The dispatcher `select!`s between the token and `rx.recv()`, stops receiving on cancellation, then waits for running jobs up to a grace period.',
        'This is the work the .NET generic host does for you: `IHostApplicationLifetime`, `stoppingToken` and `HostOptions.ShutdownTimeout`.',
      ],
      hints: [
        'Add `biased;` as the first line inside `select!` so cancellation is checked before another job is received.',
        'After cancellation call `rx.close()`: producers get an error on `send` while buffered jobs can still be drained or deliberately discarded. Decide which, and log it.',
        'Bound the drain with `timeout(grace, async { while running.join_next().await.is_some() {} })`. On timeout, `running.abort_all()` cancels the rest.',
        'Pass `token.child_token()` into jobs that can stop cooperatively, for example between pages of a long export.',
      ],
      checkpoint: 'Pressing Ctrl+C while 3 jobs run prints `shutdown requested`, no new jobs start, the 3 running jobs finish, and the process exits 0 within the grace period.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses tokio (full) and tokio-util.',
        caption: 'src/main.rs',
        code: code`
          use std::time::Duration;
          use tokio::sync::mpsc;
          use tokio::task::JoinSet;
          use tokio_util::sync::CancellationToken;

          async fn dispatcher(mut rx: mpsc::Receiver<u64>, token: CancellationToken) {
              let mut running = JoinSet::new();
              loop {
                  tokio::select! {
                      biased;
                      _ = token.cancelled() => {
                          println!("shutdown requested, {} jobs running", running.len());
                          break;
                      }
                      next = rx.recv() => match next {
                          Some(job_id) => {
                              running.spawn(async move {
                                  tokio::time::sleep(Duration::from_secs(2)).await;
                                  println!("job {job_id} done");
                              });
                          }
                          None => break,
                      },
                  }
              }

              rx.close();
              let grace = Duration::from_secs(10);
              let drained = tokio::time::timeout(grace, async {
                  while running.join_next().await.is_some() {}
              })
              .await;
              if drained.is_err() {
                  println!("grace period elapsed, aborting {} jobs", running.len());
                  running.abort_all();
              }
          }

          #[tokio::main]
          async fn main() {
              let token = CancellationToken::new();
              let (tx, rx) = mpsc::channel(100);

              let signal_token = token.clone();
              tokio::spawn(async move {
                  tokio::signal::ctrl_c().await.expect("install Ctrl+C handler");
                  signal_token.cancel();
              });

              let dispatcher = tokio::spawn(dispatcher(rx, token.clone()));

              for job_id in 1..=20 {
                  if tx.send(job_id).await.is_err() {
                      break; // receiver closed during shutdown
                  }
                  tokio::time::sleep(Duration::from_millis(300)).await;
              }
              drop(tx);
              dispatcher.await.unwrap();
          }
        `,
      },
    },
    {
      id: 'tests',
      title: 'Deterministic tests with paused time',
      goal: [
        'Test backoff and shutdown without real waiting. `#[tokio::test(start_paused = true)]` freezes the clock and auto-advances it whenever all tasks are idle, so a test that "sleeps" for a minute of backoff finishes instantly. This replaces injecting `TimeProvider` / `FakeTimeProvider` in .NET.',
      ],
      hints: [
        'Paused time requires the `test-util` feature of tokio in `[dev-dependencies]`, and only works with the current-thread runtime (the `#[tokio::test]` default).',
        'Record attempt timestamps with `tokio::time::Instant::now()` and assert on the differences: 10ms, 20ms, 40ms.',
        'Test shutdown by cancelling the token right after sending jobs and asserting on what finished, using an `Arc<AtomicUsize>` counter.',
        'Keep job logic behind a trait or a function parameter so tests can inject a job that fails a set number of times.',
      ],
      checkpoint: '`cargo test` runs a backoff test that simulates more than a minute of delays in well under a second, and a shutdown test that proves no job starts after cancellation.',
      code: {
        language: 'rust',
        expect: 'unchecked',
        uncheckedReason: 'Uses tokio with the test-util and macros features.',
        caption: 'tests/backoff.rs',
        code: code`
          use std::time::Duration;
          use tokio::time::Instant;

          async fn retry_with_backoff(max_attempts: u32, mut fail_times: u32) -> (u32, Vec<Duration>) {
              let start = Instant::now();
              let mut gaps = Vec::new();
              let mut attempt = 0;
              loop {
                  attempt += 1;
                  if fail_times == 0 || attempt == max_attempts {
                      return (attempt, gaps);
                  }
                  fail_times -= 1;
                  let delay = Duration::from_secs(10) * 2u32.pow(attempt - 1);
                  tokio::time::sleep(delay).await;
                  gaps.push(start.elapsed());
              }
          }

          #[tokio::test(start_paused = true)]
          async fn backoff_doubles_without_real_waiting() {
              let wall = std::time::Instant::now();

              let (attempts, gaps) = retry_with_backoff(5, 3).await;

              assert_eq!(attempts, 4);
              assert_eq!(gaps, vec![Duration::from_secs(10), Duration::from_secs(30), Duration::from_secs(70)]);
              assert!(wall.elapsed() < Duration::from_secs(1));
          }
        `,
      },
    },
  ],
  stretch: [
    'Persist jobs in SQLite with `sqlx` so a restart resumes pending work, using a `status` column and `UPDATE .. RETURNING` to claim jobs.',
    'Expose `/metrics` with queue depth, in-flight jobs and failures using the `prometheus` or `metrics` crates.',
    'Add a dead-letter channel for permanent failures and a small CLI to replay them.',
    'Replace the hand-written retry loop with `tower::retry` or `backon` and compare the ergonomics.',
  ],
  exercises: ['ownership', 'option-result', 'async'],
};

export const projects: Project[] = [cliTodo, logAnalyzer, minimalApi, jobQueue];
