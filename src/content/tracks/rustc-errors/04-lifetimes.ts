import { code } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const lifetimeErrors: Lesson = {
  id: 'err-lifetimes',
  title: 'Lifetime errors: E0597, E0106, E0515, E0716',
  summary: 'Does not live long enough, missing lifetime specifier, returning a reference to a local, temporary dropped while borrowed. Each draws a small timeline in the margin.',
  intro: [
    'The closest C# gets is `Span<T>` and `ref` safety: CS8352 "may expose referenced variables outside of their declaration scope", CS8168 for returning a `ref` to a local. Most C# developers see those a handful of times, because almost everything lives on the GC heap and nothing can dangle.',
    'In Rust every reference gets that treatment. The good news is that lifetime errors are the most visual diagnostics rustc produces: the labels mark where a value is created, where it is borrowed, where it dies, and where the borrow is still needed. Read them as a timeline running down the left margin.',
  ],
  csharp: {
    filename: 'TenantResolver.cs',
    code: code`
      public static class TenantResolver
      {
          // "contoso.api.example.com" -> "contoso"
          public static ReadOnlySpan<char> TenantFromHost(ReadOnlySpan<char> host)
          {
              var dot = host.IndexOf('.');
              return dot < 0 ? host : host[..dot];
          }

          public static ReadOnlySpan<char> NormalisedTenant(string host)
          {
              Span<char> buffer = stackalloc char[host.Length];
              host.AsSpan().ToLowerInvariant(buffer);
              return TenantFromHost(buffer);
              // error CS8352: Cannot use variable 'buffer' in this context because
              // it may expose referenced variables outside of their declaration scope
          }
      }
    `,
  },
  rust: {
    filename: 'tenant_resolver.rs',
    stdout: 'Contoso\ncontoso\n',
    code: code`
      fn tenant_from_host(host: &str) -> &str {
          host.split('.').next().unwrap_or(host)
      }

      fn normalised_tenant(host: &str) -> String {
          let lowered = host.to_lowercase();
          tenant_from_host(&lowered).to_string()
      }

      fn main() {
          let host = String::from("Contoso.api.example.com");
          println!("{}", tenant_from_host(&host));
          println!("{}", normalised_tenant(&host));
      }
    `,
  },
  links: [
    {
      csharp: [4],
      rust: [1],
      note: '`ReadOnlySpan<char>` in, `ReadOnlySpan<char>` out, is `&str` in, `&str` out. One input reference, so elision ties the output to it; no annotation needed.',
    },
    {
      csharp: [6, 7],
      rust: [2],
      note: 'A slice of the input, no allocation. Valid exactly as long as the caller\'s string.',
    },
    {
      csharp: [12, 13],
      rust: [6],
      note: 'The lowered copy is local in both. C# uses the stack; Rust uses a heap `String` owned by this function. Either way it dies at the end of the function.',
    },
    {
      csharp: [14, 15, 16],
      rust: [7],
      note: 'Returning `tenant_from_host(&lowered)` as `&str` is E0515, "returns a value referencing data owned by the current function". The fix is the one C# pushes you to as well: return an owned value.',
    },
    {
      csharp: [10],
      rust: [5],
      note: 'The return type says who owns the result. `String` means the caller does.',
    },
  ],
  breaks: [
    {
      heading: 'E0597 is a four-point timeline: declared, borrowed, dropped, used',
      body: [
        'Read the labels top to bottom: "binding `host` declared here" (line 4), "borrowed value does not live long enough" (line 5, the `^^^`), "`host` dropped here while still borrowed" (line 6, the `}`), "borrow later used here" (line 7). The last two are in the wrong order, and that is the whole error.',
        'C# would keep the string alive because `tenant` references it. Rust has two kinds of fix: move the owner out so it lives longer (declare `host` before the block), or make the outer variable own its data (`String` instead of `&str`).',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn main() {
              let tenant: &str;
              {
                  let host = String::from("contoso.api.example.com");
                  tenant = host.split('.').next().unwrap();
              }
              println!("tenant: {tenant}");
          }
        `,
      },
    },
    {
      heading: 'E0106 is a question about intent, and it is asked per field',
      body: [
        'A struct with `&str` fields cannot be written like a C# class with `string` properties. rustc reports one E0106 per reference ("expected named lifetime parameter") and a `help:` that adds `<\'a>` to the struct.',
        'The `help:` is mechanically right, and it is also the moment to decide whether this struct should borrow at all. A request log parsed and printed in one function can borrow. One that goes into a queue, a cache or another thread should own `String`s, and then E0106 was telling you the field type was wrong.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct RequestLog {
              method: &str,
              path: &str,
              status: u16,
          }

          fn main() {
              let line = String::from("GET /orders 200");
              let log = RequestLog { method: &line[..3], path: &line[4..11], status: 200 };
              println!("{} {} {}", log.method, log.path, log.status);
          }
        `,
      },
    },
    {
      heading: 'E0515 spans the whole expression; the label names the local',
      body: [
        'When the returned reference is hidden inside an iterator chain, the `^^^` covers the whole tail expression and the `---` marks the local: "`normalised` is borrowed here", "returns a value referencing data owned by the current function". The `Vec<&str>` holds slices of `normalised`, which is dropped as the function returns.',
        'No lifetime annotation fixes E0515. Either return owned data (`Vec<String>`), or have the caller own the buffer and pass it in, so the slices borrow from something that outlives the call.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn column_names(csv_header: &str) -> Vec<&str> {
              let normalised = csv_header.to_lowercase();
              normalised.split(',').map(|c| c.trim()).collect()
          }

          fn main() {
              println!("{:?}", column_names("Order_Id, Customer, Total"));
          }
        `,
      },
    },
    {
      heading: 'E0716: a value with no name dies at the semicolon',
      body: [
        '`format!(...)` creates a `String` that no variable owns. `.as_str()` borrows it, and the temporary is freed at the end of the statement: the label is a single `-` under the `;`. C# has no equivalent because a temporary string is an ordinary heap object.',
        'Rust does extend a temporary\'s life in one pattern: `let key = &format!(...);` compiles, because the reference is bound directly by `let`. Method calls like `.as_str()`, `.trim()` or `.split()` do not get that extension. When in doubt, give the value a name, which is what the `note:` suggests.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::collections::HashMap;

          fn main() {
              let mut cache: HashMap<String, u32> = HashMap::new();
              cache.insert(String::from("contoso:42"), 7);
              let (tenant, id) = ("contoso", 42);
              let key = format!("{tenant}:{id}").as_str();
              println!("{:?}", cache.get(key));
          }
        `,
      },
    },
    {
      heading: '`\'1` and `\'2` are names rustc invents for elided lifetimes',
      body: [
        '"lifetime may not live long enough" has no error code. The labels introduce names: "let\'s call the lifetime of this reference `\'1`" under `fallback`, and `\'2` under `&self`. Then: "method was supposed to return data with lifetime `\'2` but it is returning data with lifetime `\'1`".',
        'Translate it back: elision tied the result to `&self`, and the body returns `fallback`, which is borrowed from somewhere else. The `help:` gives `fallback` and the result one lifetime `\'a` and leaves `&self` unnamed. Apply it and you get the same error for the other branch, now "returning data with lifetime `\'1`" from `&self.display_name`, with a second `help:` adding `\'a` to `&self`. Both branches return a reference, so the result must be tied to both inputs: `fn label<\'a>(&\'a self, fallback: &\'a str) -> &\'a str`. Suggestions arrive one branch at a time; the relationship is yours to decide once.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Customer {
              display_name: String,
          }

          impl Customer {
              fn label(&self, fallback: &str) -> &str {
                  if self.display_name.is_empty() { fallback } else { &self.display_name }
              }
          }

          fn main() {
              let customer = Customer { display_name: String::new() };
              println!("{}", customer.label("unknown customer"));
          }
        `,
      },
    },
  ],
  visualize: ['reference-outlives-owner', 'borrow-ends-at-last-use', 'clone-to-escape'],
  drills: ['err-e0515', 'err-e0716', 'err-e0106', 'own-e0597', 'err-e0373'],
  takeaways: [
    'Lifetime errors are timelines. Find "dropped here" and "later used here" and put them in the right order.',
    'E0515 and E0716 are never fixed by annotations: something has to own the data for longer.',
    'E0106 asks which input the output borrows from. Sometimes the honest answer is "none, return an owned value".',
  ],
};
