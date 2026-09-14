import { code, lines } from '../../code.ts';
import type { Lesson } from '../../types.ts';

export const whenNotTo: Lesson = {
  id: 'rc-when-not-to',
  title: 'When Rc<RefCell<T>> is the wrong answer',
  summary: 'Wrapping every node in `Rc<RefCell<T>>` reproduces a C# object graph and its bugs. Indices, a single owner and `&mut` parameters usually fit better.',
  intro: [
    'Most C# developers hit the borrow checker with an object graph, discover that `Rc<RefCell<T>>` makes the errors go away, and start wrapping everything in it. The code compiles, and it has quietly swapped compile-time guarantees for runtime panics, leak-prone cycles, and signatures that say `&self` while mutating.',
    'This is not a rule against `Rc<RefCell<T>>`. GUI widget trees and some caches genuinely need shared mutable ownership. It is a rule against reaching for it first. The usual alternative for graphs is boring and fast: store the nodes in one `Vec`, and refer to them by index.',
  ],
  csharp: {
    filename: 'ServiceGraph.cs',
    code: code`
      public sealed class ServiceNode(string name)
      {
          public string Name { get; } = name;
          public List<ServiceNode> Dependents { get; } = new();
          public bool Degraded { get; set; }
      }

      public sealed class ServiceGraph
      {
          private readonly Dictionary<string, ServiceNode> _nodes = new();

          public ServiceNode Add(string name) => _nodes[name] = new ServiceNode(name);

          public void DependsOn(ServiceNode service, ServiceNode dependency) =>
              dependency.Dependents.Add(service);

          public void MarkOutage(ServiceNode node)
          {
              if (node.Degraded) return;
              node.Degraded = true;
              foreach (var dependent in node.Dependents)
                  MarkOutage(dependent);
          }

          public IEnumerable<string> DegradedNames() =>
              _nodes.Values.Where(n => n.Degraded).Select(n => n.Name);
      }
    `,
  },
  rust: {
    filename: 'service_graph.rs',
    code: code`
      #[derive(Clone, Copy)]
      struct ServiceId(usize);

      struct ServiceNode {
          name: String,
          dependents: Vec<ServiceId>,
          degraded: bool,
      }

      #[derive(Default)]
      struct ServiceGraph {
          nodes: Vec<ServiceNode>,
      }

      impl ServiceGraph {
          fn add(&mut self, name: &str) -> ServiceId {
              self.nodes.push(ServiceNode { name: name.to_string(), dependents: Vec::new(), degraded: false });
              ServiceId(self.nodes.len() - 1)
          }

          fn depends_on(&mut self, service: ServiceId, dependency: ServiceId) {
              self.nodes[dependency.0].dependents.push(service);
          }

          fn mark_outage(&mut self, start: ServiceId) {
              let mut pending = vec![start];
              while let Some(ServiceId(index)) = pending.pop() {
                  let node = &mut self.nodes[index];
                  if node.degraded {
                      continue;
                  }
                  node.degraded = true;
                  pending.extend(node.dependents.iter().copied());
              }
          }

          fn degraded_names(&self) -> impl Iterator<Item = &str> {
              self.nodes.iter().filter(|n| n.degraded).map(|n| n.name.as_str())
          }
      }

      fn main() {
          let mut graph = ServiceGraph::default();
          let db = graph.add("orders-db");
          let api = graph.add("orders-api");
          let storefront = graph.add("storefront");
          let reports = graph.add("reports");
          graph.depends_on(api, db);
          graph.depends_on(storefront, api);
          graph.depends_on(api, storefront);
          graph.depends_on(reports, db);

          graph.mark_outage(api);
          let degraded: Vec<&str> = graph.degraded_names().collect();
          println!("degraded: {degraded:?}");
      }
    `,
    stdout: `degraded: ["orders-api", "storefront"]
`,
  },
  links: [
    {
      csharp: [1, 3, 4, 5],
      rust: lines(1, 8),
      note: 'A node refers to other nodes by `ServiceId`, a `Copy` newtype over `usize`, instead of by pointer. The newtype stops you passing an order index where a service index belongs.',
    },
    {
      csharp: [10],
      rust: lines(10, 13),
      note: 'One owner for every node: the graph. No `Rc`, no `RefCell`, and dropping the graph frees everything, cycles included.',
    },
    {
      csharp: [12],
      rust: lines(16, 19),
      note: 'Adding a node returns its index. The id stays valid for as long as nodes are never removed; see the break points for what to do when they are.',
    },
    {
      csharp: [14, 15],
      rust: lines(21, 23),
      note: 'An edge is a pushed integer. `&mut self` on a method that mutates the graph: the signature now tells the truth.',
    },
    {
      csharp: [17, 18, 19, 20, 21, 22, 23],
      rust: lines(25, 35),
      note: 'The recursion becomes a worklist. Recursing while iterating `self.nodes[i].dependents` would hold a borrow of the graph across a call that needs `&mut self`: E0502. Popping ids off a local `Vec` never overlaps two borrows.',
    },
    {
      csharp: [25, 26],
      rust: lines(37, 39),
      note: 'The query borrows the graph and hands out `&str` slices of node names. LINQ over `_nodes.Values` maps directly onto an iterator chain.',
    },
    {
      csharp: [14, 15],
      rust: [50],
      note: '`orders-api` also depends on `storefront`, so the two form a cycle. With indices it costs nothing. With `Rc<ServiceNode>` in both directions it would leak the pair.',
    },
  ],
  breaks: [
    {
      heading: 'The line-by-line translation compiles. That is the trap.',
      body: [
        'Here is the graph as a C# developer writes it on day three: `Rc<RefCell<ServiceNode>>` everywhere. It runs and prints the right answer. It also leaks the api/storefront cycle (neither of those nodes is ever freed), every `borrow_mut()` is a potential panic that the compiler no longer checks, and `mark_outage` clones the dependents list so that no guard is alive during the recursive calls.',
        'None of those costs show up in a code review of any single function. They show up as a service that panics under a rare request order, or whose memory grows with every graph it builds.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `degraded: ["orders-api", "storefront"]
`,
        code: code`
          use std::cell::RefCell;
          use std::rc::Rc;

          struct ServiceNode {
              name: String,
              dependents: Vec<Rc<RefCell<ServiceNode>>>,
              degraded: bool,
          }

          fn node(name: &str) -> Rc<RefCell<ServiceNode>> {
              Rc::new(RefCell::new(ServiceNode { name: name.to_string(), dependents: Vec::new(), degraded: false }))
          }

          fn mark_outage(node: &Rc<RefCell<ServiceNode>>) {
              if node.borrow().degraded {
                  return;
              }
              node.borrow_mut().degraded = true;
              let dependents = node.borrow().dependents.clone();
              for dependent in &dependents {
                  mark_outage(dependent);
              }
          }

          fn main() {
              let db = node("orders-db");
              let api = node("orders-api");
              let storefront = node("storefront");
              db.borrow_mut().dependents.push(Rc::clone(&api));
              api.borrow_mut().dependents.push(Rc::clone(&storefront));
              storefront.borrow_mut().dependents.push(Rc::clone(&api));

              mark_outage(&api);
              let degraded: Vec<String> = [&db, &api, &storefront]
                  .iter()
                  .filter(|n| n.borrow().degraded)
                  .map(|n| n.borrow().name.clone())
                  .collect();
              println!("degraded: {degraded:?}");
          }
        `,
      },
    },
    {
      heading: 'An index is not a reference, and removal is where that shows',
      body: [
        'A C# reference keeps its target alive. A `ServiceId` does not: if you `swap_remove` a node, the last node moves into its slot, so old ids for the removed service now name a different one, and nothing panics. This is the real cost of the arena approach.',
        'If nodes are only ever added, as in most per-request graphs, parse trees and dependency resolutions, plain indices are perfect. If nodes come and go, use a tombstone flag, or a generational arena such as the `slotmap` crate, whose keys detect that their slot was reused.',
      ],
    },
    {
      heading: 'Recursion over `&mut self` fights you. Let the data leave the borrow first.',
      body: [
        'The direct port of `MarkOutage` iterates a node\'s dependents while calling back into the graph. That holds `&self.nodes` for the loop and needs `&mut self` inside it: E0502, the same rule as mutating a list inside `foreach`. `Rc<RefCell>` would turn this into a runtime panic instead.',
        'The fixes are the arena versions of "finish reading, then write": copy the ids out (they are `Copy`), or use a worklist, as the lesson code does.',
      ],
      code: {
        language: 'rust',
        expect: 'fails',
        code: code`
          struct ServiceNode {
              dependents: Vec<usize>,
              degraded: bool,
          }

          struct ServiceGraph {
              nodes: Vec<ServiceNode>,
          }

          impl ServiceGraph {
              fn mark_outage(&mut self, index: usize) {
                  if self.nodes[index].degraded {
                      return;
                  }
                  self.nodes[index].degraded = true;
                  for dependent in &self.nodes[index].dependents {
                      self.mark_outage(*dependent);
                  }
              }
          }

          fn main() {
              let mut graph = ServiceGraph { nodes: vec![ServiceNode { dependents: vec![], degraded: false }] };
              graph.mark_outage(0);
          }
        `,
      },
    },
    {
      heading: 'Shared services in C# are usually context you can pass as `&mut`',
      body: [
        'Constructor injection makes every dependency a field, so the C# port gives every service an `Rc<RefCell<AuditLog>>`. Most of those services only need the log during one call. Pass it as a parameter instead, and ownership stays in one place: whoever runs the request owns the log and lends it out.',
        'This is how most Rust applications thread a database transaction, a request context or a metrics sink through business logic. The borrow checker verifies it, nothing can panic, and the signature documents which operations write.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `["reserved SKU-42", "charged ORD-1"]
`,
        code: code`
          struct AuditLog {
              entries: Vec<String>,
          }

          struct InventoryService;
          struct PaymentService;

          impl InventoryService {
              fn reserve(&self, sku: &str, audit: &mut AuditLog) {
                  audit.entries.push(format!("reserved {sku}"));
              }
          }

          impl PaymentService {
              fn charge(&self, order_id: &str, audit: &mut AuditLog) {
                  audit.entries.push(format!("charged {order_id}"));
              }
          }

          fn main() {
              let mut audit = AuditLog { entries: Vec::new() };
              InventoryService.reserve("SKU-42", &mut audit);
              PaymentService.charge("ORD-1", &mut audit);
              println!("{:?}", audit.entries);
          }
        `,
      },
    },
    {
      heading: 'Components that only talk to each other can own their state and send messages',
      body: [
        'When two parts of the system are genuinely independent, such as a request handler and a background email sender, sharing a mutable object is the C# habit and `Arc<Mutex<T>>` is its Rust port. The alternative is for one side to own the state and the other to send it messages over a channel, the way you would with `System.Threading.Channels`.',
        'Ownership moves with the message, so there is nothing to lock and nothing to borrow. `std::sync::mpsc` covers threads; async runtimes provide their own channels.',
      ],
      code: {
        language: 'rust',
        expect: 'compiles',
        stdout: `sent 2 emails: ["ORD-1", "ORD-2"]
`,
        code: code`
          use std::sync::mpsc;
          use std::thread;

          fn main() {
              let (sender, receiver) = mpsc::channel::<String>();
              let email_worker = thread::spawn(move || {
                  let mut sent = Vec::new();
                  for order_id in receiver {
                      sent.push(order_id);
                  }
                  sent
              });

              sender.send(String::from("ORD-1")).unwrap();
              sender.send(String::from("ORD-2")).unwrap();
              drop(sender);

              let sent = email_worker.join().unwrap();
              println!("sent {} emails: {sent:?}", sent.len());
          }
        `,
      },
    },
  ],
  visualize: ['rc-borrow-in-loop'],
  drills: ['rc-push-through-rc'],
  takeaways: [
    '`Rc<RefCell<T>>` everywhere is a C# object graph with runtime panics and leaks added.',
    'For graphs, own the nodes in one `Vec` and link them with `Copy` ids.',
    'Shared services usually become `&mut` parameters, a single owner, or a channel.',
  ],
};
