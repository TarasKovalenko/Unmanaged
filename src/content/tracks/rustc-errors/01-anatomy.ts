import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const anatomy: Lesson = {
  id: 'err-anatomy',
  title: 'How to read a diagnostic',
  summary: 'An error code, one primary span, several secondary spans in story order, then notes and help. Read it as a short story, not a one-liner.',
  intro: [
    'C# compiler errors are one line: `CS0165: Use of unassigned local variable \'rows\'`, a file, a line, a column. The interesting failures show up later as a stack trace, and you read those bottom-up to find your own frame.',
    'rustc errors are closer to a code review comment. They quote your source, underline several places, label each one, and explain how those places relate. Most of the "fighting the borrow checker" experience is reading the first line and skipping the rest. This lesson is about the rest.',
  ],
  csharp: {
    filename: 'ReportPublisher.cs',
    code: code`
      public sealed class ReportPublisher(ILogger<ReportPublisher> logger)
      {
          private readonly Queue<Report> _outbox = new();

          public void Publish(Report report)
          {
              _outbox.Enqueue(report);
              logger.LogInformation("Queued {Title}", report.Title);
          }

          public int PendingRows()
          {
              int rows;
              foreach (var r in _outbox) rows += r.Rows.Count;
              // error CS0165: Use of unassigned local variable 'rows'
              return rows;
          }
      }
    `,
  },
  rust: {
    filename: 'report_publisher.rs',
    stdout: 'queued Q3 revenue\n1 pending rows\n',
    code: code`
      struct Report {
          title: String,
          rows: Vec<String>,
      }

      struct ReportPublisher {
          outbox: Vec<Report>,
      }

      impl ReportPublisher {
          fn publish(&mut self, report: Report) {
              println!("queued {}", report.title);
              self.outbox.push(report);
          }

          fn pending_rows(&self) -> usize {
              self.outbox.iter().map(|r| r.rows.len()).sum()
          }
      }

      fn main() {
          let mut publisher = ReportPublisher { outbox: Vec::new() };
          publisher.publish(Report { title: String::from("Q3 revenue"), rows: vec![String::from("EU,42")] });
          println!("{} pending rows", publisher.pending_rows());
      }
    `,
  },
  links: [
    {
      csharp: [7, 8],
      rust: [12, 13],
      note: 'The order is swapped. Written in the C# order (push, then log the title), rustc reports E0382 with three labelled spans; the first break point below reads that error line by line.',
    },
    {
      csharp: [5],
      rust: [11],
      note: '`report: Report` takes ownership, the Rust spelling of "the outbox keeps this". rustc points at this parameter in a `note:` when a caller uses the report afterwards.',
    },
    {
      csharp: [13, 14, 15, 16],
      rust: lines(16, 18),
      note: 'CS0165 is a one-line error with no context. The Rust version sidesteps the unassigned local entirely with `sum()`, but the same bug in Rust is E0381, and it labels the declaration, the use, and the reason on the loop itself: "if the `for` loop runs 0 times, `rows` is not initialized".',
    },
    {
      csharp: [3],
      rust: [7],
      note: 'The outbox owns the reports in both languages. In Rust that ownership is exclusive, which is what makes the diagnostic in break 1 possible.',
    },
    {
      csharp: [1],
      rust: lines(21, 25),
      note: 'No DI container here; `main` builds the publisher. Logging is `println!` to keep the program std-only.',
    },
  ],
  breaks: [
    {
      heading: 'One `^^^` is where it failed. The `---` spans are why.',
      body: [
        'Compile this and rustc prints `error[E0382]: borrow of moved value: report` (rustc puts `report` in backticks), then three labels. Line 12 (`-----`): "move occurs because `report` has type `Report`, which does not implement the `Copy` trait". Line 13 (`-----`): "value moved here". Line 14 (`^^^^^`): "value borrowed here after move".',
        'The **primary span** (`^`) is the line the compiler refused. The **secondary spans** (`-`) are the earlier events that made it illegal, printed in source order, which for ownership errors is story order: declared, moved, used. C# habit says look at the reported line and fix it there. The fix is usually at one of the `-` lines: here, move the log above the `enqueue` call.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Report {
              title: String,
              rows: Vec<String>,
          }

          fn enqueue(outbox: &mut Vec<Report>, report: Report) {
              outbox.push(report);
          }

          fn main() {
              let mut outbox = Vec::new();
              let report = Report { title: String::from("Q3 revenue"), rows: vec![] };
              enqueue(&mut outbox, report);
              println!("queued {}", report.title);
          }
        `,
      },
    },
    {
      heading: '`note:` explains, `help:` proposes an edit',
      body: [
        'Below the main snippet come sections that each have their own spans. A `note:` gives context, often pointing somewhere else: for the program below it says "`into_iter` takes ownership of the receiver `self`, which moves `orders`", and quotes the standard library line where that is declared. A `help:` is a concrete edit, rendered as a diff with `+` markers: "consider iterating over a slice of the `Vec<Order>`\'s content to avoid moving into the `for` loop", with a `+` under the `&` in `&orders`.',
        'The label on the `for` line is worth reading too: "`orders` moved due to this implicit call to `.into_iter()`". C# `foreach` never consumes the list. Rust\'s `for` does, unless you iterate a reference.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Order {
              id: u32,
              total_cents: i64,
          }

          fn main() {
              let orders = vec![Order { id: 1, total_cents: 500 }, Order { id: 2, total_cents: 700 }];
              let mut revenue = 0;
              for order in orders {
                  revenue += order.total_cents;
              }
              println!("{} orders, {revenue} cents", orders.len());
          }
        `,
      },
    },
    {
      heading: 'Fix the first error. Later ones are often the same mistake reported again.',
      body: [
        'This program forgets `?` (or a `match`) on a `Result`. rustc reports two E0609 errors: no field `host` on type `Result<Settings, std::io::Error>`, then the same for `port`. Two errors, one cause. Larger programs produce ten errors from one wrong type, and the one at the top of the output is almost always the root.',
        'Scroll to the first `error[`, fix it, and recompile before reading the rest. `cargo check` is fast enough that this loop beats reading a wall of cascading diagnostics. In an IDE, sort by position in the file, not by severity.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::fs;
          use std::io;

          struct Settings {
              host: String,
              port: u16,
          }

          fn load_settings(path: &str) -> io::Result<Settings> {
              let text = fs::read_to_string(path)?;
              let (host, port) = text.trim().split_once(':').unwrap_or(("localhost", "8080"));
              Ok(Settings { host: host.to_string(), port: port.parse().unwrap_or(8080) })
          }

          fn main() {
              let settings = load_settings("appsettings.txt");
              println!("listening on {}:{}", settings.host, settings.port);
          }
        `,
      },
    },
    {
      heading: '`help:` fixes the error in front of it, not your design',
      body: [
        'Suggestions are generated locally: they make this error go away, and they know nothing about intent. For the settings program above, `help:` suggests `settings.unwrap().host` and, separately, `settings.unwrap().port`. Apply both and you get E0382, because the first `unwrap()` consumes `settings`. The real fix is one `?` or one `match` on line 16.',
        'Be most suspicious of `.clone()`. For the first break point rustc adds "if `Report` implemented `Clone`, you could clone the value". That would compile, and would queue one report while logging a copy of it. Treat a clone suggestion as "ownership is wrong somewhere"; ask which of the `---` lines should change before accepting it. When `help:` suggests `&`, `move` or a `let` binding it is usually right.',
      ],
    },
    {
      heading: 'Every code has a long-form explanation, offline',
      body: [
        '`rustc --explain E0382` prints a page with a minimal failing example, the fixed version, and the reasoning. It is the same text as the online error index. There is no C# equivalent that ships with the compiler; CS codes send you to a search engine.',
        'Errors without a code, like "lifetime may not live long enough", come from the borrow checker\'s region analysis and have no page. Their labels (`\'1`, `\'2`) are covered in the lifetimes lesson of this track.',
      ],
      code: {
        language: 'shell',
        code: code`
          rustc --explain E0382
          cargo check --message-format short   # one line per error, C# style, when triaging many
        `,
      },
    },
  ],
  visualize: ['move-into-function', 'move-on-assign'],
  drills: ['move-in-loop', 'err-e0308'],
  takeaways: [
    'The `^^^` is where rustc stopped. The `---` lines, read top to bottom, are the story, and the fix is often on one of them.',
    'Fix the first error and recompile. Many later errors are echoes.',
    'Accept `help:` for `&`, `move` and `let`; question it when it says `.clone()` or `.unwrap()`.',
  ],
};
