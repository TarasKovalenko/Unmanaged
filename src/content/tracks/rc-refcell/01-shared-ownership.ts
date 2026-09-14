import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const sharedOwnership: Lesson = {
  id: 'rc-shared-ownership',
  title: 'Two owners for one value',
  summary: '`Rc<T>` gives a value several owners by counting them. It does not give you a mutable, thread-agnostic object reference.',
  intro: [
    'In C# every class instance can be referenced from anywhere. An `Order` sits in `Customer.Orders` and in `Shipment.Order` at the same time, and the GC frees it once neither is reachable. Nobody owns it; the heap does.',
    'Rust values have exactly one owner. When two structs genuinely need to keep the same value alive, and neither outlives the other in any way the compiler can see, `Rc<T>` (reference counted) turns "one owner" into "a counted set of owners". It is the closest thing to a C# reference, and the differences are the whole lesson.',
  ],
  csharp: {
    filename: 'Checkout.cs',
    code: code`
      public sealed class Order(string id)
      {
          public string Id { get; } = id;
          public List<string> Lines { get; } = new();
      }

      public sealed class Customer(string name)
      {
          public string Name { get; } = name;
          public List<Order> Orders { get; } = new();
      }

      public sealed record Shipment(string Carrier, Order Order);

      public static class Checkout
      {
          public static (Customer, Shipment) Place(string customerName)
          {
              var order = new Order("ORD-1001");
              order.Lines.Add("SKU-42");
              var customer = new Customer(customerName);
              customer.Orders.Add(order);
              var shipment = new Shipment("DHL", order);
              return (customer, shipment);
          }
      }
    `,
  },
  rust: {
    filename: 'checkout.rs',
    code: code`
      use std::rc::Rc;

      struct Order {
          id: String,
          lines: Vec<String>,
      }

      struct Customer {
          name: String,
          orders: Vec<Rc<Order>>,
      }

      struct Shipment {
          carrier: String,
          order: Rc<Order>,
      }

      fn place(customer_name: &str) -> (Customer, Shipment) {
          let order = Rc::new(Order {
              id: String::from("ORD-1001"),
              lines: vec![String::from("SKU-42")],
          });
          let customer = Customer { name: customer_name.to_string(), orders: vec![Rc::clone(&order)] };
          let shipment = Shipment { carrier: String::from("DHL"), order };
          (customer, shipment)
      }

      fn main() {
          let (customer, shipment) = place("Contoso");
          println!("{} has {} order(s)", customer.name, customer.orders.len());
          println!("{} ships {} ({} line)", shipment.carrier, shipment.order.id, shipment.order.lines.len());
          println!("owners: {}", Rc::strong_count(&shipment.order));
          drop(customer);
          println!("owners after customer is gone: {}", Rc::strong_count(&shipment.order));
      }
    `,
    stdout: `Contoso has 1 order(s)
DHL ships ORD-1001 (1 line)
owners: 2
owners after customer is gone: 1
`,
  },
  links: [
    {
      csharp: [10],
      rust: [10],
      note: '`List<Order>` holds references implicitly. In Rust `Vec<Order>` would own the orders outright, so the shared ownership has to be spelled out as `Vec<Rc<Order>>`.',
    },
    {
      csharp: [13],
      rust: lines(13, 16),
      note: 'The second holder. Both `Customer` and `Shipment` keep the same allocation alive; neither is "the" owner.',
    },
    {
      csharp: [19, 20],
      rust: lines(19, 22),
      note: 'The order is fully built **before** it goes into the `Rc`. Once shared, it is read-only: `order.lines.push(...)` after this point is E0596. C# lets you keep calling `Lines.Add` on a shared object forever.',
    },
    {
      csharp: [22],
      rust: [23],
      note: '`Rc::clone(&order)` allocates nothing and copies no fields. It increments a counter and returns another pointer to the same heap block. The `Rc::clone` spelling (rather than `order.clone()`) is the convention that tells readers it is cheap.',
    },
    {
      csharp: [23],
      rust: [24],
      note: 'The last use moves the original handle into the shipment. No clone needed: two owners, two handles.',
    },
    {
      csharp: [24],
      rust: lines(32, 34),
      note: 'There is no C# equivalent of `strong_count`: the GC does not track how many references exist, it traces reachability. Dropping the customer decrements the count, and the order is freed the moment it reaches zero, not at the next collection.',
    },
  ],
  breaks: [
    {
      heading: '`Rc::clone` is not `ICloneable.Clone`',
      body: [
        'In .NET, `Clone()` means a new object, shallow or deep depending on who wrote it. `Rc::clone` never copies the value: it bumps a non-atomic counter stored next to the value and hands back a pointer. It is closer to assigning a reference in C#, with a visible cost of one increment and, later, one decrement.',
        'That is why reviewers ask for `Rc::clone(&order)` instead of `order.clone()`. Both compile. Only one tells the reader at a glance that no `Order` is being duplicated.',
      ],
    },
    {
      heading: 'A shared reference in C# can mutate. `Rc<T>` cannot.',
      body: [
        '`Rc<T>` implements `Deref`, so you get `&T`, and never `DerefMut`. With two owners, a `&mut T` could not be exclusive, and exclusivity is the rule the whole language is built on. Declaring the handle `let mut` does not help; that makes the handle reassignable, not the value behind it.',
        'The escape routes are `RefCell` inside the `Rc` (next lesson), `Rc::make_mut` for copy-on-write, and `Rc::get_mut`, which succeeds only while no other `Rc` or `Weak` points at the value. Often the better answer is to finish building the value before it is shared, as `place` does.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::rc::Rc;

          struct Order {
              lines: Vec<String>,
          }

          fn main() {
              let order = Rc::new(Order { lines: Vec::new() });
              let for_shipment = Rc::clone(&order);
              order.lines.push(String::from("SKU-42"));
              println!("{}", for_shipment.lines.len());
          }
        `,
      },
    },
    {
      heading: 'C# references cross threads freely. `Rc` does not compile there.',
      body: [
        'Any C# object reference can be captured by `Task.Run`; whether that is safe is your problem. `Rc` uses a plain integer for its count, so two threads cloning at once would corrupt it. The compiler knows: `Rc<T>` is not `Send`, and `thread::spawn` requires `Send`, so you get E0277 rather than a race.',
        '`Arc<T>` is the same type with an atomic counter (think `Interlocked.Increment`). It costs a little more per clone, which is the only reason `Rc` exists. Default to `Rc` in single-threaded code, and let the compiler tell you when you need `Arc`.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::rc::Rc;
          use std::thread;

          fn main() {
              let carrier = Rc::new(String::from("DHL"));
              let for_worker = Rc::clone(&carrier);
              let handle = thread::spawn(move || println!("booking with {for_worker}"));
              handle.join().unwrap();
              println!("{carrier}");
          }
        `,
      },
    },
    {
      heading: 'Freed at the last decrement, not at the next GC',
      body: [
        'The GC frees an object at some point after it becomes unreachable, and a finalizer may or may not run. `Rc` frees the value, running `Drop`, on the exact line where the last handle goes away. That is deterministic, and it also means dropping a large graph happens synchronously on the thread doing the drop, with no background collector to absorb the cost.',
        'Counting has a blind spot the tracing GC does not: two values that hold `Rc`s to each other never reach zero. That is lesson three.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `shipment still alive: DHL
releasing DHL
done
`,
        code: code`
          use std::rc::Rc;

          struct Shipment {
              carrier: String,
          }

          impl Drop for Shipment {
              fn drop(&mut self) {
                  println!("releasing {}", self.carrier);
              }
          }

          fn main() {
              let shipment = Rc::new(Shipment { carrier: String::from("DHL") });
              let tracking_view = Rc::clone(&shipment);
              drop(shipment);
              println!("shipment still alive: {}", tracking_view.carrier);
              drop(tracking_view);
              println!("done");
          }
        `,
      },
    },
  ],
  visualize: ['rc-vec-push'],
  drills: ['rc-push-through-rc', 'rc-send-to-thread'],
  takeaways: [
    '`Rc<T>` is shared ownership by counting; `Rc::clone` is a counter bump, not a copy.',
    'What an `Rc` points to is read-only. Build the value first, then share it.',
    '`Rc` is single-threaded by type. `Arc` is the threaded version, and E0277 tells you when you need it.',
  ],
};
