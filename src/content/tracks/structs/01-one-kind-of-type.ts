import { code } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const oneKindOfType: Lesson = {
  id: 'st-one-kind-of-type',
  title: 'One kind of type, three ways to use it',
  summary: 'C# decides value or reference semantics at the declaration. Rust decides at every use: move, borrow, or copy.',
  intro: [
    'In C# the first decision about a type is `class`, `struct`, `record` or `record struct`, and it fixes the semantics forever. Assign a `class` and you have two references to one object; assign a `struct` and you have two independent values; pass either to a method and the same rule applies.',
    'Rust has one `struct`. The same `Customer` can be moved (the old name stops working), borrowed with `&` or `&mut` (a reference, checked by the compiler), or cloned (an explicit deep copy). Only types that opt into `Copy` behave like a C# struct on assignment, and only some types are allowed to opt in.',
  ],
  csharp: {
    filename: 'Onboarding.cs',
    code: code`
      public readonly struct Money
      {
          public Money(long cents) => Cents = cents;
          public long Cents { get; }
      }

      public sealed class Customer
      {
          public Customer(string name, Money creditLimit) =>
              (Name, CreditLimit) = (name, creditLimit);
          public string Name { get; set; }
          public Money CreditLimit { get; set; }
      }

      public static class Onboarding
      {
          public static Customer Register(string name)
          {
              var limit = new Money(50_000);
              var reserve = limit;              // copy: Money is a struct
              var customer = new Customer(name, limit);
              var audited = customer;           // copy of the reference
              audited.Name = name.Trim();       // customer.Name changes too
              Console.WriteLine($"{customer.Name} {reserve.Cents}");
              return customer;
          }
      }
    `,
  },
  rust: {
    filename: 'onboarding.rs',
    code: code`
      #[derive(Debug, Clone, Copy, PartialEq, Default)]
      struct Money {
          cents: i64,
      }

      #[derive(Debug, Clone, Default)]
      struct Customer {
          name: String,
          credit_limit: Money,
      }

      impl Customer {
          fn new(name: &str, credit_limit: Money) -> Self {
              Customer { name: name.to_string(), credit_limit }
          }
      }

      fn register(name: &str) -> Customer {
          let limit = Money { cents: 50_000 };
          let reserve = limit; // copy: Money is Copy
          let customer = Customer::new(name, limit);
          let mut audited = customer; // move: \`customer\` is gone
          audited.name = name.trim().to_string();
          println!("{} {}", audited.name, reserve.cents);
          audited
      }

      fn main() {
          let customer = register("  Acme  ");
          let draft = Customer::default();
          println!("{customer:?} {draft:?}");
      }
    `,
  },
  links: [
    {
      csharp: [1, 2, 3, 4, 5],
      rust: [1, 2, 3, 4],
      note: '`readonly struct` becomes a plain struct with `#[derive(Clone, Copy)]`. Copy is not implied by the keyword: it is a trait you ask for, and the compiler checks that every field allows it.',
    },
    {
      csharp: [7, 8, 11, 12, 13],
      rust: [6, 7, 8, 9, 10],
      note: 'The `class` becomes the same `struct` keyword. It derives `Clone` but not `Copy`, because `String` owns a heap buffer and cannot be duplicated by copying bits.',
    },
    {
      csharp: [9, 10],
      rust: [12, 13, 14, 15, 16],
      note: 'No constructors and no `new` keyword. `Customer::new` is an ordinary associated function that returns a struct literal; the name `new` is only a convention.',
    },
    {
      csharp: [19, 20],
      rust: [19, 20, 21],
      note: 'Same as C#: `reserve` is an independent copy, and `limit` is still usable on the next line because `Money` is `Copy`.',
    },
    {
      csharp: [22, 23],
      rust: [22, 23],
      note: 'Here the analogy flips. C# copies the reference, so both names see the rename. Rust moves the value: `audited` is the only owner and `customer` can no longer be used at all.',
    },
    {
      csharp: [3],
      rust: [30],
      note: '`Default` is a derived trait, not the zeroed `default(T)` every C# type gets for free. A type without `Default` has no default value.',
    },
  ],
  breaks: [
    {
      heading: 'The declaration does not decide reference or value. The use site does.',
      body: [
        'There is no Rust spelling of "this type is always passed by reference". `Customer` is moved when you assign it or pass it by value, borrowed when you write `&customer` or `&mut customer`, and copied only if you call `.clone()`. The function signature says which, not the type.',
        'The closest thing to a C# `class` reference is `&Customer` for reading and `&mut Customer` for writing, with the rule from track 1 that you cannot have both at once.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          struct Customer {
              name: String,
          }

          fn print_name(customer: &Customer) {
              println!("{}", customer.name);
          }

          fn rename(customer: &mut Customer, name: &str) {
              customer.name = name.to_string();
          }

          fn archive(customer: Customer) {
              println!("archived {}", customer.name);
          }

          fn main() {
              let mut customer = Customer { name: String::from("Acme") };
              print_name(&customer);
              rename(&mut customer, "Acme Ltd");
              archive(customer);
          }
        `,
      },
    },
    {
      heading: 'A C# struct can hold a string. A Rust `Copy` struct cannot.',
      body: [
        'A C# `struct` with a `string` field copies fine because the field is a GC reference: the copy shares the same immutable string object. Rust has no GC to share with. `String` owns its buffer and frees it on drop, so a bitwise copy would free it twice.',
        '`Copy` is only allowed when every field is `Copy`: integers, floats, `bool`, `char`, shared references, and other `Copy` structs. Anything that owns memory or implements `Drop` is out. Deriving it on a struct with a non-`Copy` field is E0204.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          #[derive(Clone, Copy)]
          struct Sku {
              code: String,
              warehouse_id: u32,
          }

          fn main() {
              let sku = Sku { code: String::from("SKU-4471"), warehouse_id: 3 };
              let other = sku;
              println!("{} {}", sku.warehouse_id, other.code);
          }
        `,
      },
    },
    {
      heading: 'Every field is initialised by you. There is no zeroed default.',
      body: [
        'C# zero-initialises every field before the constructor runs, and `new Money()` on a struct always exists even if you did not write it. A Rust struct literal must name every field, and `Default` is only there if you derive or implement it.',
        'Struct update syntax, `..Default::default()`, fills the rest from another value. It looks like a `record` `with` expression, but it moves the non-`Copy` fields out of the source rather than copying references.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          #[derive(Debug, Default)]
          struct RetryPolicy {
              max_attempts: u32,
              backoff_ms: u64,
              endpoint: String,
          }

          fn main() {
              let policy = RetryPolicy {
                  endpoint: String::from("https://billing.internal"),
                  ..Default::default()
              };
              println!("{policy:?}");
          }
        `,
      },
    },
    {
      heading: '`Clone` is deep and explicit, not `MemberwiseClone`',
      body: [
        '`MemberwiseClone` and a `record` `with` expression are shallow: nested lists are shared between the copies. A derived `Clone` calls `clone` on each field, so a `Vec<String>` inside is duplicated along with every string in it.',
        'That is why clones are visible in Rust code review and why they are never implicit. If you want two handles to the same data, that is `Rc` or `Arc`, covered in track 4.',
      ],
    },
  ],
  visualize: ['st-copy-struct-assign', 'copy-types'],
  drills: ['st-derive-copy-string'],
  takeaways: [
    'A Rust struct is moved, borrowed, or copied depending on how you use it, not how you declared it.',
    '`Copy` is opt-in and only legal when no field owns a resource.',
    'Constructors are associated functions by convention; `Default` is a trait, not a guarantee.',
  ],
};
