import { code } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const useAfterMove: Lesson = {
  id: 'err-e0382-e0505',
  title: 'E0382 and E0505: use after move',
  summary: 'Moved in a loop, moved into a closure, partially moved, or moved while something still borrows it. Same family, different labels.',
  intro: [
    'The nearest C# failure is `ObjectDisposedException`: something used an object after its owner decided it was finished. C# finds out at runtime, if the disposed path is exercised at all.',
    'E0382 is "used after it was given away". E0505 is the mirror image: "given away while something was still looking at it". Both come with labels that tell you where the move was and where the use is. The skill is recognising which kind of move you are looking at, because each has a different standard fix.',
  ],
  csharp: {
    filename: 'OrderImporter.cs',
    code: code`
      public sealed class OrderImporter(IUploader uploader, ILogger<OrderImporter> logger)
      {
          public async Task ImportAsync(List<Order> orders)
          {
              var batch = new ImportBatch(orders);
              var upload = Task.Run(() => uploader.Upload(batch));

              long revenue = 0;
              foreach (var order in orders)
                  revenue += order.TotalCents;

              logger.LogInformation("Imported {Count} orders, {Revenue}", batch.Count, revenue);
              await upload;
          }
      }
    `,
  },
  rust: {
    filename: 'order_importer.rs',
    stdout: 'imported 2 orders, 1200 cents\nuploaded 2 orders\n',
    code: code`
      use std::thread;

      struct Order {
          id: u32,
          total_cents: i64,
      }

      fn upload(batch: Vec<Order>) -> usize {
          batch.len()
      }

      fn import(orders: Vec<Order>) {
          let count = orders.len();
          let revenue: i64 = orders.iter().map(|o| o.total_cents).sum();

          let uploader = thread::spawn(move || upload(orders));

          println!("imported {count} orders, {revenue} cents");
          let uploaded = uploader.join().unwrap();
          println!("uploaded {uploaded} orders");
      }

      fn main() {
          import(vec![Order { id: 1, total_cents: 500 }, Order { id: 2, total_cents: 700 }]);
      }
    `,
  },
  links: [
    {
      csharp: [6],
      rust: [16],
      note: '`move ||` gives the closure ownership of `orders`. After this line `import` cannot touch `orders` at all; using it is E0382 with "value moved into closure here".',
    },
    {
      csharp: [5, 12],
      rust: [13],
      note: 'Everything the rest of the function needs is read **before** the move. `count` is a `usize`, which is `Copy`, so it survives the closure taking the Vec.',
    },
    {
      csharp: [8, 9, 10],
      rust: [14],
      note: '`orders.iter()` borrows. `for order in orders` would consume the Vec, and the spawn on line 16 would then be E0382 with "moved due to this implicit call to `.into_iter()`".',
    },
    {
      csharp: [13],
      rust: [19, 20],
      note: '`join` is the `await upload`. The result comes back through the handle, because the thread owned the data.',
    },
    {
      csharp: [3],
      rust: [12],
      note: '`Vec<Order>` by value: the importer takes the orders and decides where they go. C# passes a shared reference and every holder can keep using it.',
    },
  ],
  breaks: [
    {
      heading: '"value moved into closure here" means the closure owns it now',
      body: [
        'A C# lambda captures variables by reference into a hidden class, so the lambda and the method see the same variable. A Rust `move` closure takes each captured variable by value. The error has two secondary spans: "value moved into closure here" on the `move ||`, and "variable moved due to use in closure" on the line inside the closure that caused the capture. That second label is how you find which captured variable is the problem in a long closure.',
        'Note the subject: `entry.user`, not `entry`. Edition 2021 and later closures capture individual fields, so only the fields used inside are moved. The fix is to read or clone what the outer code needs before the closure is created.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::thread;

          struct AuditEntry {
              user: String,
              action: String,
          }

          fn main() {
              let entry = AuditEntry { user: String::from("ana"), action: String::from("refund") };
              let writer = thread::spawn(move || {
                  println!("writing audit: {} {}", entry.user, entry.action);
              });
              println!("audit queued for {}", entry.user);
              writer.join().unwrap();
          }
        `,
      },
    },
    {
      heading: 'Partially moved: the struct exists, one field does not',
      body: [
        'C# has no notion of an object with a missing field. Rust does: `send_welcome(customer.email)` moves only `email`. Reading `customer.name` afterwards is fine; using `customer` as a whole is "borrow of partially moved value", with the move labelled "value partially moved here".',
        'The `note:` names the field that moved. Fixes, in order of preference: pass `&customer.email` if the callee only reads, destructure the struct when you really are taking it apart, or clone the one field.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          #[derive(Debug)]
          struct Customer {
              name: String,
              email: String,
          }

          fn send_welcome(email: String) {
              println!("welcome mail to {email}");
          }

          fn main() {
              let customer = Customer { name: String::from("Ana"), email: String::from("ana@contoso.com") };
              send_welcome(customer.email);
              println!("{}", customer.name);
              println!("{customer:?}");
          }
        `,
      },
    },
    {
      heading: 'E0505 has four labels, and the last one is the culprit',
      body: [
        'E0505 reads "cannot move out of `request` because it is borrowed". Labels: "binding `request` declared here" (line 5), "borrow of `request` occurs here" (line 6), "move out of `request` occurs here" (line 7, the `^^^`), "borrow later used here" (line 8). The borrow is only a problem because of line 8. Delete that use, or move it above line 7, and the error disappears.',
        'The C# instinct reads this as "you cannot send something you have looked at". The real rule is narrower: you cannot send it while a reference into it is still going to be used. `path` is a slice of the request\'s buffer, and that buffer now belongs to the channel.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          use std::sync::mpsc;

          fn main() {
              let (tx, rx) = mpsc::channel::<String>();
              let request = String::from("GET /orders/42 HTTP/1.1");
              let path = request.split(' ').nth(1).unwrap_or("/");
              tx.send(request).unwrap();
              println!("forwarded request for {path}");
              println!("{}", rx.recv().unwrap());
          }
        `,
      },
    },
    {
      heading: 'E0382 vs E0505 tells you which fix to reach for',
      body: [
        '**E0382** (use after move): the value is gone. Either the mover should have borrowed (change the callee to `&T`), the user should have gone first (reorder), or two parties really need their own copy (clone, or `Rc`/`Arc` for shared ownership).',
        '**E0505** (move while borrowed): the value is still there, and a reference outlives your plans for it. Either copy out the small thing the reference was for (an id, a length), or end the borrow before the move. Cloning the whole owner to satisfy a reference to one field is the most common over-fix.',
      ],
    },
  ],
  visualize: ['move-on-assign', 'move-into-function', 'clone-to-escape'],
  drills: ['move-in-loop', 'err-e0505', 'err-e0373'],
  takeaways: [
    'E0382: something took ownership earlier. Find the "value moved here" label and decide whether that line should borrow.',
    'E0505: a borrow outlives a move. Find "borrow later used here" and end the borrow first.',
    'Closures capture fields, not whole structs; loops move on the first iteration.',
  ],
};
