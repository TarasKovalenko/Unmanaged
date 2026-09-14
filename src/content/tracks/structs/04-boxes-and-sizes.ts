import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const boxesAndSizes: Lesson = {
  id: 'st-boxes-and-sizes',
  title: 'Box, sizes, and where values live',
  summary: 'Every Rust type has a size known at compile time unless you add indirection. `Box` is that indirection, written out.',
  intro: [
    'In C#, a `class` instance lives on the GC heap and every variable of that type is a pointer to it, so a tree of `PriceRule` nodes or a `List<IDiscount>` needs no thought. A `struct` is stored inline, and the runtime decides the rest: boxing, closures and async state machines move values to the heap behind your back.',
    'Rust stores every value inline, in whatever contains it: a stack frame, a `Vec` buffer, another struct. That means the compiler must know every type\'s size, so a type cannot contain itself and a trait object cannot sit in a variable. `Box<T>` is the explicit heap pointer that solves both.',
  ],
  csharp: {
    filename: 'PriceEngine.cs',
    code: code`
      public abstract record PriceRule;
      public sealed record Fixed(long Cents) : PriceRule;
      public sealed record Percent(long Rate, PriceRule Inner) : PriceRule;
      public sealed record Sum(PriceRule Left, PriceRule Right) : PriceRule;

      public interface IDiscount { long Apply(long cents); }
      public sealed class Loyalty : IDiscount { public long Apply(long c) => c * 95 / 100; }
      public sealed class Coupon(long off) : IDiscount { public long Apply(long c) => c - off; }

      public static class PriceEngine
      {
          public static long Evaluate(PriceRule rule) => rule switch
          {
              Fixed f => f.Cents,
              Percent p => Evaluate(p.Inner) * p.Rate / 100,
              Sum s => Evaluate(s.Left) + Evaluate(s.Right),
              _ => throw new System.Diagnostics.UnreachableException(),
          };

          public static long Quote(PriceRule rule, List<IDiscount> discounts) =>
              discounts.Aggregate(Evaluate(rule), (cents, d) => d.Apply(cents));
      }
    `,
  },
  rust: {
    filename: 'price_engine.rs',
    code: code`
      enum PriceRule {
          Fixed(i64),
          Percent { rate: i64, inner: Box<PriceRule> },
          Sum(Box<PriceRule>, Box<PriceRule>),
      }

      trait Discount {
          fn apply(&self, cents: i64) -> i64;
      }

      struct Loyalty;
      impl Discount for Loyalty {
          fn apply(&self, cents: i64) -> i64 { cents * 95 / 100 }
      }

      struct Coupon { off_cents: i64 }
      impl Discount for Coupon {
          fn apply(&self, cents: i64) -> i64 { cents - self.off_cents }
      }

      fn evaluate(rule: &PriceRule) -> i64 {
          match rule {
              PriceRule::Fixed(cents) => *cents,
              PriceRule::Percent { rate, inner } => evaluate(inner) * rate / 100,
              PriceRule::Sum(left, right) => evaluate(left) + evaluate(right),
          }
      }

      fn quote(rule: &PriceRule, discounts: &[Box<dyn Discount>]) -> i64 {
          discounts.iter().fold(evaluate(rule), |cents, d| d.apply(cents))
      }

      fn main() {
          let rule = PriceRule::Sum(
              Box::new(PriceRule::Fixed(10_000)),
              Box::new(PriceRule::Percent { rate: 50, inner: Box::new(PriceRule::Fixed(4_000)) }),
          );
          let discounts: Vec<Box<dyn Discount>> = vec![Box::new(Loyalty), Box::new(Coupon { off_cents: 500 })];
          println!("{}", quote(&rule, &discounts));
      }
    `,
    stdout: '10900\n',
  },
  links: [
    {
      csharp: [1, 2, 3, 4],
      rust: lines(1, 5),
      note: 'A closed record hierarchy becomes one enum. `Box<PriceRule>` is required wherever a variant contains another rule; without it the enum would contain itself and have infinite size (E0072).',
    },
    {
      csharp: [6],
      rust: lines(7, 9),
      note: 'The interface becomes a trait. `&self` in the signature is what lets it be called through a `dyn Discount`.',
    },
    {
      csharp: [7, 8],
      rust: lines(11, 19),
      note: 'Implementations are separate `impl` blocks. `Loyalty` is a zero-sized struct: it occupies no memory, and `Box::new(Loyalty)` does not allocate. The `Box<dyn Discount>` holding it is still a two-word pointer.',
    },
    {
      csharp: [12, 13, 14, 15, 16, 17, 18],
      rust: lines(21, 27),
      note: '`match` is exhaustive, so there is no `_ => throw`. Deref coercion lets `evaluate(inner)` pass a `&Box<PriceRule>` where `&PriceRule` is expected.',
    },
    {
      csharp: [20, 21],
      rust: lines(29, 31),
      note: '`List<IDiscount>` becomes a slice of `Box<dyn Discount>`. The box is not optional: different implementations have different sizes, so the Vec stores fat pointers to them.',
    },
    {
      csharp: [2, 3],
      rust: lines(34, 38),
      note: 'Every `Box::new` is a visible heap allocation. In C# each `new Fixed(...)` allocated too; the heap came from declaring a `record` class rather than from anything at the call site.',
    },
  ],
  breaks: [
    {
      heading: 'A type cannot contain itself without a pointer',
      body: [
        'A C# class field of its own type is already a reference, so `Node Next` is eight bytes. A Rust field of type `Node` means the whole node, inline, which would need infinite space. rustc reports E0072 and suggests `Box`.',
        'The same applies to a C# `struct` that contains itself; the C# compiler rejects that too (CS0523). Rust treats every type the way C# treats structs.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Category {
              name: String,
              parent: Option<Category>,
          }

          fn main() {
              let root = Category { name: String::from("Hardware"), parent: None };
              println!("{}", root.name);
          }
        `,
      },
    },
    {
      heading: 'Stack or heap is not decided by struct or class',
      body: [
        'The C# rule of thumb, "structs on the stack, classes on the heap", was never precise, and in Rust it does not apply at all. A struct is stored wherever its owner puts it: in a local on the stack, inside a `Vec` on the heap, inside a `Box` on the heap, inline inside another struct.',
        'The size of a type is fixed and inspectable. `Box<T>` and `Option<Box<T>>` are both one pointer wide, because `None` uses the null bit pattern that a `Box` can never have.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: '16 8 8 4096\n',
        code: code`
          use std::mem::size_of;

          struct Money {
              cents: i64,
              currency: [u8; 8],
          }

          fn main() {
              println!(
                  "{} {} {} {}",
                  size_of::<Money>(),
                  size_of::<Box<Money>>(),
                  size_of::<Option<Box<Money>>>(),
                  size_of::<[u8; 4096]>(),
              );
          }
        `,
      },
    },
    {
      heading: '`dyn Trait` has no size, so it always sits behind a pointer',
      body: [
        'An interface-typed variable in C# is always a reference. In Rust `dyn Discount` is a type whose size depends on which implementation you have, so it cannot be a local, a field, or a `Vec` element on its own. Use `Box<dyn Discount>`, `&dyn Discount`, or `Arc<dyn Discount>`.',
        'Often you do not need `dyn` at all. A generic `fn quote<D: Discount>(d: &D)` is monomorphised like a C# generic over a struct: no allocation and no virtual call. Reach for `dyn` when the set of types varies at runtime.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          trait Discount {
              fn apply(&self, cents: i64) -> i64;
          }

          struct Loyalty;
          impl Discount for Loyalty {
              fn apply(&self, cents: i64) -> i64 { cents * 95 / 100 }
          }

          fn main() {
              let discounts: Vec<dyn Discount> = Vec::new();
              println!("{}", discounts.len());
          }
        `,
      },
    },
    {
      heading: 'Enums replace closed hierarchies, with the opposite trade-off',
      body: [
        'A C# abstract base with virtual methods makes adding a subclass cheap and adding an operation expensive. An enum with `match` is the reverse: adding a variant breaks every `match` that does not handle it, which is the compiler listing the places you need to change.',
        'Use an enum when you own the set of cases (pricing rules, AST nodes, protocol messages). Use a trait when outside code needs to add implementations.',
      ],
    },
    {
      heading: '`Box` is an owner, not a shared reference',
      body: [
        'A `Box<T>` is a unique owner of a heap value. Assigning it moves it, `.clone()` deep-copies the contents, and dropping it frees the allocation. It is not a GC reference and two boxes never point to the same value. Shared ownership is `Rc` or `Arc`, track 4.',
      ],
    },
  ],
  visualize: [],
  drills: ['st-recursive-type'],
  takeaways: [
    'Every value is stored inline unless you add a pointer; `Box` is the owning one.',
    'Recursive types and trait objects need indirection because they have no fixed size.',
    'Closed sets of cases are enums; open sets are traits.',
  ],
};
