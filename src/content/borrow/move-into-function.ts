import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const moveIntoFunction: BorrowSnippet = {
  id: 'move-into-function',
  title: 'Passing by value moves',
  summary: 'A parameter of type `Invoice` takes ownership. The caller does not get it back.',
  pairedWith: 'borrow-into-function',
  variables: ['invoice', 'archive::invoice'],
  code: code`
    struct Invoice {
        customer: String,
        total_cents: u64,
    }

    fn archive(invoice: Invoice) {
        println!("archived invoice for {}", invoice.customer);
    }

    fn main() {
        let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_900 };
        archive(invoice);
        println!("total: {}", invoice.total_cents);
    }
  `,
  spans: [
    { variable: 'invoice', kind: 'moved', startLine: 11, endLine: 12, label: 'moved into archive() on line 12' },
    { variable: 'archive::invoice', kind: 'dropped', startLine: 6, endLine: 8, label: 'archive owns the invoice now; it is freed when archive returns' },
    { variable: 'archive::invoice', kind: 'borrow', startLine: 7, endLine: 7, label: 'println! borrows the customer field' },
    { variable: 'invoice', kind: 'borrow', startLine: 13, endLine: 13, label: 'reads a field of a value that was moved away' },
  ],
  conflicts: [
    {
      spans: [0, 3],
      errorCode: 'E0382',
      message: `error[E0382]: borrow of moved value: \`invoice\`
  --> src/main.rs:13:27
   |
11 |     let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_900 };
   |         ------- move occurs because \`invoice\` has type \`Invoice\`, which does not implement the \`Copy\` trait
12 |     archive(invoice);
   |             ------- value moved here
13 |     println!("total: {}", invoice.total_cents);
   |                           ^^^^^^^^^^^^^^^^^^^ value borrowed here after move
   |
note: consider changing this parameter type in function \`archive\` to borrow instead if owning the value isn't necessary
  --> src/main.rs:6:21
   |
 6 | fn archive(invoice: Invoice) {
   |    -------          ^^^^^^^ this parameter takes ownership of the value
   |    |
   |    in this function
note: if \`Invoice\` implemented \`Clone\`, you could clone the value
  --> src/main.rs:1:1
   |
 1 | struct Invoice {
   | ^^^^^^^^^^^^^^ consider implementing \`Clone\` for this type
...
12 |     archive(invoice);
   |             ------- you could clone this value`,
      explanation:
        'In C#, `archiver.Archive(invoice)` copies a reference and you keep yours. Here `archive(invoice: Invoice)` takes the value itself. By line 13 the invoice has already been freed at the end of `archive` (line 8), so there is nothing left to read. Even though `total_cents` is a plain `u64`, the whole struct was moved.',
    },
  ],
  csharpEquivalent: code`
    var invoice = new Invoice("Contoso", TotalCents: 12_900);
    archiver.Archive(invoice);
    Console.WriteLine($"total: {invoice.TotalCents}");
  `,
  csharpNote: 'Compiles. Whether Archive kept a reference, mutated the invoice, or disposed something inside it is invisible at the call site.',
};
