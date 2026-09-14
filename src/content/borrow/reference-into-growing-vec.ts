import { code } from '../code.ts';
import type { BorrowSnippet } from '../types.ts';

export const referenceIntoGrowingVec: BorrowSnippet = {
  id: 'reference-into-growing-vec',
  title: 'Holding a reference while the Vec grows',
  summary: 'Fine in C#. In Rust, `&queue[0]` points into a buffer that `push` may reallocate.',
  pairedWith: 'borrow-ends-at-last-use',
  variables: ['queue'],
  code: code`
    fn main() {
        let mut queue = vec![String::from("build"), String::from("test")];
        let next = &queue[0];
        queue.push(String::from("deploy"));
        println!("next up: {next}");
    }
  `,
  spans: [
    { variable: 'queue', kind: 'dropped', startLine: 2, endLine: 6, label: 'owns the Vec and both Strings' },
    { variable: 'queue', kind: 'borrow', startLine: 3, endLine: 5, label: 'next = &queue[0], still used on line 5' },
    { variable: 'queue', kind: 'borrow_mut', startLine: 4, endLine: 4, label: 'push needs &mut queue and may move every element' },
  ],
  conflicts: [
    {
      spans: [1, 2],
      errorCode: 'E0502',
      message: `error[E0502]: cannot borrow \`queue\` as mutable because it is also borrowed as immutable
 --> src/main.rs:4:5
  |
3 |     let next = &queue[0];
  |                 ----- immutable borrow occurs here
4 |     queue.push(String::from("deploy"));
  |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ mutable borrow occurs here
5 |     println!("next up: {next}");
  |                         ---- immutable borrow later used here`,
      explanation:
        'In C#, `var next = queue[0];` copies a reference to a string object that lives independently on the heap. When `List<T>` grows, it copies references into a new array and the string stays where it was. In Rust, `&queue[0]` is a pointer into the Vec\'s own buffer, where the String is stored inline. If `push` reallocates, that pointer dangles. The borrow checker rejects any mutation while that pointer is alive.',
    },
  ],
  csharpEquivalent: code`
    var queue = new List<string> { "build", "test" };
    var next = queue[0];
    queue.Add("deploy");
    Console.WriteLine($"next up: {next}");
  `,
  csharpNote: 'Compiles and prints "next up: build". The closest C# analogue that would break is holding a Span<T> from CollectionsMarshal.AsSpan across an Add.',
};
