import { code } from '../../code.ts';
import type { BorrowSnippet } from '../../types.ts';

export const snippets: BorrowSnippet[] = [
  {
    id: 'refcell-double-borrow',
    title: 'The same rule, checked at runtime',
    summary: '`RefCell` lets you mutate through a shared handle, and panics when a shared and a mutable borrow overlap.',
    variables: ['cart'],
    code: code`
      use std::cell::RefCell;

      fn main() {
          let cart = RefCell::new(vec![String::from("SKU-1")]);
          let items = cart.borrow();
          cart.borrow_mut().push(String::from("SKU-2"));
          println!("{} items", items.len());
      }
    `,
    spans: [
      { variable: 'cart', kind: 'dropped', startLine: 4, endLine: 8, label: 'owns the RefCell and the Vec inside it' },
      {
        variable: 'cart',
        kind: 'borrow',
        checked: 'runtime',
        startLine: 5,
        endLine: 8,
        label: 'items holds a Ref guard; it lasts until the guard is dropped at the end of main, not until its last use',
      },
      { variable: 'cart', kind: 'borrow_mut', checked: 'runtime', startLine: 6, endLine: 6, label: 'borrow_mut() finds a live Ref and panics' },
    ],
    conflicts: [
      {
        spans: [1, 2],
        errorCode: 'panic',
        phase: 'runtime',
        message: `thread 'main' panicked at src/main.rs:6:10:
RefCell already borrowed`,
        explanation:
          'This compiles: `borrow()` and `borrow_mut()` both take `&self`, so the compiler sees nothing wrong. `RefCell` keeps a borrow counter and enforces the shared-XOR-mutable rule when the program runs, the way `List<T>`\'s enumerator checks its version number. The difference from compile-time borrows: a `Ref` guard is a value with `Drop`, so it lives until the end of its scope. Ending the scope early (or calling `drop(items)`) before `borrow_mut` fixes it.',
      },
    ],
  },
  {
    id: 'rc-borrow-in-loop',
    title: 'A Ref guard that outlives the loop header',
    summary: 'A `for` loop over `cell.borrow().iter()` keeps the guard alive for every iteration, so a method that calls `borrow_mut()` panics.',
    pairedWith: 'rc-guard-scoped',
    variables: ['cart'],
    code: code`
      use std::cell::RefCell;

      struct Cart {
          items: RefCell<Vec<u32>>,
      }

      impl Cart {
          fn add_free_gift(&self) {
              self.items.borrow_mut().push(0);
          }
      }

      fn main() {
          let cart = Cart { items: RefCell::new(vec![1500, 4200]) };
          for price in cart.items.borrow().iter() {
              if *price > 4000 {
                  cart.add_free_gift();
              }
          }
          println!("{} items", cart.items.borrow().len());
      }
    `,
    spans: [
      { variable: 'cart', kind: 'dropped', startLine: 14, endLine: 21, label: 'owns the Cart and the RefCell inside it' },
      {
        variable: 'cart',
        kind: 'borrow',
        checked: 'runtime',
        startLine: 15,
        endLine: 19,
        label: 'the Ref from cart.items.borrow() is a temporary in the loop header; it lives until the loop ends',
      },
      {
        variable: 'cart',
        kind: 'borrow_mut',
        checked: 'runtime',
        startLine: 17,
        endLine: 17,
        label: 'add_free_gift() calls borrow_mut() on line 9 while the Ref is alive',
      },
    ],
    conflicts: [
      {
        spans: [1, 2],
        errorCode: 'panic',
        phase: 'runtime',
        message: `thread 'main' panicked at src/main.rs:9:20:
RefCell already borrowed`,
        explanation:
          'The C# version of this is `foreach` over a `List<T>` that a helper method appends to, and it throws `InvalidOperationException` on the next `MoveNext`. Here the compiler cannot help: `add_free_gift` takes `&self`, so from the outside it looks read-only. The mutable borrow is hidden inside the method, and the shared one is hidden in a temporary that the `for` loop keeps alive until its closing brace. Neither line looks wrong on its own, which is exactly why `RefCell` bugs survive code review.',
      },
    ],
    csharpEquivalent: code`
      foreach (var price in cart.Items)
      {
          if (price > 4000)
              cart.AddFreeGift(); // Items.Add(0) inside
      }
    `,
    csharpNote: 'Compiles. Throws InvalidOperationException ("Collection was modified") on the next iteration.',
  },
  {
    id: 'rc-guard-scoped',
    title: 'Finish reading, drop the guard, then write',
    summary: 'Computing what you need in one statement drops the `Ref` at the semicolon, so the later `borrow_mut()` finds the cell free.',
    pairedWith: 'rc-borrow-in-loop',
    variables: ['cart'],
    code: code`
      use std::cell::RefCell;

      struct Cart {
          items: RefCell<Vec<u32>>,
      }

      impl Cart {
          fn add_free_gift(&self) {
              self.items.borrow_mut().push(0);
          }
      }

      fn main() {
          let cart = Cart { items: RefCell::new(vec![1500, 4200]) };
          let gifts = cart.items.borrow().iter().filter(|price| **price > 4000).count();
          for _ in 0..gifts {
              cart.add_free_gift();
          }
          println!("{} items", cart.items.borrow().len());
      }
    `,
    spans: [
      { variable: 'cart', kind: 'dropped', startLine: 14, endLine: 20, label: 'owns the Cart and the RefCell inside it' },
      {
        variable: 'cart',
        kind: 'borrow',
        checked: 'runtime',
        startLine: 15,
        endLine: 15,
        label: 'the Ref is a temporary; it is dropped at the end of this statement, and only the count survives',
      },
      {
        variable: 'cart',
        kind: 'borrow_mut',
        checked: 'runtime',
        startLine: 17,
        endLine: 17,
        label: 'add_free_gift() borrows mutably on line 9; no guard is alive, so it succeeds',
      },
      { variable: 'cart', kind: 'borrow', checked: 'runtime', startLine: 19, endLine: 19, label: 'a fresh Ref for len(), dropped at the semicolon' },
    ],
    conflicts: [],
    takeaway:
      'With `RefCell`, where a guard dies is decided by scope and temporaries, not by last use. Pull the data you need out in one statement (a count, a clone, a list of ids), let the guard drop, and only then call anything that might mutate.',
  },
  {
    id: 'rc-vec-push',
    title: 'Rc shares a value, it does not let you change it',
    summary: '`Rc<Vec<T>>` derefs to `&Vec<T>` only, so `push` is rejected no matter how the handle is declared.',
    variables: ['tags', 'shared'],
    code: code`
      use std::rc::Rc;

      fn main() {
          let tags = Rc::new(vec![String::from("priority")]);
          let shared = Rc::clone(&tags);
          tags.push(String::from("gift"));
          println!("{} tags, {} owners", shared.len(), Rc::strong_count(&shared));
      }
    `,
    spans: [
      { variable: 'tags', kind: 'dropped', startLine: 4, endLine: 8, label: 'one Rc handle; the Vec lives in a shared heap allocation' },
      { variable: 'shared', kind: 'dropped', startLine: 5, endLine: 8, label: 'Rc::clone bumps the count to 2; same Vec, second owner' },
      { variable: 'tags', kind: 'borrow_mut', startLine: 6, endLine: 6, label: 'push needs &mut Vec, but Rc only hands out &Vec' },
    ],
    conflicts: [
      {
        spans: [1, 2],
        errorCode: 'E0596',
        message: `error[E0596]: cannot borrow data in an \`Rc\` as mutable
 --> src/main.rs:6:5
  |
6 |     tags.push(String::from("gift"));
  |     ^^^^ cannot borrow as mutable
  |
  = help: trait \`DerefMut\` is required to modify through a dereference, but it is not implemented for \`Rc<Vec<String>>\``,
        explanation:
          'In C#, two fields pointing at the same `List<string>` can both call `Add`; the GC tracks the object, and nobody tracks who is writing. `Rc` gives you the shared ownership half of that, but not the mutation half. Two owners of one `Vec` means `&mut` could never be exclusive, so `Rc` only implements `Deref`, never `DerefMut`. Writing `let mut tags` does not help: that makes the handle reassignable, not the `Vec` behind it. Mutation needs `Rc<RefCell<Vec<_>>>`, or `Rc::make_mut` if copy-on-write is what you want, or (usually) a single owner.',
      },
    ],
    csharpEquivalent: code`
      var tags = new List<string> { "priority" };
      var shared = tags;
      tags.Add("gift");
      Console.WriteLine($"{shared.Count} tags");
    `,
    csharpNote: 'Compiles and prints "2 tags". Both variables are references to one mutable list.',
  },
];
