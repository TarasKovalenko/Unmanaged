import { code } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const cloning: Lesson = {
  id: 'cloning',
  title: 'Clone is not the fix',
  summary: 'Choosing owned or borrowed on purpose, and what an unnecessary `.clone()` is telling you.',
  intro: [
    'By now you have met enough borrow errors to discover the universal workaround: add `.clone()` until it compiles. It works. Sometimes it is even right.',
    'This lesson is about the design decision that the clone papers over: which data owns which, and which parameters should borrow. Get that right and most clones disappear.',
  ],
  csharp: {
    filename: 'CustomerDirectory.cs',
    code: code`
      public sealed class CustomerDirectory
      {
          private readonly Dictionary<string, Customer> _byEmail = new();

          public void Add(Customer customer)
          {
              _byEmail[customer.Email] = customer;
          }

          public Customer? Find(string email) =>
              _byEmail.GetValueOrDefault(email);

          public IEnumerable<string> Emails() => _byEmail.Keys;
      }
    `,
  },
  rust: {
    filename: 'customer_directory.rs',
    code: code`
      use std::collections::HashMap;

      struct Customer {
          email: String,
          name: String,
      }

      #[derive(Default)]
      struct CustomerDirectory {
          by_email: HashMap<String, Customer>,
      }

      impl CustomerDirectory {
          fn add(&mut self, customer: Customer) {
              self.by_email.insert(customer.email.clone(), customer);
          }

          fn find(&self, email: &str) -> Option<&Customer> {
              self.by_email.get(email)
          }

          fn emails(&self) -> impl Iterator<Item = &str> {
              self.by_email.keys().map(String::as_str)
          }
      }

      fn main() {
          let mut directory = CustomerDirectory::default();
          directory.add(Customer { email: String::from("ada@contoso.com"), name: String::from("Ada") });
          if let Some(customer) = directory.find("ada@contoso.com") {
              println!("found {}", customer.name);
          }
          println!("{}", directory.emails().count());
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [9, 10, 11],
      note: 'The directory owns its customers outright. No `readonly`: whether the map can change is decided by `&self` versus `&mut self` on each method.',
    },
    {
      csharp: [5, 7],
      rust: [14, 15],
      note: '`Add` takes ownership, so the caller hands the customer over. The map owns both key and value, so the email is cloned once. This clone is honest: two owners genuinely need two copies of a short string.',
    },
    {
      csharp: [10, 11],
      rust: [18, 19],
      note: '`Find` returns a reference into the map, not a copy. `Customer?` becomes `Option<&Customer>`. The caller can read the customer but cannot modify the directory while holding it.',
    },
    {
      csharp: [10],
      rust: [18, 30],
      note: 'The parameter is `&str`, not `String` or `&String`, so callers can pass a literal, a `String`, or a slice without allocating.',
    },
    {
      csharp: [13],
      rust: [22, 23],
      note: 'A lazy view over the keys, like returning `Keys`. The iterator borrows the directory, so it cannot outlive it and the directory cannot change while it is in use.',
    },
  ],
  breaks: [
    {
      heading: '`.clone()` makes the error go away. That is the problem.',
      body: [
        'Nearly every E0382 and E0502 can be silenced with a clone. It compiles, and for small, genuinely independent data it is correct. A clone added only to satisfy the checker usually means the ownership model is wrong: the function should have borrowed, or the data should live somewhere longer-lived.',
        'The C# habit behind it is that passing an object around is free and everyone sees the same instance. A clone reproduces the cost of that habit without its semantics: mutate the copy and the original never finds out.',
      ],
    },
    {
      heading: 'There is no single string type',
      body: [
        '`String` owns a growable UTF-8 buffer. `&str` is a borrowed view into UTF-8 bytes that live somewhere else: a `String`, a literal in the binary, a slice of a larger buffer. C# `string` is neither; it is an immutable, GC-managed object that behaves like a value.',
        'Take `&str` for read-only parameters and `&[T]` instead of `&Vec<T>`. The narrower type accepts more callers.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          fn is_internal(email: &str) -> bool {
              email.ends_with("@contoso.com")
          }

          fn main() {
              let owned = String::from("ada@contoso.com");
              println!("{}", is_internal(&owned));             // &String coerces to &str
              println!("{}", is_internal("bob@fabrikam.com")); // literal: &'static str
              println!("{}", is_internal(&owned[4..]));        // slice of a String
          }
        `,
      },
    },
    {
      heading: 'Put the clone where the cost decision belongs',
      body: [
        'A rule of thumb that holds up: a function that only reads takes `&T`. A function that stores the value takes `T`, and a caller that still needs its own copy clones at the call site. That way the allocation is visible to the code that knows whether it is necessary.',
        'Hiding a clone inside a function that takes `&T` and stores a copy is the Rust equivalent of a method that quietly `ToList()`s its argument.',
      ],
    },
    {
      heading: '`Rc` makes clone cheap. It does not make Rust a GC language.',
      body: [
        '`Rc<T>` (and `Arc<T>` across threads) turns `clone()` into a reference-count increment. That is the closest thing to C# reference semantics: shared and immutable. Add `RefCell` for shared mutation and you have the object graph you are used to, with runtime borrow checks and leaks if you build cycles.',
        'Reach for it when data really is shared with no clear single owner (graphs, caches, UI trees). Not to make the checker stop talking. That is track 4.',
      ],
    },
  ],
  visualize: ['clone-to-escape', 'borrow-ends-at-last-use'],
  takeaways: [
    'Read-only parameters borrow. Storing parameters own. The caller decides whether to clone.',
    '`&str` and `&[T]` for inputs; `String` and `Vec<T>` for fields.',
    'A clone that exists to silence the checker is a design question left unanswered.',
  ],
};
