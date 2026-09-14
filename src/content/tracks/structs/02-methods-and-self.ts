import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const methodsAndSelf: Lesson = {
  id: 'st-methods-and-self',
  title: 'Methods and the three kinds of self',
  summary: '`&self`, `&mut self` and `self` put read, write and consume in every method signature. Privacy stops at the module, not the type.',
  intro: [
    'Every C# instance method gets the same `this`: a reference that can read and write any field, on an object that stays usable after the call. `readonly` members and `readonly struct` narrow that a little, and `Dispose` is a convention for "do not use this afterwards".',
    'A Rust method declares what it does to its receiver. `&self` reads, `&mut self` writes, `self` takes ownership and the caller loses the value. The compiler holds callers to that contract, which is how a builder or a checkout can make "used after it was finished" a compile error.',
  ],
  csharp: {
    filename: 'ShoppingCart.cs',
    code: code`
      public sealed record CartLine(string Sku, decimal Price, int Quantity);
      public sealed record Order(string CustomerId, IReadOnlyList<CartLine> Lines);

      public sealed class ShoppingCart
      {
          private readonly List<CartLine> _lines = new();

          public ShoppingCart(string customerId) => CustomerId = customerId;

          public string CustomerId { get; }

          public decimal Total => _lines.Sum(l => l.Price * l.Quantity);

          public void Add(string sku, decimal price, int quantity) =>
              _lines.Add(new CartLine(sku, price, quantity));

          public Order Checkout()
          {
              var order = new Order(CustomerId, _lines.ToList());
              _lines.Clear();
              return order;
          }
      }
    `,
  },
  rust: {
    filename: 'cart.rs',
    code: code`
      mod cart {
          pub struct CartLine {
              pub sku: String,
              pub price_cents: i64,
              pub quantity: u32,
          }

          pub struct Order {
              pub customer_id: String,
              pub lines: Vec<CartLine>,
          }

          pub struct ShoppingCart {
              customer_id: String,
              lines: Vec<CartLine>,
          }

          impl ShoppingCart {
              pub fn new(customer_id: &str) -> Self {
                  ShoppingCart { customer_id: customer_id.to_string(), lines: Vec::new() }
              }

              pub fn customer_id(&self) -> &str {
                  &self.customer_id
              }

              pub fn total(&self) -> i64 {
                  self.lines.iter().map(|l| l.price_cents * i64::from(l.quantity)).sum()
              }

              pub fn add(&mut self, sku: &str, price_cents: i64, quantity: u32) {
                  self.lines.push(CartLine { sku: sku.to_string(), price_cents, quantity });
              }

              pub fn checkout(self) -> Order {
                  Order { customer_id: self.customer_id, lines: self.lines }
              }
          }
      }

      use cart::ShoppingCart;

      fn main() {
          let mut cart = ShoppingCart::new("C-1001");
          cart.add("SKU-4471", 1_999, 2);
          println!("{} owes {}", cart.customer_id(), cart.total());
          let order = cart.checkout();
          println!("{} lines for {}", order.lines.len(), order.customer_id);
      }
    `,
  },
  links: [
    {
      csharp: [4, 6],
      rust: [13, 14, 15, 16],
      note: 'Fields without `pub` are private, but private to the module `cart`, not to the struct. Anything else inside `mod cart` can read them.',
    },
    {
      csharp: [10],
      rust: lines(23, 25),
      note: 'No properties. A getter is a method named after the field, with no `get_` prefix, borrowing `&self` and returning `&str` into the struct.',
    },
    {
      csharp: [12],
      rust: lines(27, 29),
      note: 'An expression-bodied property becomes a `&self` method. `&self` guarantees the call cannot modify the cart, deeply, including through the Vec.',
    },
    {
      csharp: [14, 15],
      rust: lines(31, 33),
      note: '`&mut self` is the only way to get write access. At the call site on line 44 it also forces `let mut cart`.',
    },
    {
      csharp: [17, 18, 19, 20, 21, 22],
      rust: lines(35, 37),
      note: '`checkout(self)` takes the cart by value. It moves the id and lines straight into the order with no copy and no `Clear()`, and the cart ceases to exist.',
    },
    {
      csharp: [20],
      rust: [47, 48],
      note: 'After `checkout`, `cart` is moved. Adding `cart.add(...)` after line 47 would be E0382, where the C# version silently accepts items into a cart that was already checked out.',
    },
  ],
  breaks: [
    {
      heading: 'A method can consume its receiver',
      body: [
        'Nothing in C# stops a caller from using an object after `Checkout()`, `Build()` or `Dispose()`. Classes grow an `_isCompleted` flag and throw `InvalidOperationException` or `ObjectDisposedException` at runtime.',
        'A `self` method takes ownership, so the old binding is moved. Builders, state transitions and "finish" methods use this to make the invalid state unrepresentable.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct ShoppingCart {
              lines: Vec<String>,
          }

          impl ShoppingCart {
              fn add(&mut self, sku: &str) {
                  self.lines.push(sku.to_string());
              }

              fn checkout(self) -> Vec<String> {
                  self.lines
              }
          }

          fn main() {
              let mut cart = ShoppingCart { lines: Vec::new() };
              cart.add("SKU-4471");
              let order = cart.checkout();
              cart.add("SKU-9000");
              println!("{order:?}");
          }
        `,
      },
    },
    {
      heading: '`&self` is deeper than `readonly`',
      body: [
        'A `readonly List<CartLine>` field only stops you reassigning the field; `_lines.Add` still works. A `readonly` member of a struct protects the struct\'s own bytes and nothing it points to.',
        'Through `&self` everything reachable is read-only: fields, fields of fields, the contents of the Vec. Mutating through a shared reference needs `Cell`, `RefCell` or a lock, and that is visible in the field types.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct AuditLog {
              entries: Vec<String>,
          }

          impl AuditLog {
              fn len_and_note(&self) -> usize {
                  self.entries.push(String::from("read length"));
                  self.entries.len()
              }
          }

          fn main() {
              let log = AuditLog { entries: Vec::new() };
              println!("{}", log.len_and_note());
          }
        `,
      },
    },
    {
      heading: 'Privacy is per module, and there is no `protected`',
      body: [
        'C# access modifiers are per type: `private` means this class. Rust\'s default visibility means this module and its children. Two structs in the same module see each other\'s private fields, and a test module inside the file sees everything.',
        '`pub` is public to whoever can reach the module; `pub(crate)` is the equivalent of `internal`. There is no inheritance, so there is no `protected`.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          mod billing {
              pub struct Invoice {
                  total_cents: i64,
              }

              pub(crate) fn new_invoice(total_cents: i64) -> Invoice {
                  Invoice { total_cents }
              }

              pub fn audit(invoice: &Invoice) -> bool {
                  invoice.total_cents >= 0
              }
          }

          fn main() {
              let invoice = billing::new_invoice(12_500);
              println!("{}", billing::audit(&invoice));
          }
        `,
      },
    },
    {
      heading: 'Getters borrow the whole struct',
      body: [
        '`cart.customer_id()` returns `&str` tied to a borrow of all of `cart`, not only the field. While that string is alive, you cannot call `cart.add(...)`. Accessing `cart.customer_id` directly borrows only that field.',
        'So plain data types often have `pub` fields and no accessors at all, and accessors are reserved for types that protect an invariant. Wrapping every field in a property is a C# habit that costs flexibility here.',
      ],
    },
  ],
  visualize: ['st-self-consumes', 'st-move-field-behind-ref'],
  drills: ['st-move-out-of-self'],
  takeaways: [
    '`&self` reads, `&mut self` writes, `self` consumes. The signature is the contract.',
    'Privacy is module-scoped; `pub(crate)` is `internal`.',
    'Prefer public fields for plain data and methods for invariants, not properties for everything.',
  ],
};
