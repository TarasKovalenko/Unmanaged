import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const dropOrder: BorrowSnippet = {
  id: 'drop-order',
  title: 'Drop follows ownership',
  summary: 'Every scope disposes what it still owns. Moving a value moves the obligation to clean it up.',
  variables: ['primary', 'replica', 'pooled'],
  code: code`
    struct Connection {
        name: &'static str,
    }

    impl Drop for Connection {
        fn drop(&mut self) {
            println!("closing {}", self.name);
        }
    }

    fn main() {
        let primary = Connection { name: "primary" };
        {
            let replica = Connection { name: "replica" };
            println!("using {} and {}", primary.name, replica.name);
        }
        let pooled = primary;
        println!("handed {} to the pool", pooled.name);
    }
  `,
  spans: [
    { variable: 'primary', kind: 'moved', startLine: 12, endLine: 17, label: 'moved into pooled on line 17; main will not drop it under this name' },
    { variable: 'primary', kind: 'borrow', startLine: 15, endLine: 15, label: 'println! borrows primary.name' },
    { variable: 'replica', kind: 'dropped', startLine: 14, endLine: 16, label: 'Drop runs at the closing brace: prints "closing replica"' },
    { variable: 'replica', kind: 'borrow', startLine: 15, endLine: 15, label: 'println! borrows replica.name' },
    { variable: 'pooled', kind: 'dropped', startLine: 17, endLine: 19, label: 'Drop runs at the end of main: prints "closing primary", exactly once' },
    { variable: 'pooled', kind: 'borrow', startLine: 18, endLine: 18, label: 'println! borrows pooled.name' },
  ],
  conflicts: [],
  takeaway:
    'Output: "using primary and replica", "closing replica", "handed primary to the pool", "closing primary". No `using`, no forgotten `Dispose`, no double dispose. The C# version with `using var primary` would dispose the connection at the end of scope even though it was handed to the pool.',
  csharpEquivalent: code`
    using var primary = new Connection("primary");
    {
        using var replica = new Connection("replica");
        Console.WriteLine($"using {primary.Name} and {replica.Name}");
    }
    var pooled = primary;
    Console.WriteLine($"handed {pooled.Name} to the pool");
  `,
  csharpNote: 'Compiles. primary is disposed at the end of the method even though the pool now holds it. Leave off using and nothing is disposed at all.',
};
