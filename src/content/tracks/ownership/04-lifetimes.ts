import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const lifetimes: Lesson = {
  id: 'lifetimes',
  title: 'References can\'t outlive their owner',
  summary: 'The GC kept everything reachable alive. Now a reference is only valid while its owner is.',
  intro: [
    'A C# reference cannot dangle. If you can reach an object, it is alive; that is the entire contract of a tracing GC. You never ask how long a string will exist, because the answer is "as long as you need it".',
    'A Rust reference borrows memory that some owner will free at a known point. If the reference could be used after that point, the program does not compile. A lifetime is just that point, given a name. You will rarely write one, but you will read about them in every E0597.',
  ],
  csharp: {
    filename: 'Program.cs',
    code: code`
      var parser = new RequestParser();
      string route;
      {
          var raw = ReadRequestLine();
          route = parser.ParseRoute(raw);
      }
      Console.WriteLine(route);

      static string ReadRequestLine() => "GET /orders/42 HTTP/1.1";

      public sealed class RequestParser
      {
          public string ParseRoute(string rawRequest)
          {
              var parts = rawRequest.Split(' ');
              return parts[1];
          }
      }
    `,
  },
  rust: {
    filename: 'request_parser.rs',
    code: code`
      fn parse_route(raw_request: &str) -> Option<&str> {
          raw_request.split(' ').nth(1)
      }

      fn read_request_line() -> String {
          String::from("GET /orders/42 HTTP/1.1")
      }

      fn main() {
          let route: String;
          {
              let raw = read_request_line();
              route = parse_route(&raw).unwrap_or("/").to_owned();
          }
          println!("{route}");
      }
    `,
  },
  links: [
    {
      csharp: [13],
      rust: [1],
      note: 'The return type borrows from the parameter. The lifetime is elided; written out it reads `fn parse_route<\'a>(raw_request: &\'a str) -> Option<&\'a str>`: "the result lives no longer than the input".',
    },
    {
      csharp: [15, 16],
      rust: [2],
      note: '`Split` allocates an array and new strings. Rust\'s `split` returns slices into the original buffer and allocates nothing, which is exactly why the result is tied to the input.',
    },
    {
      csharp: [2],
      rust: [10],
      note: 'Deferred initialisation works the same way in both languages: the compiler checks definite assignment before the read on the last line.',
    },
    {
      csharp: [4],
      rust: [...lines(5, 7), 12],
      note: '`raw` owns a String. It is freed at the closing brace on line 14, no matter who is still looking at it.',
    },
    {
      csharp: [5],
      rust: [13],
      note: '`.to_owned()` copies the slice into a new String before `raw` dies. Remove it and `route` would be a `&str` into freed memory: E0597.',
    },
    {
      csharp: [7],
      rust: [15],
      note: 'Safe because `route` owns its own data.',
    },
  ],
  breaks: [
    {
      heading: 'Nothing keeps memory alive for you any more',
      body: [
        'In C#, returning `parts[1]` is safe forever. In Rust, returning a `&str` from a function is only possible when it borrows from something the caller gave you, or from a `\'static` value like a string literal. You cannot return a reference to a local, because the local is freed when the function returns.',
        'When the checker complains, the question is always the same: which value should live longer, and who should own it?',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn default_route() -> &str {
              let route = String::from("/");
              &route // there is nothing for this to borrow from
          }

          fn main() {
              println!("{}", default_route());
          }
        `,
      },
    },
    {
      heading: '`ReadOnlySpan<T>` is the closest thing you already know',
      body: [
        'A `ReadOnlySpan<char>` is a pointer and a length into memory owned by someone else, which is precisely a `&str`. C# already refuses to let a span escape to the heap or outlive a `stackalloc` buffer (CS8352, CS8345), because it cannot prove the memory outlives the span.',
        'Rust applies that discipline to every reference, and gives you syntax (`\'a`) to describe how long things live instead of banning the patterns outright.',
      ],
    },
    {
      heading: 'A struct holding a reference is tied to its source',
      body: [
        'A C# class can hold a reference to anything. A Rust struct with a `&str` field needs a lifetime parameter, `struct Token<\'a> { text: &\'a str }`, and every `Token` is then chained to the buffer it was parsed from.',
        'For long-lived application objects (services, entities, anything you would register in a DI container), own the data: `String`, `Vec<T>`. Borrowing structs are for short-lived views: tokenizers, iterators, zero-copy deserialisation.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          struct Token<'a> {
              text: &'a str,
          }

          fn tokenize(input: &str) -> Vec<Token<'_>> {
              input.split_whitespace().map(|text| Token { text }).collect()
          }

          fn main() {
              let line = String::from("GET /orders/42 HTTP/1.1");
              let tokens = tokenize(&line);
              println!("{} tokens, method {}", tokens.len(), tokens[0].text);
          }
        `,
      },
    },
    {
      heading: '`\'static` does not mean "allocated forever"',
      body: [
        '`&\'static str` is a reference valid for the whole program, like a literal compiled into the binary. As a bound, `T: \'static` means "contains no borrowed references", and an owned `String` satisfies it.',
        'You meet it in `thread::spawn` and async runtimes. The fix is almost always to move owned data into the task, not to leak memory to manufacture a `\'static` reference.',
      ],
    },
    {
      heading: 'A borrow ends at its last use, not at the closing brace',
      body: [
        'The checker tracks where a reference is last used ("non-lexical lifetimes"). A reference that is still in scope but never used again is not holding anything. Reordering two lines is often the entire fix; compare the last two visualizers below.',
      ],
    },
  ],
  visualize: ['reference-outlives-owner', 'return-owned-value', 'assign-while-borrowed', 'reference-into-growing-vec', 'borrow-ends-at-last-use'],
  takeaways: [
    'A reference must end before its owner is dropped or changed.',
    'Long-lived things own their data. Borrowing is for the duration of a task.',
    'Lifetime annotations describe relationships that already exist; they never extend anything.',
  ],
};
