import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const borrowIntoFunction: BorrowSnippet = {
  id: 'borrow-into-function',
  title: 'Lend it to the function',
  summary: 'A `&Invoice` parameter borrows for the length of the call and hands access back.',
  pairedWith: 'move-into-function',
  variables: ['invoice'],
  code: code`
    struct Invoice {
        customer: String,
        total_cents: u64,
    }

    fn print_summary(invoice: &Invoice) {
        println!("{}: {}", invoice.customer, invoice.total_cents);
    }

    fn main() {
        let invoice = Invoice { customer: String::from("Contoso"), total_cents: 12_900 };
        print_summary(&invoice);
        print_summary(&invoice);
        println!("total: {}", invoice.total_cents);
    }
  `,
  spans: [
    { variable: 'invoice', kind: 'dropped', startLine: 11, endLine: 15, label: 'main owns the invoice throughout' },
    { variable: 'invoice', kind: 'borrow', startLine: 12, endLine: 12, label: '&invoice lent to print_summary; returned when the call ends' },
    { variable: 'invoice', kind: 'borrow', startLine: 13, endLine: 13, label: 'lent again' },
    { variable: 'invoice', kind: 'borrow', startLine: 14, endLine: 14, label: 'println! borrows a field' },
  ],
  conflicts: [],
  takeaway:
    'The `&` appears at both ends: `&Invoice` in the signature, `&invoice` at the call site. The signature is also a guarantee: `print_summary` cannot keep the invoice after it returns.',
};
