import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const disjointMutableBorrows: BorrowSnippet = {
  id: 'disjoint-mutable-borrows',
  title: 'Proving the borrows are disjoint',
  summary: '`get_disjoint_mut` checks the indices differ, then hands out both `&mut` at once.',
  pairedWith: 'two-mutable-borrows',
  variables: ['accounts'],
  code: code`
    struct Account {
        balance: i64,
    }

    fn main() {
        let mut accounts = vec![Account { balance: 500 }, Account { balance: 20 }];
        let [from, to] = accounts
            .get_disjoint_mut([0, 1])
            .expect("indices must be distinct and in bounds");
        from.balance -= 100;
        to.balance += 100;
        println!("{} / {}", accounts[0].balance, accounts[1].balance);
    }
  `,
  spans: [
    { variable: 'accounts', kind: 'dropped', startLine: 6, endLine: 13, label: 'owns both accounts' },
    { variable: 'accounts', kind: 'borrow_mut', startLine: 7, endLine: 11, label: 'one &mut borrow of accounts, split into from and to' },
    { variable: 'accounts', kind: 'borrow', startLine: 12, endLine: 12, label: 'both &mut ended on line 11' },
  ],
  conflicts: [],
  takeaway:
    'There is one mutable borrow of `accounts`, and the method returns two non-overlapping references derived from it. The equal-indices case becomes an `Err` you have to handle instead of a silent aliasing bug. `split_at_mut` is the older, slice-based way to do the same thing.',
};
