import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const noNull: Lesson = {
  id: 'or-no-null',
  title: 'No null, only Option',
  summary: '`Option<T>` is a real type the compiler enforces, not an annotation it warns about. There is no `!` to silence it.',
  intro: [
    'Nullable reference types were a retrofit. `Customer?` is metadata: the runtime type is still `Customer`, the flow analysis produces warnings (CS8602, CS8618), and `!` tells the compiler to stop asking. Value types got a different mechanism, `Nullable<T>`, with its own `HasValue` and `.Value` that throws `InvalidOperationException`.',
    'Rust has one mechanism for both and it is not optional. A value that may be absent has type `Option<T>`, which is an ordinary enum with two variants. You cannot call a `Customer` method on an `Option<&Customer>` any more than you can call it on a `List<Customer>`.',
  ],
  csharp: {
    filename: 'CustomerService.cs',
    code: code`
      public sealed class CustomerService
      {
          private readonly Dictionary<int, Customer> _customers;

          public CustomerService(Dictionary<int, Customer> customers) => _customers = customers;

          public Customer? FindById(int id) =>
              _customers.TryGetValue(id, out var customer) ? customer : null;

          public string GreetingFor(int id)
          {
              var customer = FindById(id);
              if (customer is null)
                  return "Hello, guest";

              return $"Hello, {customer.Nickname ?? customer.Name}";
          }

          // "It is always there by the time we get here"
          public string LoyaltyTier(int id) => FindById(id)!.Tier;
      }
    `,
  },
  rust: {
    filename: 'customer_service.rs',
    stdout: code`
      Hello, Ada
      Hello, guest
      no tier for 8
    `,
    code: code`
      use std::collections::HashMap;

      struct Customer {
          name: String,
          nickname: Option<String>,
          tier: String,
      }

      struct CustomerService {
          customers: HashMap<u32, Customer>,
      }

      impl CustomerService {
          fn find_by_id(&self, id: u32) -> Option<&Customer> {
              self.customers.get(&id)
          }

          fn greeting_for(&self, id: u32) -> String {
              let Some(customer) = self.find_by_id(id) else {
                  return String::from("Hello, guest");
              };
              let shown = customer.nickname.as_deref().unwrap_or(&customer.name);
              format!("Hello, {shown}")
          }

          fn loyalty_tier(&self, id: u32) -> Option<&str> {
              self.find_by_id(id).map(|c| c.tier.as_str())
          }
      }

      fn main() {
          let ada = Customer { name: String::from("Ada"), nickname: None, tier: String::from("gold") };
          let service = CustomerService { customers: HashMap::from([(7, ada)]) };
          println!("{}", service.greeting_for(7));
          println!("{}", service.greeting_for(8));
          match service.loyalty_tier(8) {
              Some(tier) => println!("tier {tier}"),
              None => println!("no tier for 8"),
          }
      }
    `,
  },
  links: [
    {
      csharp: [7, 8],
      rust: lines(14, 16),
      note: '`Customer?` becomes `Option<&Customer>`. `HashMap::get` already returns an `Option`, so there is no `TryGetValue` and `out var` dance to translate. The `&` means the caller borrows the customer; the map still owns it.',
    },
    {
      csharp: [12, 13, 14],
      rust: lines(19, 21),
      note: '`let else` is the guard clause. Unlike `is null`, it does more than check: it binds `customer` as a plain `&Customer` for the rest of the function, so no flow analysis is needed to know it is present.',
    },
    {
      csharp: [16],
      rust: [22, 23],
      note: '`??` becomes `unwrap_or`. `as_deref` turns `&Option<String>` into `Option<&str>` so both sides are borrowed strings and nothing is cloned.',
    },
    {
      csharp: [19, 20],
      rust: lines(26, 28),
      note: 'There is no `!` that means "trust me". The honest signature returns `Option<&str>` and lets the caller decide. If the caller really knows better, it writes `.unwrap()` or `.expect("...")`, which checks and panics on the spot.',
    },
    {
      csharp: [16],
      rust: [5],
      note: 'Optionality lives in the field type. `nickname: Option<String>` must be given a value, even if that value is `None`: there is no default null for fields, and no CS8618 to suppress.',
    },
    {
      csharp: [13, 14],
      rust: lines(36, 39),
      note: '`match` on an `Option` must cover both arms. Leave out `None` and it is a compile error (E0004), not a warning.',
    },
  ],
  breaks: [
    {
      heading: 'NRT is a warning on the same type. `Option<T>` is a different type.',
      body: [
        'With nullable reference types enabled, `customer.Name` on a `Customer?` compiles with warning CS8602, and the program runs until it throws `NullReferenceException`. Plenty of codebases have `<Nullable>enable</Nullable>` and hundreds of suppressed warnings.',
        'In Rust the equivalent line does not type-check at all. `Option<Customer>` has no field called `name`, so rustc reports E0609 rather than guessing that you meant the value inside.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Customer {
              name: String,
          }

          fn find(id: u32) -> Option<Customer> {
              (id == 7).then(|| Customer { name: String::from("Ada") })
          }

          fn main() {
              let customer = find(7);
              println!("{}", customer.name);
          }
        `,
      },
    },
    {
      heading: '`unwrap` is not `!`. It checks, and it panics where the assumption failed.',
      body: [
        'The null-forgiving `!` generates no code. If you were wrong, the `NullReferenceException` happens later, wherever the null is first dereferenced, possibly three calls away.',
        '`.unwrap()` is a real check at that exact line. On `None` it panics with the file and line of the `unwrap`. Prefer `.expect("why this cannot be absent")`, which puts your reasoning into the panic message. A panic is not an exception you catch further up; lesson 2 covers what it is instead.',
      ],
      code: {
        language: 'rust',
        expect: 'panics',
        code: code`
          use std::collections::HashMap;

          fn main() {
              let tiers = HashMap::from([(7, "gold")]);
              let requested = std::hint::black_box(8);
              let tier = tiers.get(&requested).expect("customer ids come from the same table");
              println!("{tier}");
          }
        `,
      },
    },
    {
      heading: '`Option<&T>` costs nothing. `Nullable<T>` always costs a flag.',
      body: [
        '`Nullable<int>` is a struct with a `bool` beside the value, so it is 8 bytes instead of 4. That is also what `Option<u32>` costs in Rust.',
        'References and `Box` are different: they can never be null, so the compiler uses the null bit pattern to mean `None`. `Option<&Customer>` and `Option<Box<Customer>>` are pointer-sized, exactly like a nullable C# reference. You pay for absence only when the type has no spare bit pattern to encode it in.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          &u64: 8, Option<&u64>: 8
          Box<u64>: 8, Option<Box<u64>>: 8
          u32: 4, Option<u32>: 8
        `,
        code: code`
          use std::mem::size_of;

          fn main() {
              println!("&u64: {}, Option<&u64>: {}", size_of::<&u64>(), size_of::<Option<&u64>>());
              println!("Box<u64>: {}, Option<Box<u64>>: {}", size_of::<Box<u64>>(), size_of::<Option<Box<u64>>>());
              println!("u32: {}, Option<u32>: {}", size_of::<u32>(), size_of::<Option<u32>>());
          }
        `,
      },
    },
    {
      heading: '`Option<Option<T>>` is legal, and it means something',
      body: [
        'In C#, `Dictionary<string, string?>` cannot tell you whether a key is missing or present with a null value without a separate `TryGetValue`. Nullable annotations do not nest: a generic `T?` with `T` = `string?` is still `string?`.',
        'Rust options nest. `HashMap<String, Option<String>>::get` returns `Option<&Option<String>>`: the outer layer is "is the key there", the inner is "does it have a value". That is exactly what a PATCH endpoint needs to distinguish "field omitted" from "field set to null".',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: code`
          nickname: set to "Ace"
          phone: cleared
          email: not in the request
        `,
        code: code`
          use std::collections::HashMap;

          fn main() {
              let patch: HashMap<&str, Option<&str>> = HashMap::from([("nickname", Some("Ace")), ("phone", None)]);
              for field in ["nickname", "phone", "email"] {
                  match patch.get(field) {
                      Some(Some(value)) => println!("{field}: set to {value:?}"),
                      Some(None) => println!("{field}: cleared"),
                      None => println!("{field}: not in the request"),
                  }
              }
          }
        `,
      },
    },
  ],
  visualize: [],
  drills: ['or-unwrap-none', 'or-unwrap-behind-ref'],
  takeaways: [
    'Absence is a type, `Option<T>`, and the compiler will not let you use it as if it were a `T`.',
    '`let else`, `if let` and `match` get the value out and bind it. `unwrap` and `expect` are checked assertions that panic.',
    '`Option` of a reference or `Box` is free. Nesting options is meaningful, not a mistake.',
  ],
};
