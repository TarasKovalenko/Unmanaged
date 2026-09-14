import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const assignWhileBorrowed: BorrowSnippet = {
  id: 'assign-while-borrowed',
  title: 'Reassigning a borrowed variable',
  summary: 'Assigning a new value drops the old one, and something still points at the old one.',
  variables: ['connection_string'],
  code: code`
    fn main() {
        let mut connection_string = String::from("Server=dev");
        let active = &connection_string;
        connection_string = String::from("Server=prod");
        println!("connected to {active}");
    }
  `,
  spans: [
    { variable: 'connection_string', kind: 'dropped', startLine: 2, endLine: 4, label: '"Server=dev" is dropped when line 4 assigns over it' },
    { variable: 'connection_string', kind: 'dropped', startLine: 4, endLine: 6, label: 'owns "Server=prod" from line 4' },
    { variable: 'connection_string', kind: 'borrow', startLine: 3, endLine: 5, label: 'active = &connection_string, used on line 5' },
  ],
  conflicts: [
    {
      spans: [2, 0],
      errorCode: 'E0506',
      message: `error[E0506]: cannot assign to \`connection_string\` because it is borrowed
 --> src/main.rs:4:5
  |
3 |     let active = &connection_string;
  |                  ------------------ \`connection_string\` is borrowed here
4 |     connection_string = String::from("Server=prod");
  |     ^^^^^^^^^^^^^^^^^ \`connection_string\` is assigned to here but it was already borrowed
5 |     println!("connected to {active}");
  |                             ------ borrow later used here`,
      explanation:
        'In C#, reassigning a variable just repoints it; `active` would keep the old string alive and print "Server=dev". In Rust, `active` is not a separate reference to an object; it is a borrow of the variable `connection_string`. Assigning to that variable frees the old String in place, so the borrow would dangle. The fix depends on what you meant: if `active` should be the old value, clone it or move it out first; if it should be the new one, borrow after the assignment.',
    },
  ],
  csharpEquivalent: code`
    var connectionString = "Server=dev";
    var active = connectionString;
    connectionString = "Server=prod";
    Console.WriteLine($"connected to {active}");
  `,
  csharpNote: 'Compiles and prints "connected to Server=dev".',
};
