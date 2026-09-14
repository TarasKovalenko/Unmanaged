import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const borrowOnAssign: BorrowSnippet = {
  id: 'borrow-on-assign',
  title: 'Borrow instead of move',
  summary: 'One `&` turns the move into a borrow, and both names stay usable.',
  pairedWith: 'move-on-assign',
  variables: ['customer'],
  code: code`
    fn main() {
        let customer = String::from("Contoso Ltd");
        let billing_name = &customer;
        println!("Billing: {billing_name}");
        println!("Customer: {customer}");
    }
  `,
  spans: [
    { variable: 'customer', kind: 'dropped', startLine: 2, endLine: 6, label: 'sole owner for the whole function' },
    { variable: 'customer', kind: 'borrow', startLine: 3, endLine: 4, label: 'billing_name = &customer, last used on line 4' },
    { variable: 'customer', kind: 'borrow', startLine: 5, endLine: 5, label: 'println! borrows customer' },
  ],
  conflicts: [],
  takeaway:
    '`billing_name` is a `&String`: a pointer that does not own anything. Shared borrows can overlap freely, so this is the closest thing to C#\'s "two names, one object", minus the ability to mutate through either name.',
};
