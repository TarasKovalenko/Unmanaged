import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const twoMutableBorrows: BorrowSnippet = {
  id: 'two-mutable-borrows',
  title: 'Two &mut into one Vec',
  summary: 'Transferring between two accounts in the same list. Obviously fine in C#, E0499 in Rust.',
  pairedWith: 'disjoint-mutable-borrows',
  variables: ['accounts'],
  code: code`
    struct Account {
        balance: i64,
    }

    fn main() {
        let mut accounts = vec![Account { balance: 500 }, Account { balance: 20 }];
        let from = &mut accounts[0];
        let to = &mut accounts[1];
        from.balance -= 100;
        to.balance += 100;
    }
  `,
  spans: [
    { variable: 'accounts', kind: 'dropped', startLine: 6, endLine: 11, label: 'owns both accounts' },
    { variable: 'accounts', kind: 'borrow_mut', startLine: 7, endLine: 9, label: 'from = &mut accounts[0], used on line 9' },
    { variable: 'accounts', kind: 'borrow_mut', startLine: 8, endLine: 10, label: 'to = &mut accounts[1], used on line 10' },
  ],
  conflicts: [
    {
      spans: [1, 2],
      errorCode: 'E0499',
      message: `error[E0499]: cannot borrow \`accounts\` as mutable more than once at a time
 --> src/main.rs:8:19
  |
7 |     let from = &mut accounts[0];
  |                     -------- first mutable borrow occurs here
8 |     let to = &mut accounts[1];
  |                   ^^^^^^^^ second mutable borrow occurs here
9 |     from.balance -= 100;
  |     ------------------- first borrow later used here
  |
  = help: use \`.split_at_mut(position)\` to obtain two mutable non-overlapping sub-slices`,
      explanation:
        'You can see that index 0 and index 1 are different elements. The borrow checker does not reason about index values: both expressions go through `IndexMut::index_mut(&mut self, ...)`, which borrows the entire Vec mutably. Two live `&mut` to the same Vec is the one thing never allowed. In C# this is fine, and it is also fine when both indices come from user input and happen to be equal, which is how you end up crediting and debiting the same account.',
    },
  ],
  csharpEquivalent: code`
    var accounts = new List<Account> { new(Balance: 500), new(Balance: 20) };
    var from = accounts[0];
    var to = accounts[1];
    from.Balance -= 100;
    to.Balance += 100;
  `,
  csharpNote: 'Compiles and runs. Nothing stops from and to being the same object.',
};
