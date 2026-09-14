import { code } from '../../code.ts';
import type { BorrowSnippet } from '../../types.ts';

export const snippets: BorrowSnippet[] = [
  {
    id: 'st-copy-struct-assign',
    title: 'A Copy struct behaves like a C# struct',
    summary: 'Assigning or passing a `Copy` struct duplicates it, so both names stay usable and changes to one never reach the other.',
    variables: ['origin', 'adjusted'],
    code: code`
      #[derive(Debug, Clone, Copy)]
      struct GeoPoint {
          lat: f64,
          lon: f64,
      }

      fn distance_from_equator(point: GeoPoint) -> f64 {
          point.lat.abs()
      }

      fn main() {
          let origin = GeoPoint { lat: 52.37, lon: 4.89 };
          let mut adjusted = origin;
          adjusted.lat += 0.01;
          let d = distance_from_equator(origin);
          println!("{origin:?} {adjusted:?} {d}");
      }
    `,
    spans: [
      { variable: 'origin', kind: 'dropped', startLine: 12, endLine: 17, label: 'GeoPoint is Copy: line 13 and line 15 copy it, nothing moves' },
      { variable: 'adjusted', kind: 'dropped', startLine: 13, endLine: 17, label: 'an independent copy of origin' },
      { variable: 'adjusted', kind: 'borrow_mut', startLine: 14, endLine: 14, label: 'changes adjusted only; origin keeps lat 52.37' },
      { variable: 'origin', kind: 'borrow', startLine: 16, endLine: 16, label: 'still usable after being assigned and passed by value' },
      { variable: 'adjusted', kind: 'borrow', startLine: 16, endLine: 16, label: 'println! borrows adjusted' },
    ],
    conflicts: [],
    csharpEquivalent: code`
      var origin = new GeoPoint(52.37, 4.89);
      var adjusted = origin;
      adjusted.Lat += 0.01;
      var d = Math.Abs(origin.Lat);
      Console.WriteLine($"{origin} {adjusted} {d}");

      public record struct GeoPoint(double Lat, double Lon);
    `,
    csharpNote: 'Same behaviour: `record struct` copies on assignment, so `origin` is unchanged.',
    takeaway:
      'Value semantics come from `Copy`, not from a `struct` keyword. Remove `Copy` from the derive and line 13 would move `origin` into `adjusted`, making line 15 an E0382.',
  },
  {
    id: 'st-move-field-behind-ref',
    title: 'Taking a field out through a reference',
    summary: 'A `&Invoice` lets you read `customer`, not take it. Moving a `String` field out of borrowed data is E0507.',
    variables: ['invoice'],
    code: code`
      struct Invoice {
          customer: String,
          total_cents: i64,
      }

      fn main() {
          let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_500 };
          let view = &invoice;
          let customer = view.customer;
          println!("{customer} owes {}", invoice.total_cents);
      }
    `,
    spans: [
      { variable: 'invoice', kind: 'dropped', startLine: 7, endLine: 11, label: 'owns the Invoice and its customer String' },
      { variable: 'invoice', kind: 'borrow', startLine: 8, endLine: 9, label: 'view = &invoice, last used on line 9' },
      { variable: 'invoice', kind: 'moved', startLine: 9, endLine: 9, label: 'view.customer tries to move the String out of the borrowed Invoice' },
      { variable: 'invoice', kind: 'borrow', startLine: 10, endLine: 10, label: 'println! reads total_cents' },
    ],
    conflicts: [
      {
        spans: [1, 2],
        errorCode: 'E0507',
        message: `error[E0507]: cannot move out of \`view.customer\` which is behind a shared reference
 --> src/main.rs:9:20
  |
9 |     let customer = view.customer;
  |                    ^^^^^^^^^^^^^ move occurs because \`view.customer\` has type \`String\`, which does not implement the \`Copy\` trait
  |
help: consider borrowing here
  |
9 |     let customer = &view.customer;
  |                    +
help: consider cloning the value if the performance cost is acceptable
  |
9 |     let customer = view.customer.clone();
  |                                 ++++++++`,
        explanation:
          'In C#, `var customer = view.Customer;` copies a reference to the same string, and the invoice keeps it too. In Rust, `let customer = view.customer;` means "take ownership of this String", and you cannot take anything out of a value you only borrowed: the invoice would be left with a hole where its customer was. Borrow it with `&view.customer`, clone it if you need your own copy, or take `Invoice` by value if you really are dismantling it.',
      },
    ],
  },
  {
    id: 'st-partial-move',
    title: 'Moving one field out of a struct',
    summary: 'You can move a single field out of an owned struct and keep using the other fields; only the whole struct becomes unusable.',
    variables: ['shipment', 'address'],
    code: code`
      #[derive(Debug)]
      struct Shipment {
          tracking: String,
          address: String,
          weight_grams: u32,
      }

      fn main() {
          let shipment = Shipment {
              tracking: String::from("1Z999AA10123456784"),
              address: String::from("1 Main St, Amsterdam"),
              weight_grams: 1_250,
          };
          let address = shipment.address;
          println!("{} {}g", shipment.tracking, shipment.weight_grams);
          println!("ship to {address}");
      }
    `,
    spans: [
      { variable: 'shipment', kind: 'dropped', startLine: 9, endLine: 17, label: 'owns tracking and weight_grams to the end of main' },
      { variable: 'shipment', kind: 'moved', startLine: 9, endLine: 14, label: 'shipment.address moved into address on line 14' },
      { variable: 'address', kind: 'dropped', startLine: 14, endLine: 17, label: 'now owns the address String' },
      { variable: 'shipment', kind: 'borrow', startLine: 15, endLine: 15, label: 'untouched fields are still readable' },
      { variable: 'address', kind: 'borrow', startLine: 16, endLine: 16, label: 'println! borrows address' },
    ],
    conflicts: [],
    csharpEquivalent: code`
      var shipment = new Shipment("1Z999AA10123456784", "1 Main St, Amsterdam", 1250);
      var address = shipment.Address;
      Console.WriteLine($"{shipment.Tracking} {shipment.WeightGrams}g");
      Console.WriteLine($"ship to {address}");
      Console.WriteLine(shipment); // still whole
    `,
    csharpNote: 'C# copies the reference; `shipment` stays whole and can still be printed.',
    takeaway:
      'The borrow checker tracks moves per field. After line 14, `shipment.tracking` and `shipment.weight_grams` are fine, but using `shipment` as a whole (printing it, passing it to a function, calling a `&self` method) is E0382 "borrow of partially moved value". This only works on a struct you own and that does not implement `Drop`.',
  },
  {
    id: 'st-self-consumes',
    title: 'A method that takes self',
    summary: '`send(self)` takes ownership of the draft. Using the draft afterwards is E0382, the compile-time version of `ObjectDisposedException`.',
    variables: ['draft', 'receipt'],
    code: code`
      struct EmailDraft {
          to: String,
          body: String,
      }

      impl EmailDraft {
          fn send(self) -> String {
              format!("sent {} bytes to {}", self.body.len(), self.to)
          }
      }

      fn main() {
          let draft = EmailDraft { to: String::from("ops@contoso.com"), body: String::from("Disk full") };
          let receipt = draft.send();
          println!("{receipt}");
          println!("resend to {}", draft.to);
      }
    `,
    spans: [
      { variable: 'draft', kind: 'moved', startLine: 13, endLine: 14, label: 'moved into send(self) on line 14' },
      { variable: 'receipt', kind: 'dropped', startLine: 14, endLine: 17, label: 'owns the receipt String' },
      { variable: 'receipt', kind: 'borrow', startLine: 15, endLine: 15, label: 'println! borrows receipt' },
      { variable: 'draft', kind: 'borrow', startLine: 16, endLine: 16, label: 'reads draft.to after draft was consumed' },
    ],
    conflicts: [
      {
        spans: [0, 3],
        errorCode: 'E0382',
        message: `error[E0382]: borrow of moved value: \`draft\`
  --> src/main.rs:16:30
   |
13 |     let draft = EmailDraft { to: String::from("ops@contoso.com"), body: String::from("Disk full") };
   |         ----- move occurs because \`draft\` has type \`EmailDraft\`, which does not implement the \`Copy\` trait
14 |     let receipt = draft.send();
   |                         ------ \`draft\` moved due to this method call
15 |     println!("{receipt}");
16 |     println!("resend to {}", draft.to);
   |                              ^^^^^^^^ value borrowed here after move
   |
note: \`EmailDraft::send\` takes ownership of the receiver \`self\`, which moves \`draft\`
  --> src/main.rs:7:13
   |
 7 |     fn send(self) -> String {
   |             ^^^^`,
        explanation:
          'A C# `Send()` is an ordinary instance method: the object is still there afterwards, and if sending should be final you add an `_isSent` flag and throw. In Rust the receiver `self` (no `&`) takes ownership, exactly like a by-value parameter. After line 14 the draft has been moved into `send` and dropped at the end of it, so line 16 has nothing to read. Copy the address out before sending, or make `send` take `&self` if the draft should survive.',
      },
    ],
  },
];
