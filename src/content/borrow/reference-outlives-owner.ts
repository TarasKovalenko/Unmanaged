import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const referenceOutlivesOwner: BorrowSnippet = {
  id: 'reference-outlives-owner',
  title: 'A slice that outlives its String',
  summary: '`split` returns views into the original buffer. The buffer dies at the closing brace; the view is used after.',
  pairedWith: 'return-owned-value',
  variables: ['request'],
  code: code`
    fn main() {
        let route;
        {
            let request = String::from("GET /orders/42");
            route = request.split(' ').nth(1).unwrap();
        }
        println!("routing {route}");
    }
  `,
  spans: [
    { variable: 'request', kind: 'dropped', startLine: 4, endLine: 6, label: 'owns the buffer; freed at the closing brace on line 6' },
    { variable: 'request', kind: 'borrow', startLine: 5, endLine: 7, label: 'route is a &str into request, used on line 7' },
  ],
  conflicts: [
    {
      spans: [1, 0],
      errorCode: 'E0597',
      message: `error[E0597]: \`request\` does not live long enough
 --> src/main.rs:5:17
  |
4 |         let request = String::from("GET /orders/42");
  |             ------- binding \`request\` declared here
5 |         route = request.split(' ').nth(1).unwrap();
  |                 ^^^^^^^ borrowed value does not live long enough
6 |     }
  |     - \`request\` dropped here while still borrowed
7 |     println!("routing {route}");
  |                        ----- borrow later used here`,
      explanation:
        'C#\'s `Split` allocates new strings, and the GC keeps anything reachable alive, so a reference can never outlive its object. Rust\'s `split` allocates nothing: `route` is a pointer and length into `request`\'s buffer. That buffer is freed on line 6, and `route` is read on line 7. The bar on the right runs past the end of the owner\'s bar; that is what "does not live long enough" means.',
    },
  ],
  csharpEquivalent: code`
    string route;
    {
        var request = "GET /orders/42";
        route = request.Split(' ')[1];
    }
    Console.WriteLine($"routing {route}");
  `,
  csharpNote: 'Compiles. The one place C# enforces the Rust rule is ref structs: return a ReadOnlySpan<char> over a stackalloc buffer and you get CS8352.',
};
