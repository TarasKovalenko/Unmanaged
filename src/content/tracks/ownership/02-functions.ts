import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const functions: Lesson = {
  id: 'functions',
  title: 'Signatures say who keeps it',
  summary: 'Every parameter is one of three things: `T` (take it), `&T` (read it), `&mut T` (change it).',
  intro: [
    'In C#, a method that receives an object can read it, mutate it, store it in a field, or capture it in a closure that runs next Tuesday. The signature tells you none of that, so you read the implementation.',
    'In Rust, passing a value to a function follows the same rule as assignment: it moves. To let a function use something without taking it, you lend it, and the signature has to say so.',
  ],
  csharp: {
    filename: 'OrderService.cs',
    code: code`
      public sealed class OrderService(IOrderRepository repository, ILogger<OrderService> logger)
      {
          public void Submit(Order order)
          {
              Validate(order);
              repository.Save(order);
              logger.LogInformation("Submitted {Id} for {Total}", order.Id, order.Total);
          }

          private static void Validate(Order order)
          {
              if (order.Lines.Count == 0)
                  throw new InvalidOperationException("empty order");
          }
      }
    `,
  },
  rust: {
    filename: 'order_service.rs',
    code: code`
      struct Order {
          id: u64,
          lines: Vec<String>,
          total_cents: u64,
      }

      struct OrderRepository {
          saved: Vec<Order>,
      }

      impl OrderRepository {
          fn save(&mut self, order: Order) {
              self.saved.push(order);
          }
      }

      fn validate(order: &Order) -> Result<(), String> {
          if order.lines.is_empty() {
              return Err(format!("order {} is empty", order.id));
          }
          Ok(())
      }

      fn submit(repository: &mut OrderRepository, order: Order) -> Result<(), String> {
          validate(&order)?;
          let (id, total) = (order.id, order.total_cents);
          repository.save(order);
          println!("submitted {id} for {total}");
          Ok(())
      }

      fn main() {
          let mut repository = OrderRepository { saved: Vec::new() };
          let order = Order { id: 42, lines: vec![String::from("SKU-1")], total_cents: 12_900 };
          submit(&mut repository, order).unwrap();
          println!("{} saved", repository.saved.len());
      }
    `,
  },
  links: [
    {
      csharp: [3],
      rust: [24],
      note: '`Submit(Order order)` becomes an explicit choice. `submit` takes `order: Order` (ownership) because the repository is going to keep it.',
    },
    {
      csharp: [1],
      rust: [...lines(7, 9), 24],
      note: 'The injected repository. There is no container here; the caller lends `&mut OrderRepository` for the duration of the call, and gets exclusive use back afterwards.',
    },
    {
      csharp: [5, 10],
      rust: [17, 25],
      note: 'Validation only reads, so it borrows: `&Order` in the signature, `&order` at the call site. The `&` is visible at both ends, and `validate` provably cannot keep the order.',
    },
    {
      csharp: [6],
      rust: [12, 13, 27],
      note: '`Save` keeps the order. In Rust that is a move into the repository\'s Vec, which means `submit` cannot touch `order` after line 27.',
    },
    {
      csharp: [7],
      rust: [26, 28],
      note: 'C# logs from the order after saving it. Rust will not allow that, so copy the two `u64` fields out first. They are `Copy`, so this costs nothing.',
    },
    {
      csharp: [12, 13],
      rust: lines(18, 21),
      note: 'The exception becomes a returned `Err`, and `?` on line 25 returns it early. That is track 2; what matters here is that nothing unwinds.',
    },
  ],
  breaks: [
    {
      heading: 'A borrowed parameter cannot be kept. The compiler guarantees it.',
      body: [
        'In C#, "does this method hold on to my object?" is answered by reading code or trusting documentation. It matters: it decides whether you can reuse a buffer, whether mutating the object later is safe, and who disposes it.',
        'In Rust, a function taking `&Order` cannot store that reference anywhere that outlives the call. Taking `Order` by value is the only way for a callee to retain it, and it costs the caller access. The question is answered in the signature.',
      ],
    },
    {
      heading: 'Use after hand-off is a compile error, not a review comment',
      body: [
        'Line 7 of the C# reads the order after passing it to `Save`. That is almost always fine in C#, and occasionally a bug when `Save` mutates or clears it. Rust makes you decide which it is.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct Order {
              id: u64,
              lines: Vec<String>,
          }

          fn save(order: Order) {
              println!("saving {} lines", order.lines.len());
          }

          fn main() {
              let order = Order { id: 42, lines: Vec::new() };
              save(order);
              println!("saved {}", order.id); // E0382
          }
        `,
      },
    },
    {
      heading: '`&mut` is not `ref`',
      body: [
        'C#\'s `ref` lets the callee reassign the caller\'s variable, and so can `&mut T` (`*r = new_value`). The real difference is exclusivity. While a `&mut` exists, nothing else can read or write that value, not even the caller. `ref` promises nothing of the kind, which is why two `ref` locals to the same field are legal C#.',
        'For reference types C# does not need `ref` to mutate; any reference will do. In Rust, mutating through a borrow always needs `&mut`, so "this function modifies its argument" is always visible.',
      ],
    },
    {
      heading: 'Methods make the same choice for `self`',
      body: [
        '`&self`, `&mut self` and `self` are the same three options applied to the receiver. A method taking `self` by value consumes the object. That is how Rust APIs make "only call this once" a type error instead of an `ObjectDisposedException` or an `InvalidOperationException("already started")`.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        code: code`
          struct RequestBuilder {
              url: String,
          }

          struct Request {
              url: String,
          }

          impl RequestBuilder {
              fn build(self) -> Request {
                  Request { url: self.url }
              }
          }

          fn main() {
              let builder = RequestBuilder { url: String::from("/orders") };
              let request = builder.build();
              // builder.build(); // E0382: build() took self by value
              println!("{}", request.url);
          }
        `,
      },
    },
  ],
  visualize: ['move-into-function', 'borrow-into-function', 'mut-borrow-through-function'],
  takeaways: [
    'Read-only parameter: `&T`. Modifies it: `&mut T`. Keeps it: `T`.',
    'The callee cannot retain a borrow. That is a guarantee, not a convention.',
    'Methods consume, borrow, or mutably borrow `self` by the same rule.',
  ],
};
