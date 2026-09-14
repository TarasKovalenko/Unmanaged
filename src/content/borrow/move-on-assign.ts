import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const moveOnAssign: BorrowSnippet = {
  id: 'move-on-assign',
  title: 'Assignment moves a String',
  summary: 'The C# reflex `var b = a;` compiles in Rust, but it moves ownership and kills `a`.',
  pairedWith: 'borrow-on-assign',
  variables: ['customer', 'billing_name'],
  code: code`
    fn main() {
        let customer = String::from("Contoso Ltd");
        let billing_name = customer;
        println!("Billing: {billing_name}");
        println!("Customer: {customer}");
    }
  `,
  spans: [
    { variable: 'customer', kind: 'moved', startLine: 2, endLine: 3, label: 'owns the String until line 3 moves it into billing_name' },
    { variable: 'billing_name', kind: 'dropped', startLine: 3, endLine: 6, label: 'new owner; the String is freed at the end of main' },
    { variable: 'billing_name', kind: 'borrow', startLine: 4, endLine: 4, label: 'println! borrows billing_name' },
    { variable: 'customer', kind: 'borrow', startLine: 5, endLine: 5, label: 'println! tries to borrow customer, which no longer owns anything' },
  ],
  conflicts: [
    {
      spans: [0, 3],
      errorCode: 'E0382',
      message: `error[E0382]: borrow of moved value: \`customer\`
 --> src/main.rs:5:26
  |
2 |     let customer = String::from("Contoso Ltd");
  |         -------- move occurs because \`customer\` has type \`String\`, which does not implement the \`Copy\` trait
3 |     let billing_name = customer;
  |                        -------- value moved here
4 |     println!("Billing: {billing_name}");
5 |     println!("Customer: {customer}");
  |                          ^^^^^^^^ value borrowed here after move
  |
help: consider cloning the value if the performance cost is acceptable
  |
3 |     let billing_name = customer.clone();
  |                                ++++++++`,
      explanation:
        'In C# this prints "Contoso Ltd" twice: both variables hold a reference to the same object. In Rust, `let billing_name = customer;` transfers ownership of the heap buffer. `customer` is not null afterwards; it is statically uninitialised, the same state as a declared-but-unassigned local, and the compiler refuses the read.',
    },
  ],
  csharpEquivalent: code`
    var customer = new StringBuilder("Contoso Ltd");
    var billingName = customer;
    Console.WriteLine($"Billing: {billingName}");
    Console.WriteLine($"Customer: {customer}");
  `,
  csharpNote: 'Compiles and runs. Two references, one object; the GC counts both.',
};
