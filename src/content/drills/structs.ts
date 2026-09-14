import { code } from '../code.ts';
import type { Drill } from '../types.ts';

export const drills: Drill[] = [
  {
    id: 'st-derive-copy-string',
    track: 'structs',
    title: 'Making a line item a value type',
    csharpReflex: 'A `readonly struct` with a `string` field copies fine in C#, so marking the Rust version `Copy` should give the same value semantics.',
    code: code`
      #[derive(Debug, Clone, Copy)]
      struct LineItem {
          sku: String,
          quantity: u32,
      }

      fn main() {
          let item = LineItem { sku: String::from("SKU-4471"), quantity: 2 };
          let reorder = item;
          println!("{item:?} {reorder:?}");
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0204',
    message: `error[E0204]: the trait \`Copy\` cannot be implemented for this type
 --> src/main.rs:2:8
  |
1 | #[derive(Debug, Clone, Copy)]
  |                        ---- in this derive macro expansion
2 | struct LineItem {
  |        ^^^^^^^^
3 |     sku: String,
  |     ----------- this field does not implement \`Copy\``,
    options: [
      {
        text: '`String` owns a heap buffer and is not `Copy`, so a struct containing it cannot be `Copy` either.',
        correct: true,
        why: '`Copy` means "a bitwise copy is a complete, independent value". Copying a `String`\'s pointer, length and capacity would give two owners of one buffer and a double free. The derive requires every field to be `Copy`, and rustc points at the `sku` field.',
      },
      {
        text: '`Copy` can only be derived on types declared with a value-type keyword, and Rust structs are reference types.',
        why: 'There is no value-type or reference-type keyword in Rust. `Copy` works on any struct whose fields are all `Copy`; replace `sku` with a `u64` id and it compiles.',
      },
      {
        text: '`Copy` must be implemented by hand because deriving it would require `Clone` to be implemented first.',
        why: '`Clone` is already in the derive list, and derive order does not matter. A hand-written `impl Copy for LineItem {}` fails with the same E0204.',
      },
      {
        text: 'The struct is too large to copy implicitly; `Copy` is limited to types of 16 bytes or less.',
        why: 'The .NET guideline to keep structs small is advice, not a rule, and Rust has no size limit either. `[u8; 4096]` is `Copy`. The problem is ownership, not size.',
      },
    ],
    fixes: [
      {
        label: 'Drop `Copy`, keep `Clone`, and clone where you mean it',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The struct owns a String, so it moves by default. Where you really want a second independent item, `.clone()` says so and allocates visibly.',
        code: code`
          #[derive(Debug, Clone)]
          struct LineItem {
              sku: String,
              quantity: u32,
          }

          fn main() {
              let item = LineItem { sku: String::from("SKU-4471"), quantity: 2 };
              let reorder = item.clone();
              println!("{item:?} {reorder:?}");
          }
        `,
      },
      {
        label: 'Replace the `String` with a `&\'static str`',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Shared references are `Copy`, so this compiles. It only works while every SKU is a string literal; the first one parsed from a request or a CSV file will not fit.',
        code: code`
          #[derive(Debug, Clone, Copy)]
          struct LineItem {
              sku: &'static str,
              quantity: u32,
          }

          fn main() {
              let item = LineItem { sku: "SKU-4471", quantity: 2 };
              let reorder = item;
              println!("{item:?} {reorder:?}");
          }
        `,
      },
      {
        label: 'Implement `Copy` by hand',
        verdict: 'wrong',
        expect: 'fails',
        note: 'Writing the impl yourself does not change the rule. rustc reports the same E0204: a type with a non-`Copy` field cannot be `Copy`.',
        code: code`
          #[derive(Debug, Clone)]
          struct LineItem {
              sku: String,
              quantity: u32,
          }

          impl Copy for LineItem {}

          fn main() {
              let item = LineItem { sku: String::from("SKU-4471"), quantity: 2 };
              let reorder = item;
              println!("{item:?} {reorder:?}");
          }
        `,
      },
    ],
  },
  {
    id: 'st-recursive-type',
    track: 'structs',
    title: 'A category tree that contains itself',
    csharpReflex: 'A class with a field of its own type is how every tree and linked list in C# is written.',
    code: code`
      struct Category {
          name: String,
          parent: Option<Category>,
      }

      fn main() {
          let hardware = Category { name: String::from("Hardware"), parent: None };
          let laptops = Category { name: String::from("Laptops"), parent: Some(hardware) };
          println!("{}", laptops.name);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0072',
    message: `error[E0072]: recursive type \`Category\` has infinite size
 --> src/main.rs:1:1
  |
1 | struct Category {
  | ^^^^^^^^^^^^^^^
2 |     name: String,
3 |     parent: Option<Category>,
  |                    -------- recursive without indirection
  |
help: insert some indirection (e.g., a \`Box\`, \`Rc\`, or \`&\`) to break the cycle
  |
3 |     parent: Option<Box<Category>>,
  |                    ++++        +`,
    options: [
      {
        text: '`Category` stores a whole `Category` inline, so its size would be infinite. It needs a pointer such as `Box`.',
        correct: true,
        why: 'A Rust field of type `Category` is the value itself, not a reference to it. `Option` does not help: `Some` still has to hold a full `Category`. `Box<Category>` is one pointer wide, which gives the struct a fixed size.',
      },
      {
        text: '`Option<Category>` needs a lifetime annotation because the parent might be dropped before the child.',
        why: 'Lifetimes only apply to references, and there are none here. The compiler has not got as far as ownership: it cannot compute the size of the type.',
      },
      {
        text: 'Structs cannot refer to their own type; recursive data must be modelled with an enum.',
        why: 'Enums have exactly the same problem (the classic cons-list example is an enum). Both structs and enums can be recursive once there is a `Box`, `Vec` or reference in the way.',
      },
      {
        text: '`None` cannot be used for a struct field; the parent must be initialised with a default `Category`.',
        why: 'That would be the C# instinct to avoid null. `None` is fine in a field. The error is about the declaration of `Category`, before any value is constructed.',
      },
    ],
    fixes: [
      {
        label: 'Box the recursive field',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: '`Option<Box<Category>>` is one pointer wide; `None` is the null pointer. Each child owns its parent chain, which fits a breadcrumb path. For a tree where many children share one parent, see track 4.',
        code: code`
          struct Category {
              name: String,
              parent: Option<Box<Category>>,
          }

          fn main() {
              let hardware = Category { name: String::from("Hardware"), parent: None };
              let laptops = Category { name: String::from("Laptops"), parent: Some(Box::new(hardware)) };
              println!("{} in {}", laptops.name, laptops.parent.as_ref().map_or("root", |p| p.name.as_str()));
          }
        `,
      },
      {
        label: 'Store the parent in a Vec',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'A `Vec` keeps its elements in a heap buffer and is itself a fixed-size pointer, length and capacity, so this also has a fixed size. It compiles, but a Vec that always holds zero or one element hides the intent that `Option<Box<_>>` states directly.',
        code: code`
          struct Category {
              name: String,
              parent: Vec<Category>,
          }

          fn main() {
              let hardware = Category { name: String::from("Hardware"), parent: Vec::new() };
              let laptops = Category { name: String::from("Laptops"), parent: vec![hardware] };
              println!("{} in {}", laptops.name, laptops.parent[0].name);
          }
        `,
      },
      {
        label: 'Make the parent a reference, like a C# class field',
        verdict: 'wrong',
        expect: 'fails',
        note: 'A reference does have a fixed size, but a reference stored in a struct needs a lifetime parameter, so this is E0106. Adding `Category<\'a>` compiles for this `main`, but ties every child to a parent that must outlive it on the stack, which is rarely what a category tree wants.',
        code: code`
          struct Category {
              name: String,
              parent: Option<&Category>,
          }

          fn main() {
              let hardware = Category { name: String::from("Hardware"), parent: None };
              let laptops = Category { name: String::from("Laptops"), parent: Some(&hardware) };
              println!("{}", laptops.name);
          }
        `,
      },
    ],
  },
  {
    id: 'st-hashmap-key-no-hash',
    track: 'structs',
    title: 'A stock key with a nested warehouse',
    csharpReflex: 'Any type can be a `Dictionary` key, and a `record` gets value equality and `GetHashCode` for all its members automatically.',
    code: code`
      use std::collections::HashMap;

      #[derive(Debug, PartialEq, Eq)]
      struct Warehouse {
          code: String,
      }

      #[derive(Debug, PartialEq, Eq, Hash)]
      struct StockKey {
          sku: String,
          warehouse: Warehouse,
      }

      fn main() {
          let mut on_hand = HashMap::new();
          let key = StockKey { sku: String::from("SKU-4471"), warehouse: Warehouse { code: String::from("AMS-1") } };
          on_hand.insert(key, 10);
          println!("{}", on_hand.len());
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0277',
    message: `error[E0277]: the trait bound \`Warehouse: Hash\` is not satisfied
  --> src/main.rs:11:5
   |
 8 | #[derive(Debug, PartialEq, Eq, Hash)]
   |                                ---- in this derive macro expansion
...
11 |     warehouse: Warehouse,
   |     ^^^^^^^^^^^^^^^^^^^^ the trait \`Hash\` is not implemented for \`Warehouse\`
   |
help: consider annotating \`Warehouse\` with \`#[derive(Hash)]\`
   |
 4 + #[derive(Hash)]
 5 | struct Warehouse {
   |`,
    options: [
      {
        text: '`#[derive(Hash)]` on `StockKey` hashes each field, so every field type must implement `Hash`, and `Warehouse` does not.',
        correct: true,
        why: 'A derive generates code that calls `Hash::hash` on each field in turn. `Warehouse` derives `Eq` but not `Hash`, so the generated code for `StockKey` does not compile. rustc points at the field and suggests the missing derive on `Warehouse`.',
      },
      {
        text: '`HashMap` keys must be `Copy`, and `StockKey` contains `String`s.',
        why: 'Keys are moved into the map, not copied. `HashMap<String, _>` is the most common map in Rust. The bound is `Eq + Hash`.',
      },
      {
        text: 'Nested structs cannot be hashed; the key has to be flattened to primitive fields.',
        why: 'Nesting is fine as long as every level implements the trait. Deriving `Hash` on `Warehouse` makes the whole key hashable, the same way a C# `record` combines member hash codes.',
      },
      {
        text: '`HashMap::new()` needs explicit type parameters because the key type cannot be inferred.',
        why: 'Inference works: the `insert` call fixes `K = StockKey`. The only error rustc reports is inside the derive on line 8.',
      },
    ],
    fixes: [
      {
        label: 'Derive `Hash` on the nested type too',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'Every type that participates in a key derives `PartialEq, Eq, Hash`. Derived `Eq` and `Hash` use the same fields, so equal keys always hash equally, the contract C# makes you keep by hand between `Equals` and `GetHashCode`.',
        code: code`
          use std::collections::HashMap;

          #[derive(Debug, PartialEq, Eq, Hash)]
          struct Warehouse {
              code: String,
          }

          #[derive(Debug, PartialEq, Eq, Hash)]
          struct StockKey {
              sku: String,
              warehouse: Warehouse,
          }

          fn main() {
              let mut on_hand = HashMap::new();
              let key = StockKey { sku: String::from("SKU-4471"), warehouse: Warehouse { code: String::from("AMS-1") } };
              on_hand.insert(key, 10);
              println!("{}", on_hand.len());
          }
        `,
      },
      {
        label: 'Key by a tuple of strings',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Tuples of hashable types are hashable, so this compiles. It throws away the `Warehouse` type, and nothing stops a caller from swapping the SKU and the warehouse code.',
        code: code`
          use std::collections::HashMap;

          fn main() {
              let mut on_hand: HashMap<(String, String), i32> = HashMap::new();
              on_hand.insert((String::from("SKU-4471"), String::from("AMS-1")), 10);
              println!("{}", on_hand.len());
          }
        `,
      },
      {
        label: 'Remove `Hash` from `StockKey`',
        verdict: 'wrong',
        expect: 'fails',
        note: 'The derive error goes away, but `HashMap::insert` requires `K: Eq + Hash`, so the same E0277 moves to the `insert` call. The key has to be hashable all the way down.',
        code: code`
          use std::collections::HashMap;

          #[derive(Debug, PartialEq, Eq)]
          struct Warehouse {
              code: String,
          }

          #[derive(Debug, PartialEq, Eq)]
          struct StockKey {
              sku: String,
              warehouse: Warehouse,
          }

          fn main() {
              let mut on_hand = HashMap::new();
              let key = StockKey { sku: String::from("SKU-4471"), warehouse: Warehouse { code: String::from("AMS-1") } };
              on_hand.insert(key, 10);
              println!("{}", on_hand.len());
          }
        `,
      },
    ],
  },
  {
    id: 'st-move-out-of-self',
    track: 'structs',
    title: 'A getter that returns the field',
    csharpReflex: 'A property getter `public string Customer => _customer;` returns the field, and the object still has it.',
    code: code`
      struct Invoice {
          customer: String,
          total_cents: i64,
      }

      impl Invoice {
          fn customer(&self) -> String {
              self.customer
          }
      }

      fn main() {
          let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_500 };
          println!("{} owes {}", invoice.customer(), invoice.total_cents);
      }
    `,
    outcome: 'compile-error',
    errorCode: 'E0507',
    message: `error[E0507]: cannot move out of \`self.customer\` which is behind a shared reference
 --> src/main.rs:8:9
  |
8 |         self.customer
  |         ^^^^^^^^^^^^^ move occurs because \`self.customer\` has type \`String\`, which does not implement the \`Copy\` trait
  |
help: consider cloning the value if the performance cost is acceptable
  |
8 |         self.customer.clone()
  |                      ++++++++`,
    options: [
      {
        text: 'Returning `String` means handing over ownership of the field, and a `&self` method only borrowed the invoice.',
        correct: true,
        why: 'In C# returning the field shares a reference. In Rust `self.customer` as a value expression moves the `String`, which would leave the invoice without a customer. You cannot move out of something you borrowed.',
      },
      {
        text: 'The method needs `&mut self` to access the field.',
        why: 'Reading does not need `&mut`, and `&mut self` still would not let you move the field out, only replace it. rustc gives the same E0507 with `&mut self`.',
      },
      {
        text: '`customer` is a private field, so it cannot be returned from a method.',
        why: 'Privacy is per module and the method is in the same module as the struct. Visibility is not involved in E0507.',
      },
      {
        text: 'A method cannot have the same name as a field.',
        why: 'It can, and getters named after their field are the Rust convention. `invoice.customer` and `invoice.customer()` are unambiguous.',
      },
    ],
    fixes: [
      {
        label: 'Return a borrow: `&str`',
        verdict: 'idiomatic',
        expect: 'compiles',
        note: 'The getter lends the caller a view into the invoice. No allocation, and the caller can `.to_string()` if it needs to keep it.',
        code: code`
          struct Invoice {
              customer: String,
              total_cents: i64,
          }

          impl Invoice {
              fn customer(&self) -> &str {
                  &self.customer
              }
          }

          fn main() {
              let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_500 };
              println!("{} owes {}", invoice.customer(), invoice.total_cents);
          }
        `,
      },
      {
        label: 'Clone in the getter',
        verdict: 'works-but',
        expect: 'compiles',
        note: 'Compiles and behaves like the C# getter from the caller\'s view, but every call allocates, even when the caller only prints it. Let callers decide to clone.',
        code: code`
          struct Invoice {
              customer: String,
              total_cents: i64,
          }

          impl Invoice {
              fn customer(&self) -> String {
                  self.customer.clone()
              }
          }

          fn main() {
              let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_500 };
              println!("{} owes {}", invoice.customer(), invoice.total_cents);
          }
        `,
      },
      {
        label: 'Take `self` by value',
        verdict: 'wrong',
        expect: 'fails',
        note: 'The getter compiles now, but it consumes the invoice. `invoice.total_cents` after the call is E0382: the whole struct was moved into `customer()`.',
        code: code`
          struct Invoice {
              customer: String,
              total_cents: i64,
          }

          impl Invoice {
              fn customer(self) -> String {
                  self.customer
              }
          }

          fn main() {
              let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_500 };
              let name = invoice.customer();
              println!("{} owes {}", name, invoice.total_cents);
          }
        `,
      },
    ],
  },
];
