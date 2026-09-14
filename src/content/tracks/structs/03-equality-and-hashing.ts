import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const equalityAndHashing: Lesson = {
  id: 'st-equality-and-hashing',
  title: 'Equality is a trait, not an identity',
  summary: 'No type gets `==` for free, `==` never compares addresses, and a `HashMap` key needs `Eq` and `Hash` derived together.',
  intro: [
    'C# gives every type an equality. Classes compare references unless you override `Equals` and `GetHashCode` (and remember `IEquatable<T>`, and `operator ==`). Structs get an `Equals` that compares fields (through reflection unless the layout can be compared bitwise), but no `==` until you declare one. `record` generates value equality. Picking the wrong one is a runtime bug: a `Dictionary` lookup that misses, or a `Contains` that is always false.',
    'Rust gives no type equality until you ask. `#[derive(PartialEq, Eq, Hash)]` generates field-by-field comparison and hashing, consistent with each other by construction. Without them `==` does not compile, and neither does using the type as a map key.',
  ],
  csharp: {
    filename: 'InventoryIndex.cs',
    code: code`
      public sealed record StockKey(string Sku, string Warehouse);

      public sealed class InventoryIndex
      {
          private readonly Dictionary<StockKey, int> _onHand = new();

          public void Receive(string sku, string warehouse, int quantity)
          {
              var key = new StockKey(sku, warehouse);
              _onHand[key] = _onHand.GetValueOrDefault(key) + quantity;
          }

          public int OnHand(string sku, string warehouse) =>
              _onHand.GetValueOrDefault(new StockKey(sku, warehouse));

          public static bool SameKey(StockKey a, StockKey b) =>
              a == b && !ReferenceEquals(a, b);
      }
    `,
  },
  rust: {
    filename: 'inventory_index.rs',
    code: code`
      use std::collections::HashMap;

      #[derive(Debug, Clone, PartialEq, Eq, Hash)]
      struct StockKey {
          sku: String,
          warehouse: String,
      }

      impl StockKey {
          fn new(sku: &str, warehouse: &str) -> Self {
              StockKey { sku: sku.to_string(), warehouse: warehouse.to_string() }
          }
      }

      #[derive(Default)]
      struct InventoryIndex {
          on_hand: HashMap<StockKey, u32>,
      }

      impl InventoryIndex {
          fn receive(&mut self, sku: &str, warehouse: &str, quantity: u32) {
              *self.on_hand.entry(StockKey::new(sku, warehouse)).or_insert(0) += quantity;
          }

          fn on_hand(&self, sku: &str, warehouse: &str) -> u32 {
              self.on_hand.get(&StockKey::new(sku, warehouse)).copied().unwrap_or(0)
          }
      }

      fn same_key(a: &StockKey, b: &StockKey) -> bool {
          a == b && !std::ptr::eq(a, b)
      }

      fn main() {
          let mut index = InventoryIndex::default();
          index.receive("SKU-4471", "AMS-1", 10);
          index.receive("SKU-4471", "AMS-1", 5);
          println!("{}", index.on_hand("SKU-4471", "AMS-1"));

          let first = StockKey::new("SKU-4471", "AMS-1");
          let second = first.clone();
          println!("{}", same_key(&first, &second));
      }
    `,
    stdout: '15\ntrue\n',
  },
  links: [
    {
      csharp: [1],
      rust: lines(3, 7),
      note: '`record` generates `Equals`, `GetHashCode` and `==`. In Rust you derive exactly the traits you want: `PartialEq` for `==`, `Eq` to promise it is a full equivalence relation (every value equals itself), `Hash` for use as a key.',
    },
    {
      csharp: [5],
      rust: [17],
      note: '`HashMap<K, V>` requires `K: Eq + Hash`. Remove either derive and every `insert`, `get` and `entry` call stops compiling.',
    },
    {
      csharp: [9, 10],
      rust: [22],
      note: 'The entry API does the lookup once and hands back `&mut u32`. The key is moved into the map, so the map owns it and nobody can mutate it afterwards.',
    },
    {
      csharp: [13, 14],
      rust: lines(25, 27),
      note: '`get` takes `&StockKey`. `GetValueOrDefault` becomes `.copied().unwrap_or(0)`: missing is an `Option`, not a zeroed value.',
    },
    {
      csharp: [16, 17],
      rust: lines(30, 32),
      note: '`==` on two references compares the values they point to. `std::ptr::eq` is `ReferenceEquals`, and you almost never need it.',
    },
  ],
  breaks: [
    {
      heading: 'No equality by default, not even reference equality',
      body: [
        'A C# class without overrides still supports `==`: it compares references, which is rarely what a DTO author intended and never a compile error. A Rust struct without `PartialEq` has no `==` at all.',
        'That removes a whole category of bug: you cannot accidentally compare identities when you meant values, because identity comparison is not what `==` means anywhere.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Address {
              line1: String,
              postcode: String,
          }

          fn main() {
              let billing = Address { line1: String::from("1 Main St"), postcode: String::from("1011") };
              let shipping = Address { line1: String::from("1 Main St"), postcode: String::from("1011") };
              println!("{}", billing == shipping);
          }
        `,
      },
    },
    {
      heading: '`==` on references compares values, never addresses',
      body: [
        'In C#, `==` on two `object` variables is reference equality even when the runtime type overrides `Equals`, because operators are resolved statically. Rust has no such split: `&a == &b` calls `PartialEq` on the pointees.',
        'If you need identity, ask for it explicitly with `std::ptr::eq`. It is mostly useful for `Rc` graphs and caches, covered in track 4.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: 'true false\n',
        code: code`
          fn main() {
              let primary = String::from("eu-west-1");
              let replica = String::from("eu-west-1");
              let a = &primary;
              let b = &replica;
              println!("{} {}", a == b, std::ptr::eq(a, b));
          }
        `,
      },
    },
    {
      heading: 'Floats are `PartialEq` but not `Eq`',
      body: [
        '`double.NaN.Equals(double.NaN)` is `true` in C# while `NaN == NaN` is `false`, so C# quietly picked a different rule for `Equals` than for `==` to keep dictionaries working. Rust refuses to pick: `f64` implements only `PartialEq`, because `NaN != NaN` breaks reflexivity.',
        'So a struct with an `f64` field cannot derive `Eq` or `Hash`, and cannot be a `HashMap` key. Store money as integer cents, or wrap coordinates in a type that defines what equality means.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          #[derive(PartialEq, Eq, Hash)]
          struct GeoPoint {
              lat: f64,
              lon: f64,
          }

          fn main() {
              let depot = GeoPoint { lat: 52.37, lon: 4.89 };
              println!("{}", depot == depot);
          }
        `,
      },
    },
    {
      heading: 'A HashMap has no `IEqualityComparer`. The key type is the comparer.',
      body: [
        '`new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)` changes equality per dictionary. `HashMap` has a pluggable hasher but no pluggable equality: it always uses the key\'s `Eq` and `Hash`.',
        'For case-insensitive or otherwise custom keys, write a newtype and implement `PartialEq`, `Eq` and `Hash` by hand, making sure values that compare equal hash equally. Or normalise the key before inserting.',
      ],
    },
    {
      heading: 'You cannot corrupt a map by mutating a key',
      body: [
        'Put a mutable class in a `HashSet<T>`, change a field that participates in `GetHashCode`, and the set can no longer find it. Nothing warns you.',
        'A Rust map owns its keys and never hands out `&mut K`. To change a key you remove the entry and insert a new one, so the hash is always recomputed. The one way around it is interior mutability (`Cell`, `RefCell`) inside a key, which the `HashMap` docs call a logic error.',
      ],
    },
  ],
  visualize: [],
  drills: ['st-hashmap-key-no-hash'],
  takeaways: [
    'Derive `PartialEq, Eq, Hash` together for anything used as a key.',
    '`==` is always value equality; identity is `std::ptr::eq` and rarely needed.',
    'Types with float fields are not `Eq`, so they are not map keys.',
  ],
};
