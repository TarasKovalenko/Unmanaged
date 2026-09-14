// One-line summaries for the error index. Codes that appear in content but
// are missing here still get a page; they just show no summary.

export interface ErrorCodeInfo {
  title: string;
  /** Plain-English, C#-framed, one or two sentences. */
  gist: string;
}

export const errorCodes: Record<string, ErrorCodeInfo> = {
  E0004: { title: 'Non-exhaustive patterns', gist: 'A `match` does not handle every possible value. C# `switch` warns; Rust refuses to compile.' },
  E0061: { title: 'Wrong number of arguments', gist: 'No default or optional parameters exist, so every argument must be passed.' },
  E0072: { title: 'Recursive type has infinite size', gist: 'A struct or enum contains itself by value. Add indirection with `Box`, `Vec` or `Rc`.' },
  E0106: { title: 'Missing lifetime specifier', gist: 'A returned or stored reference could come from more than one place, and the compiler needs you to say which.' },
  E0204: { title: 'Cannot derive Copy', gist: 'A field owns heap memory (like `String`), so the type cannot be copied bit for bit.' },
  E0277: { title: 'Trait bound not satisfied', gist: 'A type is used somewhere that requires a trait it does not implement. The "required by a bound" note says where.' },
  E0308: { title: 'Mismatched types', gist: 'No implicit conversions: `&String` is not `String`, `i32` is not `i64`, and a trailing semicolon turns a value into `()`.' },
  E0369: { title: 'Binary operator not supported', gist: 'An operator like `==` or `+` needs a trait impl (`PartialEq`, `Add`); nothing is provided by default.' },
  E0373: { title: 'Closure may outlive borrowed value', gist: 'A closure that runs later (a thread, a task) borrows a local. Use `move` to give it ownership.' },
  E0382: { title: 'Use of moved value', gist: 'The value was moved to another owner and the old name is dead. The most common error for C# developers.' },
  E0428: { title: 'Name defined multiple times', gist: 'There is no overloading: two functions with the same name in one scope is an error.' },
  E0499: { title: 'Two mutable borrows at once', gist: 'Only one `&mut` to a value may be alive at a time, even when you know the borrows touch different parts.' },
  E0502: { title: 'Mutable borrow while shared borrow is alive', gist: 'Something is reading the value (a reference, an iterator) while something else tries to change it.' },
  E0505: { title: 'Move out while borrowed', gist: 'A value is moved away while a reference to it is still going to be used.' },
  E0506: { title: 'Assign to borrowed value', gist: 'Assigning replaces (and drops) the old value, but a reference to the old value is still in use.' },
  E0507: { title: 'Cannot move out of borrowed content', gist: 'Taking ownership of something you only have a reference to: indexing a Vec, a field behind `&self`, `unwrap` on `&Option`.' },
  E0515: { title: 'Returns a reference to a local', gist: 'The local is freed when the function returns, so the reference would dangle. Return the owned value instead.' },
  E0596: { title: 'Cannot borrow as mutable', gist: 'The binding is not `mut`, or you only have a shared reference (including through `Rc`).' },
  E0597: { title: 'Borrowed value does not live long enough', gist: 'A reference is used after its owner has been dropped at the end of a scope.' },
  E0599: { title: 'No method found', gist: 'The method does not exist for this type, or it comes from a trait that is not implemented or not imported.' },
  E0616: { title: 'Field is private', gist: 'Fields are private to their module by default, not public or internal.' },
  E0716: { title: 'Temporary dropped while borrowed', gist: 'A reference into a temporary value outlives the statement that created it. Bind the temporary to a variable.' },
  E0733: { title: 'Recursion in async fn requires boxing', gist: 'An async fn compiles to a state machine that would contain itself. Return a boxed future (`Box::pin`) for the recursive call.' },
  E0728: { title: 'await outside async', gist: '`.await` is only allowed inside `async fn` or `async` blocks.' },
  panic: { title: 'Runtime panic', gist: 'The program compiled and then stopped: `unwrap` on `None`, an out-of-bounds index, overflow in debug, or a `RefCell` borrow conflict. Not an exception you catch.' },
};
