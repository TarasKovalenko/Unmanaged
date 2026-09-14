import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const cyclesAndWeak: Lesson = {
  id: 'rc-cycles-and-weak',
  title: 'Cycles leak, Weak breaks them',
  summary: 'The GC collects object cycles. Reference counting cannot, so back-pointers must be `Weak` and every use of one must handle "already gone".',
  intro: [
    'A category tree where every node knows its parent is a two-line change in C#: add a `Parent` property. The child references the parent, the parent references the child, and when the whole tree becomes unreachable the GC collects it anyway, because it traces from roots and never counts anything.',
    '`Rc` counts. A parent holding an `Rc` to its child and the child holding an `Rc` back to its parent keeps both counts at 1 or more forever, so neither is freed. Rust calls this a leak, and it is not a compile error. The standard fix is to decide which direction owns and make the other direction `Weak`.',
  ],
  csharp: {
    filename: 'Program.cs',
    code: code`
      var root = new Category("catalog");
      var tools = root.AddChild("tools");
      var drills = tools.AddChild("drills");
      Console.WriteLine(drills.Path());

      public sealed class Category(string name)
      {
          public string Name { get; } = name;
          public Category? Parent { get; private set; }
          public List<Category> Children { get; } = new();

          public Category AddChild(string name)
          {
              var child = new Category(name) { Parent = this };
              Children.Add(child);
              return child;
          }

          public string Path() =>
              Parent is null ? Name : $"{Parent.Path()}/{Name}";
      }
    `,
  },
  rust: {
    filename: 'category.rs',
    code: code`
      use std::cell::RefCell;
      use std::rc::{Rc, Weak};

      struct Category {
          name: String,
          parent: Weak<Category>,
          children: RefCell<Vec<Rc<Category>>>,
      }

      impl Category {
          fn root(name: &str) -> Rc<Category> {
              Rc::new(Category { name: name.to_string(), parent: Weak::new(), children: RefCell::default() })
          }

          fn add_child(parent: &Rc<Category>, name: &str) -> Rc<Category> {
              let child = Rc::new(Category {
                  name: name.to_string(),
                  parent: Rc::downgrade(parent),
                  children: RefCell::default(),
              });
              parent.children.borrow_mut().push(Rc::clone(&child));
              child
          }

          fn path(&self) -> String {
              match self.parent.upgrade() {
                  Some(parent) => format!("{}/{}", parent.path(), self.name),
                  None => self.name.clone(),
              }
          }
      }

      impl Drop for Category {
          fn drop(&mut self) {
              println!("freeing {}", self.name);
          }
      }

      fn main() {
          let root = Category::root("catalog");
          let tools = Category::add_child(&root, "tools");
          let drills = Category::add_child(&tools, "drills");
          println!("{}", drills.path());
          println!("tools: strong {}, weak {}", Rc::strong_count(&tools), Rc::weak_count(&tools));
          drop(root);
          println!("{}", drills.path());
      }
    `,
    stdout: `catalog/tools/drills
tools: strong 2, weak 1
freeing catalog
tools/drills
freeing tools
freeing drills
`,
  },
  links: [
    {
      csharp: [9],
      rust: [6],
      note: 'The back-pointer. `Weak<Category>` does not count towards keeping the parent alive, so the parent-child pair is no longer a strong cycle. `Weak::new()` plays the role of `null` for the root.',
    },
    {
      csharp: [10],
      rust: [7],
      note: 'Children are owned: strong `Rc`s pointing down the tree. They sit in a `RefCell` because `add_child` pushes into a parent that is already shared.',
    },
    {
      csharp: [14],
      rust: lines(16, 20),
      note: '`Rc::downgrade(parent)` makes a `Weak` from a strong handle. Because the parent is known when the child is created, the field is set once and needs no `RefCell`.',
    },
    {
      csharp: [15, 16],
      rust: [21, 22],
      note: 'The parent takes a strong handle to the child, and the caller gets another. That is why `tools` reports a strong count of 2.',
    },
    {
      csharp: [19, 20],
      rust: lines(25, 30),
      note: '`upgrade()` turns a `Weak` back into an `Rc`, and returns `Option` because the target may already be freed. C# `Parent` is either null or alive; it can never point at a collected object.',
    },
    {
      csharp: [1, 2, 3],
      rust: lines(40, 42),
      note: 'Same construction. `add_child` is an associated function taking `&Rc<Category>`, since it needs the `Rc` itself (to downgrade it), not the `Category` inside.',
    },
    {
      csharp: [4],
      rust: lines(43, 46),
      note: 'Dropping `root` frees the catalog immediately, even though `drills` can still reach `tools`. The weak edge from `tools` now fails to upgrade, so the path shrinks. In C# holding `drills` would keep the whole chain alive through `Parent`.',
    },
    {
      csharp: [4],
      rust: [47],
      note: 'At the end of `main`, `drills` drops first (count 2 to 1), then `tools` (1 to 0), which frees `tools` and, through its `children` vec, `drills`.',
    },
  ],
  breaks: [
    {
      heading: 'The GC collects cycles. `Rc` leaks them, and the compiler says nothing.',
      body: [
        'Tracing collection starts from roots (statics, stack, handles) and frees whatever it cannot reach, so a `Parent`/`Children` cycle is irrelevant to it. Reference counting frees a value when its count hits zero, and in a cycle each member keeps the next one above zero.',
        'Below, both nodes use strong pointers. After both local handles are dropped, the `Weak` observer shows the parent still has one owner (the child), and no `freeing` line is printed: the destructors never run. This is memory-safe, and it is still a leak.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `strong count after dropping both handles: 1
`,
        code: code`
          use std::cell::RefCell;
          use std::rc::Rc;

          struct Category {
              name: String,
              parent: RefCell<Option<Rc<Category>>>,
              children: RefCell<Vec<Rc<Category>>>,
          }

          impl Drop for Category {
              fn drop(&mut self) {
                  println!("freeing {}", self.name);
              }
          }

          fn main() {
              let root = Rc::new(Category { name: "catalog".into(), parent: RefCell::new(None), children: RefCell::default() });
              let tools = Rc::new(Category { name: "tools".into(), parent: RefCell::new(None), children: RefCell::default() });
              *tools.parent.borrow_mut() = Some(Rc::clone(&root));
              root.children.borrow_mut().push(Rc::clone(&tools));

              let observer = Rc::downgrade(&root);
              drop(root);
              drop(tools);
              println!("strong count after dropping both handles: {}", observer.strong_count());
          }
        `,
      },
    },
    {
      heading: 'A C# reference is never dangling. A `Weak` can be, so every use is an `Option`.',
      body: [
        'Upgrading a `Weak` is a question, not a dereference: "is anyone still owning this?" You have to handle `None`, which forces a decision C# lets you skip, such as what `Path()` means for an orphaned node.',
        'Hold the upgraded `Rc` only as long as you need it. Storing it in a field turns the weak edge back into a strong one, and the cycle with it.',
      ],
    },
    {
      heading: 'C# events leak subscribers. Weak subscriber lists leak nothing.',
      body: [
        'A C# `event` keeps a strong reference to every handler target, so a short-lived view model subscribed to a long-lived service stays alive until it unsubscribes. That is the classic WPF memory leak, and why `WeakEventManager` exists.',
        'In Rust the idiomatic publisher holds `Weak` handles to subscribers, upgrades each one when publishing, and prunes the ones that are gone with `retain`. Dropping a subscriber is its unsubscribe.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `dashboard saw ORD-1
email saw ORD-1
email saw ORD-2
subscribers left: 1
`,
        code: code`
          use std::rc::{Rc, Weak};

          struct Subscriber {
              name: &'static str,
          }

          #[derive(Default)]
          struct OrderEvents {
              subscribers: Vec<Weak<Subscriber>>,
          }

          impl OrderEvents {
              fn subscribe(&mut self, subscriber: &Rc<Subscriber>) {
                  self.subscribers.push(Rc::downgrade(subscriber));
              }

              fn publish(&mut self, order_id: &str) {
                  self.subscribers.retain(|weak| match weak.upgrade() {
                      Some(subscriber) => {
                          println!("{} saw {order_id}", subscriber.name);
                          true
                      }
                      None => false,
                  });
              }
          }

          fn main() {
              let mut events = OrderEvents::default();
              let dashboard = Rc::new(Subscriber { name: "dashboard" });
              let email = Rc::new(Subscriber { name: "email" });
              events.subscribe(&dashboard);
              events.subscribe(&email);
              events.publish("ORD-1");
              drop(dashboard);
              events.publish("ORD-2");
              println!("subscribers left: {}", events.subscribers.len());
          }
        `,
      },
    },
    {
      heading: 'Leaking is safe Rust, so `Drop` is not a guarantee',
      body: [
        'Rust promises memory safety, not the absence of leaks. `Rc` cycles, `std::mem::forget` and `Box::leak` are all safe code. A type cannot rely on its destructor running, much as a C# finalizer is not guaranteed to run.',
        'In practice: do not put the only flush of a write buffer, or the only release of a distributed lock, in `Drop` on something that lives inside an `Rc` graph. Make it an explicit method, like `DisposeAsync`, and treat `Drop` as a backstop.',
      ],
    },
  ],
  visualize: [],
  takeaways: [
    'Ownership in an `Rc` graph must be a tree: strong edges point one way, `Weak` edges point back.',
    '`upgrade()` returns `Option`. A weak target can already be gone, which a C# reference never is.',
    'A leak is not a compile error. If destructors never print, look for a strong cycle.',
  ],
};
