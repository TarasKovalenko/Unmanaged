import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const drop: Lesson = {
  id: 'drop',
  title: 'Drop, not Dispose',
  summary: 'Cleanup runs when the owner goes out of scope. Always. There is no `using` because there is no way to forget.',
  intro: [
    '`IDisposable` exists because the GC frees memory eventually but file handles, sockets and locks need to be released now. `using` is the compiler helping you remember. CA2000 exists because people forget anyway.',
    'Ownership gives Rust the thing C# had to bolt on: a precise moment when each value dies. `Drop` runs at that moment for every value, including plain memory, so there is nothing to opt into.',
  ],
  csharp: {
    filename: 'ReportExporter.cs',
    code: code`
      public sealed class ReportExporter
      {
          public void Export(Report report, string path)
          {
              using var file = File.Create(path);
              using var writer = new StreamWriter(file);

              writer.WriteLine(report.Title);
              foreach (var row in report.Rows)
                  writer.WriteLine(row);
          }   // writer disposed, then file
      }
    `,
  },
  rust: {
    filename: 'report_exporter.rs',
    code: code`
      use std::fs::File;
      use std::io::{self, BufWriter, Write};

      struct Report {
          title: String,
          rows: Vec<String>,
      }

      fn export(report: &Report, path: &str) -> io::Result<()> {
          let file = File::create(path)?;
          let mut writer = BufWriter::new(file);

          writeln!(writer, "{}", report.title)?;
          for row in &report.rows {
              writeln!(writer, "{row}")?;
          }
          writer.flush()?;
          Ok(())
      } // writer dropped here; it owns file, so the file is closed too

      fn main() -> io::Result<()> {
          let report = Report { title: String::from("Q3"), rows: vec![String::from("orders,42")] };
          export(&report, "report.csv")
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [9],
      note: 'The exporter only reads the report, so it borrows `&Report`. `io::Result<()>` replaces thrown `IOException`s; that is track 2.',
    },
    {
      csharp: [5],
      rust: [10],
      note: 'No `using`. `file` owns an OS handle, and whoever owns it last closes it.',
    },
    {
      csharp: [6],
      rust: [11],
      note: '`BufWriter::new(file)` takes ownership of the file. C# has two disposables with separate lifetimes (and a `leaveOpen` flag to argue about). Rust has one chain: writer owns file.',
    },
    {
      csharp: [8],
      rust: [13],
      note: '`writeln!` returns a Result instead of throwing. `?` propagates it.',
    },
    {
      csharp: [9, 10],
      rust: lines(14, 16),
      note: '`&report.rows` borrows the Vec for the loop; each `row` is a `&String`.',
    },
    {
      csharp: [11],
      rust: [17, 19],
      note: 'Scope end. C# disposes in reverse declaration order; Rust drops in reverse order too, but `file` was moved into `writer`, so there is one drop and it closes the file. The explicit `flush()` exists because drop cannot report errors.',
    },
  ],
  breaks: [
    {
      heading: 'Drop always runs. It is not opt-in.',
      body: [
        'Forget `using` in C# and `Dispose` never runs; the handle leaks until a finalizer gets to it, if the type has one. In Rust there is nothing to forget. When the owner goes out of scope, `drop` runs deterministically, including when a panic unwinds through the function.',
        'The one escape hatch is deliberate: `std::mem::forget` and reference-count cycles can leak. Leaking is considered memory-safe, just wasteful.',
      ],
    },
    {
      heading: 'There is no `using` because every scope already is one',
      body: [
        'Every `{ }` block disposes everything it still owns. To release something early, end its scope or call `drop(value)`. `drop` is not special: it is an ordinary function that takes ownership and does nothing, so the value dies at the end of `drop`\'s body.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          use std::sync::Mutex;

          fn main() {
              let counter = Mutex::new(0);
              let mut guard = counter.lock().unwrap();
              *guard += 1;
              drop(guard); // lock released here, not at the end of main
              println!("{}", counter.lock().unwrap());
          }
        `,
      },
    },
    {
      heading: 'Moving a value moves the job of cleaning it up',
      body: [
        'In C#, handing a disposable to another object starts the ownership debate: who disposes it? `StreamWriter` has a `leaveOpen` parameter because the language cannot express the answer.',
        'In Rust the answer is structural. Whoever owns the value when its scope ends drops it. Move it into a struct and the struct drops it; the original scope does nothing at its closing brace.',
      ],
    },
    {
      heading: 'No ObjectDisposedException, because there is no disposed object',
      body: [
        'After `Dispose`, a C# object still exists and every method must guard against being called on it. A dropped Rust value cannot be referenced at all: the borrow checker already proved nothing still points at it. "Disposed" is not a state your types have to model.',
      ],
    },
    {
      heading: 'Drop cannot fail and cannot await',
      body: [
        '`fn drop(&mut self)` returns nothing. If releasing a resource can fail (flushing a buffer, committing a transaction), expose an explicit method and treat drop as a best-effort fallback. That is why `BufWriter` has `flush` and why the example calls it.',
        'There is no stable `IAsyncDisposable`. Async cleanup is an explicit `.close().await` or `.shutdown().await` before the value goes out of scope.',
      ],
    },
  ],
  visualize: ['drop-order'],
  takeaways: [
    'Cleanup happens at scope end for whatever the scope still owns.',
    'Transferring ownership transfers cleanup. No `leaveOpen`.',
    'Drop is infallible and synchronous; anything that can fail gets an explicit method.',
  ],
};
