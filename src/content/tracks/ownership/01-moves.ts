import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const moves: Lesson = {
  id: 'moves',
  title: 'Assignment moves',
  summary: '`var b = a;` copies a reference. `let b = a;` transfers ownership and kills `a`.',
  intro: [
    'In C#, `var b = a;` on a class instance copies a reference. Two names, one object, and the GC keeps it alive until neither name can reach it. You stopped noticing that decades ago.',
    'Rust has no GC, so something has to know when to free memory. The answer is that every value has exactly one owner, and assignment **moves** ownership. The old name is not null and not stale. It is dead, and the compiler will not let you touch it.',
  ],
  csharp: {
    filename: 'CustomerImport.cs',
    code: code`
      public record Customer(string Name, List<string> Tags);

      public static class CustomerImport
      {
          public static void Run()
          {
              var customer = new Customer("Contoso", new List<string> { "enterprise" });
              var auditCopy = customer;

              auditCopy.Tags.Add("imported");

              Console.WriteLine(customer.Tags.Count);   // 2: same object
              Console.WriteLine(auditCopy.Name);
          }
      }
    `,
  },
  rust: {
    filename: 'import.rs',
    code: code`
      struct Customer {
          name: String,
          tags: Vec<String>,
      }

      fn main() {
          let customer = Customer {
              name: String::from("Contoso"),
              tags: vec![String::from("enterprise")],
          };
          let mut audit_copy = customer;

          audit_copy.tags.push(String::from("imported"));

          // println!("{}", customer.tags.len()); // E0382: moved on line 11
          println!("{}", audit_copy.tags.len());
          println!("{}", audit_copy.name);
      }
    `,
  },
  links: [
    {
      csharp: [1],
      rust: lines(1, 4),
      note: 'A record holding a List becomes a struct that owns a String and a Vec. There is no class/struct split deciding reference or value semantics; the struct simply owns its fields.',
    },
    {
      csharp: [7],
      rust: lines(7, 10),
      note: 'Construction. The struct itself lives in main\'s stack frame; the String and Vec inside it each own a heap buffer.',
    },
    {
      csharp: [8],
      rust: [11],
      note: 'Identical syntax, different operation. C# copies a reference and both names stay live. Rust moves ownership: `customer` is unusable from here on.',
    },
    {
      csharp: [10],
      rust: [13],
      note: 'Mutation requires `let mut` on the binding. In C#, anyone holding a reference can mutate; in Rust, mutability belongs to the owner (or an exclusive borrow).',
    },
    {
      csharp: [12],
      rust: [15, 16],
      note: 'The C# line reads through the old name and sees the change. The Rust equivalent does not compile, so you read through the new owner.',
    },
    {
      csharp: [13, 14],
      rust: [17, 18],
      note: 'At the closing brace, audit_copy goes out of scope and its String and Vec are freed immediately. No collection, no finalizer queue.',
    },
  ],
  breaks: [
    {
      heading: 'A move is not a reference copy. The source is gone.',
      body: [
        'C# never invalidates a variable. After `var b = a;` both names are live until they go out of scope, and the GC works out when the object dies.',
        'A Rust move is a shallow copy of the struct\'s bytes (for a `String`: pointer, length, capacity) followed by the compiler marking the source as uninitialised. It is the same state as a C# local that is declared but not yet definitely assigned. The check is static; there is no flag at runtime.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn main() {
              let tags = vec![String::from("enterprise")];
              let copy = tags;
              println!("{} {}", tags.len(), copy.len()); // E0382
          }
        `,
      },
    },
    {
      heading: 'Indexing gives you the element, not a reference to it',
      body: [
        'In C#, `names[0]` hands you a reference. In Rust, `names[0]` is the `String` itself, and moving it out would leave a hole in the Vec. That is E0507, and it is the second error every C# developer hits.',
        'Borrow it (`&names[0]`), clone it, or take it out with an operation that keeps the Vec valid: `names.remove(0)`, `swap_remove`, or consuming the whole Vec with `into_iter()`.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          fn main() {
              let names = vec![String::from("Ada"), String::from("Grace")];
              let first = names[0]; // E0507: cannot move out of index
              println!("{first}");
          }
        `,
      },
    },
    {
      heading: 'Numbers and bools still copy, but not because they are "value types"',
      body: [
        'Types that implement `Copy` are duplicated on assignment, like C# value types. The difference is where the decision lives. C# decides by `class` versus `struct`. Rust decides by whether the type implements `Copy`, and a type can only be `Copy` if it owns no heap memory and has no `Drop`.',
        'So a Rust struct of two `i64` fields can opt into C# struct behaviour with `#[derive(Clone, Copy)]`. A struct with a `String` field cannot, no matter what you call it.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          #[derive(Clone, Copy)]
          struct Point {
              x: i64,
              y: i64,
          }

          fn main() {
              let retries = 3;
              let limit = retries; // i32 is Copy
              let origin = Point { x: 0, y: 0 };
              let start = origin; // Point is Copy because we derived it
              println!("{retries} {limit} {} {}", origin.x, start.y);
          }
        `,
      },
    },
    {
      heading: '`clone()` is a deep copy, and you will see every one',
      body: [
        '`MemberwiseClone` and a record\'s `with` expression are shallow: the new object shares the same `List`. Deriving `Clone` in Rust produces a deep copy: a new String buffer, a new Vec, new Strings inside it.',
        'If what you actually want is C#\'s default behaviour (two names, one mutable object), that is `Rc<RefCell<T>>`. It exists, it works, and it is a separate track because reaching for it first is how Rust code ends up worse than the C# it replaced.',
      ],
    },
  ],
  visualize: ['move-on-assign', 'borrow-on-assign', 'copy-types'],
  takeaways: [
    '`let b = a;` moves, unless the type is `Copy`.',
    'A moved-from variable is compile-time dead, not null.',
    '`clone()` is explicit and deep. Every one is a visible allocation.',
  ],
};
