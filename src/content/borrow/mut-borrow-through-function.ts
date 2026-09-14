import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const mutBorrowThroughFunction: BorrowSnippet = {
  id: 'mut-borrow-through-function',
  title: 'Lending &mut to a function',
  summary: 'Each call takes an exclusive borrow and gives it back when it returns, so calls can follow each other freely.',
  variables: ['report'],
  code: code`
    fn append_line(report: &mut String, line: &str) {
        report.push_str(line);
        report.push('\n');
    }

    fn main() {
        let mut report = String::new();
        append_line(&mut report, "orders: 42");
        append_line(&mut report, "refunds: 3");
        let summary = &report;
        println!("{summary}");
    }
  `,
  spans: [
    { variable: 'report', kind: 'dropped', startLine: 7, endLine: 12, label: 'main owns the String' },
    { variable: 'report', kind: 'borrow_mut', startLine: 8, endLine: 8, label: '&mut report lent to append_line; returned when it returns' },
    { variable: 'report', kind: 'borrow_mut', startLine: 9, endLine: 9, label: 'a second, non-overlapping &mut' },
    { variable: 'report', kind: 'borrow', startLine: 10, endLine: 11, label: 'summary = &report' },
  ],
  conflicts: [],
  takeaway:
    'Like passing a `StringBuilder` in C#, with two differences you can see in the signature: `&mut` says the function will modify it, and it cannot keep it. Exclusive borrows that follow each other never conflict.',
};
