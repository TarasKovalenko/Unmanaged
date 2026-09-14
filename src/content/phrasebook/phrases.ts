import { code } from '../code.ts';
import type { Phrase } from '../types.ts';

export const phrases: Phrase[] = [
  // ---------------------------------------------------------------------------
  // types
  // ---------------------------------------------------------------------------
  {
    id: 'p-var-let',
    category: 'types',
    csharp: code`var count = orders.Count;`,
    rust: code`
      let count = orders.len();
      let mut retries = 0;
    `,
    note: 'Both infer the type, but `let` is immutable by default: reassigning needs `let mut`. C# has no readonly local, so the default is inverted.',
    fit: 'close',
  },
  {
    id: 'p-const',
    category: 'types',
    csharp: code`const int MaxRetries = 3;`,
    rust: code`const MAX_RETRIES: u32 = 3;`,
    note: 'Compile-time constant, inlined at each use. The type annotation is mandatory and the naming convention is SCREAMING_SNAKE_CASE.',
    fit: 'direct',
  },
  {
    id: 'p-static-readonly',
    category: 'types',
    csharp: code`static readonly Regex SkuPattern = new(@"^[A-Z]{3}-\d+$");`,
    rust: code`
      static SKU_PATTERN: LazyLock<Regex> =
          LazyLock::new(|| Regex::new(r"^[A-Z]{3}-\d+$").unwrap());
    `,
    note: 'A `static` must be initialised by a constant expression, so anything needing runtime work goes through `std::sync::LazyLock` (the equivalent of a static constructor). Mutable statics need a `Mutex` or atomics.',
    fit: 'close',
  },
  {
    id: 'p-record',
    category: 'types',
    csharp: code`public record Money(decimal Amount, string Currency);`,
    rust: code`
      #[derive(Debug, Clone, PartialEq)]
      struct Money { amount_cents: i64, currency: String }
    `,
    note: 'Value equality, `Debug` printing and copying are opt-in derives instead of compiler-generated members. There is no positional constructor or deconstruct; you write a struct literal or a `new` function.',
    fit: 'close',
  },
  {
    id: 'p-with-expression',
    category: 'types',
    csharp: code`var shipped = order with { Status = OrderStatus.Shipped };`,
    rust: code`let shipped = Order { status: OrderStatus::Shipped, ..order };`,
    note: 'Struct update syntax fills the remaining fields from `order`, but it **moves** any non-`Copy` fields out of it, so `order` may be unusable afterwards. Use `..order.clone()` if you still need the original.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'moves' },
  },
  {
    id: 'p-enum',
    category: 'types',
    csharp: code`enum OrderStatus { Pending, Paid, Shipped }`,
    rust: code`
      #[derive(Debug, Clone, Copy, PartialEq, Eq)]
      enum OrderStatus { Pending, Paid, Shipped }
    `,
    note: 'Rust enums are closed: there is no `(OrderStatus)42` producing an undeclared value, and `match` must cover every variant. Converting to an integer with `as i32` works; converting back requires your own `TryFrom`.',
    fit: 'close',
  },
  {
    id: 'p-discriminated-union',
    category: 'types',
    csharp: code`
      abstract record Payment;
      record Card(string Last4) : Payment;
      record Invoice(string PoNumber) : Payment;
    `,
    rust: code`
      enum Payment {
          Card { last4: String },
          Invoice { po_number: String },
      }
    `,
    note: 'C# approximates sum types with a record hierarchy that anyone can extend. A Rust enum is a real closed union, stored inline, and the compiler rejects a `match` that forgets a variant.',
    fit: 'different',
  },
  {
    id: 'p-struct',
    category: 'types',
    csharp: code`public readonly record struct GeoPoint(double Lat, double Lon);`,
    rust: code`
      #[derive(Debug, Clone, Copy, PartialEq)]
      struct GeoPoint { lat: f64, lon: f64 }
    `,
    note: 'Every Rust struct is a value type; there is no class/struct split. Whether it is copied implicitly is decided by `Copy`, and whether it lives on the heap is decided by the container (`Box`, `Vec`), not the declaration.',
    fit: 'close',
  },
  {
    id: 'p-tuple',
    category: 'types',
    csharp: code`
      (int Min, int Max) Bounds(int[] xs) => (xs.Min(), xs.Max());
      var (min, max) = Bounds(values);
    `,
    rust: code`
      fn bounds(xs: &[i32]) -> (i32, i32) { /* ... */ }
      let (min, max) = bounds(&values);
    `,
    note: 'Destructuring works the same way. Tuple elements have no names (`.0`, `.1`), so once a tuple crosses a module boundary a small struct is usually clearer.',
    fit: 'close',
  },
  {
    id: 'p-nullable',
    category: 'types',
    csharp: code`string? middleName = null;`,
    rust: code`let middle_name: Option<String> = None;`,
    note: 'Nullable reference types are warnings over a runtime that still allows null. `Option` is an ordinary enum: you cannot call a `String` method on an `Option<String>` without handling `None` first.',
    fit: 'different',
  },
  {
    id: 'p-null-conditional',
    category: 'types',
    csharp: code`var city = customer?.Address?.City;`,
    rust: code`
      // inside a fn returning Option<&str>
      let city = customer?.address.as_ref()?.city.as_str();
    `,
    note: 'The `?` operator on `Option` returns `None` from the **whole function**, not only from the expression. For an inline chain use `customer.and_then(|c| c.address.as_ref()).map(|a| a.city.as_str())`.',
    fit: 'close',
  },
  {
    id: 'p-null-coalescing',
    category: 'types',
    csharp: code`var name = displayName ?? "anonymous";`,
    rust: code`let name = display_name.as_deref().unwrap_or("anonymous");`,
    note: '`unwrap_or` evaluates its argument eagerly; use `unwrap_or_else(|| ...)` when the fallback is expensive. `as_deref` turns `Option<String>` into `Option<&str>` so the fallback can be a literal.',
    fit: 'close',
  },
  {
    id: 'p-generic-constraint',
    category: 'types',
    csharp: code`T Largest<T>(IEnumerable<T> items) where T : IComparable<T>`,
    rust: code`fn largest<T: Ord>(items: impl IntoIterator<Item = T>) -> Option<T>`,
    note: 'Bounds look like `where` clauses, but generics are monomorphised: each concrete `T` gets its own compiled copy, and the body may only use what the bounds allow. There is no `default(T)` escape hatch unless you add `T: Default`.',
    fit: 'close',
  },
  {
    id: 'p-interface-trait',
    category: 'types',
    csharp: code`
      interface IClock { DateTimeOffset UtcNow(); }
      class SystemClock : IClock { ... }
    `,
    rust: code`
      trait Clock { fn now(&self) -> SystemTime; }
      impl Clock for SystemClock { fn now(&self) -> SystemTime { SystemTime::now() } }
    `,
    note: 'Implementations live in a separate `impl` block and can be added to types you do not own. Traits cannot declare fields, and you choose static dispatch (`impl Clock`) or dynamic dispatch (`&dyn Clock`) at the use site.',
    fit: 'close',
  },
  {
    id: 'p-extension-method',
    category: 'types',
    csharp: code`
      static class StringExt {
          public static bool IsBlank(this string s) => string.IsNullOrWhiteSpace(s);
      }
    `,
    rust: code`
      trait IsBlank { fn is_blank(&self) -> bool; }
      impl IsBlank for str { fn is_blank(&self) -> bool { self.trim().is_empty() } }
    `,
    note: 'An extension trait is the idiom, and like a `using` for extension methods, callers must `use` the trait to see the method. The orphan rule forbids implementing a foreign trait for a foreign type.',
    fit: 'close',
  },
  {
    id: 'p-abstract-class',
    category: 'types',
    csharp: code`
      abstract class ReportExporter {
          protected abstract string FormatRow(Row row);
          public string Export(IEnumerable<Row> rows) => string.Join("\n", rows.Select(FormatRow));
      }
    `,
    rust: code`
      trait ReportExporter {
          fn format_row(&self, row: &Row) -> String;
          fn export(&self, rows: &[Row]) -> String {
              rows.iter().map(|r| self.format_row(r)).collect::<Vec<_>>().join("\n")
          }
      }
    `,
    note: 'Default trait methods cover the template-method pattern. What does not carry over is shared state: a trait has no fields or constructor, so common data goes in a struct that the implementors contain.',
    fit: 'different',
  },
  {
    id: 'p-default-value',
    category: 'types',
    csharp: code`var settings = new RetrySettings(); // field defaults`,
    rust: code`
      #[derive(Default)]
      struct RetrySettings { max_attempts: u32, jitter: bool }
      let settings = RetrySettings::default();
    `,
    note: '`#[derive(Default)]` uses each field type default (0, false, empty). Custom defaults need a hand-written `impl Default`; there are no field initialisers.',
    fit: 'close',
  },
  {
    id: 'p-numeric-cast',
    category: 'types',
    csharp: code`int small = checked((int)bigLong);`,
    rust: code`
      let small = i32::try_from(big_long)?;   // checked
      let wrapped = big_long as i32;          // silently truncates
    `,
    note: '`as` behaves like an unchecked C# cast and never fails. `TryFrom` is the equivalent of `checked(...)`, returning a `Result` instead of throwing `OverflowException`.',
    fit: 'close',
  },
  {
    id: 'p-decimal',
    category: 'types',
    csharp: code`decimal total = 19.99m * quantity;`,
    rust: code`
      let total_cents: i64 = 1999 * quantity;
      // or rust_decimal::Decimal from crates.io
    `,
    note: 'The standard library has no decimal type. Money is usually integer minor units, or the `rust_decimal` crate when you need scale and rounding modes.',
    fit: 'different',
  },
  {
    id: 'p-object-any',
    category: 'types',
    csharp: code`
      object payload = GetPayload();
      if (payload is Invoice inv) { ... }
    `,
    rust: code`
      let payload: Box<dyn Any> = get_payload();
      if let Some(inv) = payload.downcast_ref::<Invoice>() { ... }
    `,
    note: '`dyn Any` exists but is rare, because there is no universal base type and no reflection. The idiomatic answer to an open-ended payload is an enum of the cases you actually handle.',
    fit: 'different',
  },

  // ---------------------------------------------------------------------------
  // collections
  // ---------------------------------------------------------------------------
  {
    id: 'p-list',
    category: 'collections',
    csharp: code`
      var skus = new List<string>();
      skus.Add("SKU-1");
    `,
    rust: code`
      let mut skus = Vec::new();
      skus.push(String::from("SKU-1"));
    `,
    note: '`Vec<T>` is `List<T>`: contiguous, growable, amortised push. The binding must be `mut` to push, and pushing while holding a reference into the Vec is a compile error rather than an `InvalidOperationException`.',
    fit: 'direct',
    seeAlso: { kind: 'lesson', id: 'aliasing' },
  },
  {
    id: 'p-collection-initializer',
    category: 'collections',
    csharp: code`int[] retryDelays = [100, 250, 1000];`,
    rust: code`let retry_delays = vec![100, 250, 1000];`,
    note: '`vec![]` builds a heap `Vec`, which can grow where a C# array cannot; `[100, 250, 1000]` without the macro is a fixed-size array on the stack, closer to `int[]` in that respect.',
    fit: 'close',
  },
  {
    id: 'p-dictionary',
    category: 'collections',
    csharp: code`
      var stock = new Dictionary<string, int>();
      stock["SKU-1"] = 5;
    `,
    rust: code`
      let mut stock = HashMap::new();
      stock.insert("SKU-1".to_string(), 5);
    `,
    note: 'You cannot assign through the index operator, and reading `stock["SKU-9"]` panics when the key is missing (like `KeyNotFoundException`, but not catchable). Iteration order is randomised per process.',
    fit: 'close',
  },
  {
    id: 'p-trygetvalue',
    category: 'collections',
    csharp: code`if (stock.TryGetValue(sku, out var qty)) Reserve(sku, qty);`,
    rust: code`if let Some(&qty) = stock.get(sku) { reserve(sku, qty); }`,
    note: '`get` returns `Option<&V>`, a borrow into the map. While that reference is alive you cannot insert into or remove from the map; copy or clone the value out if you need to mutate.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'aliasing' },
  },
  {
    id: 'p-dictionary-upsert',
    category: 'collections',
    csharp: code`hits[path] = hits.GetValueOrDefault(path) + 1;`,
    rust: code`*hits.entry(path).or_insert(0) += 1;`,
    note: 'The entry API does one hash lookup and hands back `&mut V`. It needs an owned key even when the entry exists, so hot loops over `String` keys sometimes use `get_mut` first.',
    fit: 'close',
  },
  {
    id: 'p-hashset',
    category: 'collections',
    csharp: code`
      var seen = new HashSet<string>();
      if (!seen.Add(orderId)) continue;
    `,
    rust: code`
      let mut seen = HashSet::new();
      if !seen.insert(order_id) { continue; }
    `,
    note: '`insert` returns `false` for duplicates, same as `Add`. Element types need `Eq + Hash`, usually derived.',
    fit: 'direct',
  },
  {
    id: 'p-array',
    category: 'collections',
    csharp: code`var buffer = new byte[size];`,
    rust: code`
      let buffer = vec![0u8; size];      // runtime size
      let header = [0u8; 16];            // compile-time size, on the stack
    `,
    note: 'C# arrays are always heap objects with a runtime length. Rust arrays `[T; N]` carry the length in the type, so a runtime-sized buffer is a `Vec` (or `Box<[T]>`).',
    fit: 'close',
  },
  {
    id: 'p-span',
    category: 'collections',
    csharp: code`ReadOnlySpan<byte> magic = data.AsSpan(0, 4);`,
    rust: code`let magic: &[u8] = &data[0..4];`,
    note: 'Slices are ordinary types, not `ref struct`: they can be stored in structs, captured by closures and held across `.await`, with lifetimes proving the buffer outlives them. Out-of-range slicing panics.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'lifetimes' },
  },
  {
    id: 'p-readonly-list-param',
    category: 'collections',
    csharp: code`decimal Total(IReadOnlyList<OrderLine> lines)`,
    rust: code`fn total(lines: &[OrderLine]) -> i64`,
    note: 'Taking `&[T]` accepts a `Vec`, an array or a sub-slice. Unlike `IReadOnlyList`, the function is guaranteed that nobody mutates the data while it holds the borrow.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'functions' },
  },
  {
    id: 'p-immutable-array',
    category: 'collections',
    csharp: code`ImmutableArray<string> tags = [.. source];`,
    rust: code`
      let tags: Arc<[String]> = source.into();   // shared, cheap to clone
      let tags: Vec<String> = source;            // or: a binding without mut
    `,
    note: 'Immutability in Rust is a property of the binding or the borrow, not a separate collection type. `Arc<[T]>` is the closest match when you want many owners of a frozen list.',
    fit: 'different',
  },
  {
    id: 'p-remove-all',
    category: 'collections',
    csharp: code`orders.RemoveAll(o => o.IsCancelled);`,
    rust: code`orders.retain(|o| !o.is_cancelled);`,
    note: 'Same in-place operation with the predicate inverted: `retain` keeps what matches. `RemoveAll` returns the removed count; `retain` returns nothing.',
    fit: 'close',
  },
  {
    id: 'p-sort',
    category: 'collections',
    csharp: code`orders.Sort((a, b) => a.PlacedAt.CompareTo(b.PlacedAt));`,
    rust: code`
      orders.sort_by_key(|o| o.placed_at);
      prices.sort_by(|a, b| a.total_cmp(b));   // f64 is not Ord
    `,
    note: '`sort` and `sort_by_key` are stable (unlike `List.Sort`); `sort_unstable*` is the faster unstable variant. Floats do not implement `Ord`, so they need `sort_by` with `total_cmp`.',
    fit: 'close',
  },
  {
    id: 'p-queue-stack',
    category: 'collections',
    csharp: code`
      var pending = new Queue<Job>();
      pending.Enqueue(job); var next = pending.Dequeue();
    `,
    rust: code`
      let mut pending = VecDeque::new();
      pending.push_back(job); let next = pending.pop_front();
    `,
    note: '`pop_front` returns `Option<T>` instead of throwing on an empty queue. `Stack<T>` is a plain `Vec` with `push` and `pop`.',
    fit: 'direct',
  },
  {
    id: 'p-sorted-dictionary',
    category: 'collections',
    csharp: code`var byDate = new SortedDictionary<DateOnly, decimal>();`,
    rust: code`let mut by_date: BTreeMap<NaiveDate, i64> = BTreeMap::new();`,
    note: '`BTreeMap` keeps keys ordered and supports `range(..)` queries. `SortedSet<T>` is `BTreeSet<T>`.',
    fit: 'direct',
  },
  {
    id: 'p-index-of',
    category: 'collections',
    csharp: code`int i = orders.FindIndex(o => o.Id == id); // -1 if missing`,
    rust: code`let i: Option<usize> = orders.iter().position(|o| o.id == id);`,
    note: 'No sentinel: a missing element is `None`. Indices are `usize`, so mixing them with `i32` arithmetic needs explicit conversions.',
    fit: 'close',
  },
  {
    id: 'p-contains',
    category: 'collections',
    csharp: code`if (allowedRoles.Contains(role)) ...`,
    rust: code`if allowed_roles.contains(&role) { ... }`,
    note: 'Slice `contains` takes a reference. For `Vec<String>` searching by `&str`, use `allowed_roles.iter().any(|r| r == role)`.',
    fit: 'close',
  },

  // ---------------------------------------------------------------------------
  // linq
  // ---------------------------------------------------------------------------
  {
    id: 'p-where',
    category: 'linq',
    csharp: code`var paid = orders.Where(o => o.IsPaid);`,
    rust: code`let paid = orders.iter().filter(|o| o.is_paid);`,
    note: 'Lazy like LINQ. `iter()` yields `&Order`, and `filter` passes a reference to that, so the closure sees `&&Order`; auto-deref hides it for field access but not for pattern matching.',
    fit: 'close',
  },
  {
    id: 'p-select',
    category: 'linq',
    csharp: code`var ids = orders.Select(o => o.Id);`,
    rust: code`let ids = orders.iter().map(|o| o.id);`,
    note: 'Mapping to a `Copy` field is free. Mapping to a `String` field gives `&String` unless you `.clone()`, because the iterator borrows the source.',
    fit: 'direct',
  },
  {
    id: 'p-tolist',
    category: 'linq',
    csharp: code`List<Guid> ids = orders.Select(o => o.Id).ToList();`,
    rust: code`let ids: Vec<u64> = orders.iter().map(|o| o.id).collect();`,
    note: '`collect` builds whatever the target type says: `Vec`, `HashSet`, `String`, or even `Result<Vec<_>, E>`. It needs an annotation or turbofish (`collect::<Vec<_>>()`) when inference has nothing to go on.',
    fit: 'close',
  },
  {
    id: 'p-first',
    category: 'linq',
    csharp: code`var primary = addresses.First(a => a.IsPrimary);`,
    rust: code`let primary = addresses.iter().find(|a| a.is_primary).expect("no primary address");`,
    note: 'There is no throwing variant; `find` returns `Option` and you decide to panic with `expect`. Inside a function returning `Result`, prefer `.ok_or(MyError::NoPrimary)?`.',
    fit: 'close',
  },
  {
    id: 'p-first-or-default',
    category: 'linq',
    csharp: code`var order = orders.FirstOrDefault(o => o.Id == id);`,
    rust: code`let order: Option<&Order> = orders.iter().find(|o| o.id == id);`,
    note: 'Where C# returns null (or `default` for value types, which looks the same as a real 0), Rust returns `None`.',
    fit: 'close',
  },
  {
    id: 'p-any-all',
    category: 'linq',
    csharp: code`
      bool overdue = invoices.Any(i => i.IsOverdue);
      bool settled = invoices.All(i => i.Paid);
    `,
    rust: code`
      let overdue = invoices.iter().any(|i| i.is_overdue);
      let settled = invoices.iter().all(|i| i.paid);
    `,
    note: 'Same short-circuiting semantics. `Any()` with no predicate is `iter().next().is_some()`, or `!v.is_empty()` on a collection.',
    fit: 'direct',
  },
  {
    id: 'p-sum',
    category: 'linq',
    csharp: code`var total = lines.Sum(l => l.PriceCents * l.Quantity);`,
    rust: code`let total: i64 = lines.iter().map(|l| l.price_cents * l.quantity).sum();`,
    note: '`sum` usually needs the result type spelled out. Overflow panics in debug builds and wraps in release, where LINQ `Sum` always throws `OverflowException` because it adds in a `checked` context.',
    fit: 'close',
  },
  {
    id: 'p-count',
    category: 'linq',
    csharp: code`int failed = jobs.Count(j => j.State == JobState.Failed);`,
    rust: code`let failed = jobs.iter().filter(|j| j.state == JobState::Failed).count();`,
    note: 'Comparing enums with `==` needs `#[derive(PartialEq)]`; `matches!(j.state, JobState::Failed)` avoids that.',
    fit: 'close',
  },
  {
    id: 'p-orderby',
    category: 'linq',
    csharp: code`var newestFirst = orders.OrderByDescending(o => o.PlacedAt).ToList();`,
    rust: code`
      let mut newest_first: Vec<&Order> = orders.iter().collect();
      newest_first.sort_by_key(|o| std::cmp::Reverse(o.placed_at));
    `,
    note: 'Iterators have no sort adapter. You collect into a `Vec` and sort it in place; `ThenBy` becomes a tuple key or `cmp(..).then_with(..)`.',
    fit: 'different',
  },
  {
    id: 'p-groupby',
    category: 'linq',
    csharp: code`var byCustomer = orders.GroupBy(o => o.CustomerId);`,
    rust: code`
      let mut by_customer: HashMap<u64, Vec<&Order>> = HashMap::new();
      for o in &orders { by_customer.entry(o.customer_id).or_default().push(o); }
    `,
    note: 'No std adapter; a loop over the entry API is the idiom. `itertools::chunk_by` only groups **consecutive** equal keys, which surprises people expecting `GroupBy`. A `HashMap` also loses the first-seen key order that `GroupBy` preserves; use `BTreeMap` or an index map if order matters.',
    fit: 'different',
  },
  {
    id: 'p-todictionary',
    category: 'linq',
    csharp: code`var byId = products.ToDictionary(p => p.Sku);`,
    rust: code`let by_sku: HashMap<&str, &Product> = products.iter().map(|p| (p.sku.as_str(), p)).collect();`,
    note: 'Collecting pairs into a map silently keeps the last value for a duplicate key, where `ToDictionary` throws `ArgumentException`.',
    fit: 'close',
  },
  {
    id: 'p-selectmany',
    category: 'linq',
    csharp: code`var allLines = orders.SelectMany(o => o.Lines);`,
    rust: code`let all_lines = orders.iter().flat_map(|o| o.lines.iter());`,
    note: 'Use `.flatten()` when the items are already iterable, including `Option`s, which drops the `None`s.',
    fit: 'direct',
  },
  {
    id: 'p-aggregate',
    category: 'linq',
    csharp: code`var csv = fields.Aggregate("", (acc, f) => acc + f + ",");`,
    rust: code`let csv = fields.iter().fold(String::new(), |mut acc, f| { acc.push_str(f); acc.push(','); acc });`,
    note: '`fold` is seeded `Aggregate`; `reduce` is the seedless one and returns `Option` instead of throwing on an empty sequence. The accumulator is moved through, so mutating it in place is cheap.',
    fit: 'direct',
  },
  {
    id: 'p-zip',
    category: 'linq',
    csharp: code`var pairs = names.Zip(scores, (n, s) => $"{n}: {s}");`,
    rust: code`let pairs = names.iter().zip(scores.iter()).map(|(n, s)| format!("{n}: {s}"));`,
    note: 'Stops at the shorter sequence, same as LINQ. Tuples are destructured directly in the closure parameter.',
    fit: 'direct',
  },
  {
    id: 'p-skip-take',
    category: 'linq',
    csharp: code`var page = results.Skip(pageSize * pageIndex).Take(pageSize);`,
    rust: code`let page = results.iter().skip(page_size * page_index).take(page_size);`,
    note: 'On a slice you can also index directly, `&results[start..end]`, but that panics out of range where `skip`/`take` quietly yield fewer items.',
    fit: 'direct',
  },
  {
    id: 'p-distinct',
    category: 'linq',
    csharp: code`var uniqueEmails = emails.Distinct().ToList();`,
    rust: code`
      let mut seen = HashSet::new();
      let unique_emails: Vec<_> = emails.iter().filter(|e| seen.insert(*e)).collect();
    `,
    note: 'No std adapter. The `HashSet` filter keeps first-seen order; `sort()` then `dedup()` is simpler when order does not matter, since `dedup` only removes **adjacent** duplicates.',
    fit: 'different',
  },
  {
    id: 'p-max-by',
    category: 'linq',
    csharp: code`var biggest = orders.MaxBy(o => o.TotalCents);`,
    rust: code`let biggest: Option<&Order> = orders.iter().max_by_key(|o| o.total_cents);`,
    note: 'Returns `None` on an empty sequence, where `MaxBy` returns null for reference types and throws for value types. On ties `max_by_key` returns the **last** maximum (`MaxBy` returns the first), `min_by_key` the first.',
    fit: 'close',
  },
  {
    id: 'p-select-index',
    category: 'linq',
    csharp: code`foreach (var (i, line) in lines.Index())`,
    rust: code`for (i, line) in lines.iter().enumerate() { ... }`,
    note: 'Same `(index, item)` order as .NET 9 `Index()`. Indices are `usize`.',
    fit: 'direct',
  },
  {
    id: 'p-chunk',
    category: 'linq',
    csharp: code`foreach (var batch in orderIds.Chunk(500)) await Publish(batch);`,
    rust: code`for batch in order_ids.chunks(500) { publish(batch).await; }`,
    note: '`chunks` is a slice method yielding sub-slices without copying. For a lazy iterator source there is no std equivalent; `itertools::chunks` fills the gap.',
    fit: 'direct',
  },
  {
    id: 'p-windows',
    category: 'linq',
    csharp: code`var deltas = readings.Zip(readings.Skip(1), (a, b) => b - a);`,
    rust: code`let deltas: Vec<f64> = readings.windows(2).map(|w| w[1] - w[0]).collect();`,
    note: '`windows(n)` yields overlapping sub-slices of a slice, which LINQ lacks. Like `chunks`, it works on slices, not arbitrary iterators.',
    fit: 'close',
  },
  {
    id: 'p-ienumerable-return',
    category: 'linq',
    csharp: code`IEnumerable<Order> Overdue(DateTime now) => _orders.Where(o => o.Due < now);`,
    rust: code`
      fn overdue(&self, now: u64) -> impl Iterator<Item = &Order> + '_ {
          self.orders.iter().filter(move |o| o.due < now)
      }
    `,
    note: 'Returning a lazy query works, but the iterator borrows `self`, which the signature states. Callers cannot mutate the repository until they finish iterating, where C# would throw on the next `MoveNext`.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'lifetimes' },
  },

  // ---------------------------------------------------------------------------
  // errors
  // ---------------------------------------------------------------------------
  {
    id: 'p-throw',
    category: 'errors',
    csharp: code`throw new OrderNotFoundException(orderId);`,
    rust: code`return Err(OrderError::NotFound(order_id));`,
    note: 'Errors are return values that appear in the signature (`Result<Order, OrderError>`). Nothing unwinds past a caller that did not ask for it.',
    fit: 'different',
  },
  {
    id: 'p-try-catch',
    category: 'errors',
    csharp: code`
      Config cfg;
      try { cfg = LoadConfig(path); }
      catch (FileNotFoundException) { cfg = Config.Default; }
    `,
    rust: code`
      let cfg = match load_config(path) {
          Ok(cfg) => cfg,
          Err(ConfigError::Missing) => Config::default(),
          Err(e) => return Err(e),
      };
    `,
    note: 'Handling is a `match` on the value, so the compiler knows exactly which failures are possible. There is no way to catch "everything below this frame", except `catch_unwind` for panics, which is not an error-handling tool.',
    fit: 'different',
  },
  {
    id: 'p-propagate',
    category: 'errors',
    csharp: code`var text = File.ReadAllText(path); // exceptions bubble up`,
    rust: code`let text = fs::read_to_string(path)?;`,
    note: 'The `?` operator makes propagation visible at every call site and converts the error through `From` into the function error type.',
    fit: 'different',
  },
  {
    id: 'p-finally',
    category: 'errors',
    csharp: code`
      _metrics.StartTimer();
      try { Process(batch); } finally { _metrics.StopTimer(); }
    `,
    rust: code`
      let _timer = metrics.start_timer(); // stops in Drop
      process(&batch)?;
    `,
    note: 'Cleanup belongs to a value whose `Drop` runs on every exit path, including `?` and panics. Name the guard `_timer`, not `_`: a bare `_` drops it immediately.',
    fit: 'different',
    seeAlso: { kind: 'lesson', id: 'drop' },
  },
  {
    id: 'p-custom-exception',
    category: 'errors',
    csharp: code`
      public class ImportException(string file, Exception inner)
          : Exception($"Import of {file} failed", inner);
    `,
    rust: code`
      #[derive(Debug)]
      enum ImportError { Io { file: PathBuf, source: io::Error }, BadRow(usize) }
      impl fmt::Display for ImportError { /* ... */ }
      impl std::error::Error for ImportError { /* source() */ }
    `,
    note: 'An error is usually an enum of the failure cases rather than a class per case. The `thiserror` crate generates the `Display`, `Error` and `From` boilerplate.',
    fit: 'close',
  },
  {
    id: 'p-inner-exception',
    category: 'errors',
    csharp: code`catch (IOException ex) { throw new ConfigException("read failed", ex); }`,
    rust: code`let text = fs::read_to_string(&path).map_err(|e| ConfigError::Read { path, source: e })?;`,
    note: 'Wrapping is `map_err`, and the chain is exposed through `Error::source()` instead of `InnerException`. `anyhow` offers `.context("read failed")` for applications.',
    fit: 'close',
  },
  {
    id: 'p-catch-all',
    category: 'errors',
    csharp: code`catch (Exception ex) { _log.LogError(ex, "job failed"); }`,
    rust: code`
      fn run() -> Result<(), Box<dyn std::error::Error>> { ... }
      if let Err(e) = run() { eprintln!("job failed: {e}"); }
    `,
    note: '`Box<dyn Error>` (or `anyhow::Error`) is the "any error" type for application code. Panics are not in it; they only surface at a thread or task boundary.',
    fit: 'close',
  },
  {
    id: 'p-argument-null',
    category: 'errors',
    csharp: code`ArgumentNullException.ThrowIfNull(customer);`,
    rust: code`fn register(customer: &Customer) { /* customer cannot be null */ }`,
    note: 'References are never null, so the guard has nothing to check. Optionality is spelled `Option<&Customer>` and the caller must construct `Some` explicitly.',
    fit: 'different',
  },
  {
    id: 'p-argument-out-of-range',
    category: 'errors',
    csharp: code`ArgumentOutOfRangeException.ThrowIfNegativeOrZero(quantity);`,
    rust: code`
      if quantity == 0 { return Err(OrderError::ZeroQuantity); }
      // or make it unrepresentable: quantity: NonZeroU32
    `,
    note: 'Validation that callers can trigger returns `Err`; `assert!` is for bugs. Types like `NonZeroU32` or a validated newtype move the check to construction.',
    fit: 'close',
  },
  {
    id: 'p-invalid-operation',
    category: 'errors',
    csharp: code`throw new InvalidOperationException("state machine reached unknown state");`,
    rust: code`unreachable!("state machine reached unknown state")`,
    note: 'Panics (`panic!`, `unreachable!`, `expect`) are for broken invariants, not for expected failures. They unwind the thread and are not meant to be caught.',
    fit: 'close',
  },
  {
    id: 'p-tryparse',
    category: 'errors',
    csharp: code`if (int.TryParse(input, out var port)) Listen(port);`,
    rust: code`if let Ok(port) = input.parse::<u16>() { listen(port); }`,
    note: '`parse` returns `Result` and keeps the reason for failure. There is no culture: parsing is always invariant, and leading/trailing whitespace is rejected.',
    fit: 'close',
  },
  {
    id: 'p-exception-filter',
    category: 'errors',
    csharp: code`catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)`,
    rust: code`Err(ApiError::Http { status, .. }) if status == 429 => retry_later(),`,
    note: 'A match guard plays the role of `when`. Because the match is exhaustive, you also have to say what happens to every other status.',
    fit: 'close',
  },

  // ---------------------------------------------------------------------------
  // async
  // ---------------------------------------------------------------------------
  {
    id: 'p-task',
    category: 'async',
    csharp: code`Task<Invoice> LoadInvoiceAsync(Guid id)`,
    rust: code`async fn load_invoice(id: Uuid) -> Result<Invoice, DbError>`,
    note: 'A C# `Task` is already running when you get it. A Rust future is inert until something awaits or spawns it, so calling `load_invoice(id)` without `.await` does nothing at all.',
    fit: 'different',
  },
  {
    id: 'p-await',
    category: 'async',
    csharp: code`var invoice = await LoadInvoiceAsync(id);`,
    rust: code`let invoice = load_invoice(id).await?;`,
    note: 'Postfix `.await` chains with `?`. There is no `SynchronizationContext`, so `ConfigureAwait(false)` has no counterpart; which thread resumes depends on the runtime.',
    fit: 'close',
  },
  {
    id: 'p-whenall',
    category: 'async',
    csharp: code`
      await Task.WhenAll(userTask, ordersTask);
      var (user, orders) = (userTask.Result, ordersTask.Result);
    `,
    rust: code`let (user, orders) = tokio::join!(load_user(id), load_orders(id));`,
    note: '`join!` polls both futures concurrently inside the current task, not in parallel on separate threads. For a dynamic list use `futures::future::join_all` or a `JoinSet`.',
    fit: 'close',
  },
  {
    id: 'p-whenany',
    category: 'async',
    csharp: code`var winner = await Task.WhenAny(fetchTask, Task.Delay(timeout));`,
    rust: code`
      tokio::select! {
          resp = fetch() => handle(resp),
          _ = tokio::time::sleep(timeout) => log_timeout(),
      }
    `,
    note: 'The losing branches are **dropped**, which cancels them. In C# the losing task keeps running in the background unless you cancel it yourself.',
    fit: 'close',
  },
  {
    id: 'p-task-run',
    category: 'async',
    csharp: code`var hash = await Task.Run(() => HashPassword(pw));`,
    rust: code`let hash = tokio::task::spawn_blocking(move || hash_password(&pw)).await?;`,
    note: 'CPU or blocking work goes to `spawn_blocking`; `tokio::spawn` is for async work. Both require the closure or future to own its captures (`\'static`, `move`) and to be `Send`.',
    fit: 'different',
  },
  {
    id: 'p-cancellation-token',
    category: 'async',
    csharp: code`await ProcessAsync(job, cancellationToken);`,
    rust: code`
      tokio::select! {
          _ = token.cancelled() => {},
          r = process(job) => r?,
      }
    `,
    note: '`tokio_util::sync::CancellationToken` works like the .NET one. But dropping a future also cancels it at its current `.await`, so much code needs no token at all.',
    fit: 'close',
  },
  {
    id: 'p-task-delay',
    category: 'async',
    csharp: code`await Task.Delay(TimeSpan.FromMilliseconds(250));`,
    rust: code`tokio::time::sleep(Duration::from_millis(250)).await;`,
    note: 'Calling `std::thread::sleep` inside async code blocks the runtime worker thread, the Rust version of `.Result` on a hot path.',
    fit: 'direct',
  },
  {
    id: 'p-iasyncenumerable',
    category: 'async',
    csharp: code`await foreach (var evt in ReadEventsAsync(ct)) Handle(evt);`,
    rust: code`
      while let Some(evt) = events.next().await { handle(evt); }
      // events: impl Stream<Item = Event>, StreamExt from futures/tokio-stream
    `,
    note: 'Streams come from the `futures` or `tokio-stream` crates, not std, and there is no stable `yield` for async generators. `async-stream` or a channel receiver usually produces them.',
    fit: 'close',
  },
  {
    id: 'p-lock',
    category: 'async',
    csharp: code`lock (_sync) { _balance += amount; }`,
    rust: code`*balance.lock().unwrap() += amount;`,
    note: 'The `Mutex` owns the data, so you cannot touch the balance without the lock. The guard unlocks on drop, and `unwrap` handles poisoning after a panic. Do not hold a `std::sync::MutexGuard` across `.await`.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'drop' },
  },
  {
    id: 'p-semaphoreslim',
    category: 'async',
    csharp: code`
      await _gate.WaitAsync();
      try { await SendAsync(msg); } finally { _gate.Release(); }
    `,
    rust: code`
      let _permit = gate.acquire().await?;
      send(msg).await?;
    `,
    note: '`tokio::sync::Semaphore` hands out a permit that releases on drop, so the `try/finally` disappears. `acquire_owned` gives a permit you can move into a spawned task.',
    fit: 'close',
  },
  {
    id: 'p-concurrent-dictionary',
    category: 'async',
    csharp: code`_sessions.AddOrUpdate(id, session, (_, _) => session);`,
    rust: code`
      sessions.lock().unwrap().insert(id, session);  // Mutex<HashMap<..>>
      // or dashmap::DashMap::insert for sharded locking
    `,
    note: 'A `Mutex<HashMap>` behind an `Arc` is the default and is often fast enough. `DashMap` is the closest to `ConcurrentDictionary`, but holding a reference into it while touching the same shard deadlocks.',
    fit: 'close',
  },
  {
    id: 'p-interlocked',
    category: 'async',
    csharp: code`Interlocked.Increment(ref _processed);`,
    rust: code`processed.fetch_add(1, Ordering::Relaxed);`,
    note: '`AtomicU64` and friends in `std::sync::atomic`. You pick the memory ordering explicitly; `Relaxed` is fine for counters.',
    fit: 'direct',
  },
  {
    id: 'p-channel',
    category: 'async',
    csharp: code`
      var channel = Channel.CreateBounded<Job>(100);
      await channel.Writer.WriteAsync(job);
    `,
    rust: code`
      let (tx, mut rx) = tokio::sync::mpsc::channel::<Job>(100);
      tx.send(job).await?;
    `,
    note: 'The sender and receiver are separate values. The channel closes when every `tx` clone is dropped, which replaces `Writer.Complete()`; `rx.recv()` then returns `None`.',
    fit: 'close',
  },
  {
    id: 'p-parallel-foreach',
    category: 'async',
    csharp: code`Parallel.ForEach(images, img => Resize(img));`,
    rust: code`images.par_iter().for_each(|img| resize(img));`,
    note: 'From the `rayon` crate. The compiler checks that the closure is safe to run on many threads, so a captured `List.Add` style data race does not compile.',
    fit: 'close',
  },

  // ---------------------------------------------------------------------------
  // oop
  // ---------------------------------------------------------------------------
  {
    id: 'p-class',
    category: 'oop',
    csharp: code`
      public class Cart {
          private readonly List<CartLine> _lines = new();
          public void Add(CartLine line) => _lines.Add(line);
      }
    `,
    rust: code`
      pub struct Cart { lines: Vec<CartLine> }
      impl Cart {
          pub fn add(&mut self, line: CartLine) { self.lines.push(line); }
      }
    `,
    note: 'Data and methods are declared separately. Each method states how it uses the receiver: `&self`, `&mut self`, or `self` (consumes it).',
    fit: 'close',
  },
  {
    id: 'p-constructor',
    category: 'oop',
    csharp: code`public Cart(Guid customerId) { CustomerId = customerId; }`,
    rust: code`
      impl Cart {
          pub fn new(customer_id: u64) -> Self { Self { customer_id, lines: Vec::new() } }
      }
    `,
    note: '`new` is a naming convention for an ordinary associated function, not a language feature. Any function can build a struct if the fields are visible, so invariants rely on private fields.',
    fit: 'close',
  },
  {
    id: 'p-object-initializer',
    category: 'oop',
    csharp: code`var opts = new HttpOptions { Timeout = TimeSpan.FromSeconds(5) };`,
    rust: code`let opts = HttpOptions { timeout: Duration::from_secs(5), ..Default::default() };`,
    note: 'A struct literal must set every field; `..Default::default()` fills the rest. Crates often expose builders instead because fields are private.',
    fit: 'close',
  },
  {
    id: 'p-inheritance',
    category: 'oop',
    csharp: code`class AdminUser : User { public string[] Scopes { get; init; } }`,
    rust: code`
      struct AdminUser { user: User, scopes: Vec<String> }
      // shared behaviour: impl Authorize for User / AdminUser
    `,
    note: 'There is no implementation inheritance. Compose the data and share behaviour through traits; `Deref` to the inner struct is sometimes used for this and is considered an anti-pattern.',
    fit: 'different',
  },
  {
    id: 'p-virtual-override',
    category: 'oop',
    csharp: code`
      public virtual decimal Discount(Order o) => 0m;
      public override decimal Discount(Order o) => o.Total * 0.1m;
    `,
    rust: code`
      trait Pricing { fn discount(&self, o: &Order) -> i64 { 0 } }
      impl Pricing for LoyaltyPricing { fn discount(&self, o: &Order) -> i64 { o.total / 10 } }
    `,
    note: 'A default trait method overridden in an `impl` covers the common case. There is no `base.Discount(o)` call to the default from inside the override.',
    fit: 'close',
  },
  {
    id: 'p-idisposable',
    category: 'oop',
    csharp: code`using var conn = await _factory.OpenAsync();`,
    rust: code`let conn = pool.get().await?; // returned to the pool when conn drops`,
    note: '`Drop` runs deterministically at scope end without a `using`, and the compiler prevents use after it. There is no async drop, so async cleanup needs an explicit `close().await`.',
    fit: 'different',
    seeAlso: { kind: 'lesson', id: 'drop' },
  },
  {
    id: 'p-properties',
    category: 'oop',
    csharp: code`public decimal Total { get; private set; }`,
    rust: code`
      pub struct Invoice { total: i64 }
      impl Invoice { pub fn total(&self) -> i64 { self.total } }
    `,
    note: 'No properties: either a `pub` field or a getter method named after the field (no `get_` prefix). Setters are plain methods taking `&mut self`.',
    fit: 'different',
  },
  {
    id: 'p-static-class',
    category: 'oop',
    csharp: code`public static class TaxCalculator { public static decimal Vat(decimal net) => net * 0.2m; }`,
    rust: code`
      pub mod tax {
          pub fn vat(net_cents: i64) -> i64 { net_cents / 5 }
      }
    `,
    note: 'Free functions in a module. Callers write `tax::vat(x)`, which reads the same as the static call.',
    fit: 'close',
  },
  {
    id: 'p-static-method',
    category: 'oop',
    csharp: code`var sku = Sku.Parse("ABC-123");`,
    rust: code`let sku = Sku::parse("ABC-123")?;`,
    note: 'Associated functions (no `self` parameter) are called with `Type::name`. Implementing `FromStr` also enables `"ABC-123".parse::<Sku>()`.',
    fit: 'direct',
  },
  {
    id: 'p-operator-overloading',
    category: 'oop',
    csharp: code`public static Money operator +(Money a, Money b) => new(a.Cents + b.Cents);`,
    rust: code`
      impl std::ops::Add for Money {
          type Output = Money;
          fn add(self, b: Money) -> Money { Money(self.0 + b.0) }
      }
    `,
    note: 'Operators are traits in `std::ops`. They take operands by value, so for a non-`Copy` type `a + b` moves both unless you also implement `Add<&Money> for &Money`.',
    fit: 'close',
  },
  {
    id: 'p-tostring',
    category: 'oop',
    csharp: code`public override string ToString() => $"{Sku} x{Quantity}";`,
    rust: code`
      impl fmt::Display for OrderLine {
          fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, "{} x{}", self.sku, self.quantity) }
      }
    `,
    note: 'Implement `Display` and you get `to_string()` and `{}` formatting for free. The debug representation is a separate trait, `Debug` (`{:?}`), usually derived.',
    fit: 'close',
  },
  {
    id: 'p-equals-gethashcode',
    category: 'oop',
    csharp: code`public override bool Equals(object? o) ... public override int GetHashCode() ...`,
    rust: code`
      #[derive(PartialEq, Eq, Hash)]
      struct CustomerId(u64);
    `,
    note: 'Equality is never reference identity by default; without `PartialEq`, `==` does not compile. `std::ptr::eq` is the explicit `ReferenceEquals`.',
    fit: 'close',
  },
  {
    id: 'p-access-modifiers',
    category: 'oop',
    csharp: code`internal sealed class RetryPolicy { private int _attempts; }`,
    rust: code`pub(crate) struct RetryPolicy { attempts: u32 }`,
    note: 'Privacy is per **module**, not per type: code in the same module can read private fields. `pub(crate)` is `internal`, and every struct is effectively sealed.',
    fit: 'close',
  },
  {
    id: 'p-partial-class',
    category: 'oop',
    csharp: code`public partial class OrderService { ... }`,
    rust: code`
      impl OrderService { /* queries */ }
      impl OrderService { /* commands, possibly in another file of the same crate */ }
    `,
    note: 'A type can have many `impl` blocks anywhere in its crate. The struct definition itself cannot be split.',
    fit: 'close',
  },
  {
    id: 'p-method-overloading',
    category: 'oop',
    csharp: code`
      void Log(string message);
      void Log(string message, Exception ex);
    `,
    rust: code`
      fn log(message: &str) { ... }
      fn log_error(message: &str, err: &dyn Error) { ... }
    `,
    note: 'No overloading and no optional or named parameters. Use distinct names, an `Option` parameter, an options struct with `Default`, or a trait implemented for each argument type.',
    fit: 'different',
  },

  // ---------------------------------------------------------------------------
  // memory
  // ---------------------------------------------------------------------------
  {
    id: 'p-gc',
    category: 'memory',
    csharp: code`var report = BuildReport(orders); // GC frees it eventually`,
    rust: code`let report = build_report(&orders); // freed when report goes out of scope`,
    note: 'Every value has one owner and is dropped when that owner goes away. Assignment and passing by value **move** the value, which is the source of most early compile errors.',
    fit: 'different',
    seeAlso: { kind: 'lesson', id: 'moves' },
  },
  {
    id: 'p-ref-param',
    category: 'memory',
    csharp: code`void ApplyDiscount(ref Order order, decimal pct)`,
    rust: code`fn apply_discount(order: &mut Order, pct: u8)`,
    note: 'Unlike C#, where classes are already mutable through any reference, Rust needs `&mut` for any mutation, and only one `&mut` can exist at a time.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'functions' },
  },
  {
    id: 'p-in-param',
    category: 'memory',
    csharp: code`decimal Total(in LargeStruct invoice)`,
    rust: code`fn total(invoice: &Invoice) -> i64`,
    note: 'A shared borrow is the default way to pass anything you only read, for classes and structs alike.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'functions' },
  },
  {
    id: 'p-out-param',
    category: 'memory',
    csharp: code`bool TrySplit(string s, out string key, out string value)`,
    rust: code`fn split_pair(s: &str) -> Option<(&str, &str)>`,
    note: 'Return a tuple inside `Option` or `Result`. `str::split_once` already does exactly this.',
    fit: 'different',
  },
  {
    id: 'p-unsafe',
    category: 'memory',
    csharp: code`unsafe { fixed (byte* p = &buffer[0]) { *p = 0xFF; } }`,
    rust: code`
      let p = buffer.as_mut_ptr();
      unsafe { *p = 0xFF; }
    `,
    note: 'Creating raw pointers is safe; dereferencing them needs `unsafe`. Inside it you promise to uphold the aliasing rules the compiler normally checks, which is stricter than C# unsafe code.',
    fit: 'close',
  },
  {
    id: 'p-weakreference',
    category: 'memory',
    csharp: code`var parent = new WeakReference<Node>(node);`,
    rust: code`
      let parent: Weak<RefCell<Node>> = Rc::downgrade(&node);
      if let Some(p) = parent.upgrade() { ... }
    `,
    note: '`Weak` only points into `Rc` or `Arc` allocations. Its main job is breaking reference cycles that would otherwise leak, since there is no GC to find them.',
    fit: 'close',
  },
  {
    id: 'p-stackalloc',
    category: 'memory',
    csharp: code`Span<byte> scratch = stackalloc byte[256];`,
    rust: code`let mut scratch = [0u8; 256];`,
    note: 'Fixed-size arrays live on the stack by default, no keyword needed. The size must be a compile-time constant; there is no dynamic stack allocation in safe Rust.',
    fit: 'close',
  },
  {
    id: 'p-heap-object',
    category: 'memory',
    csharp: code`Node root = new Node(value);`,
    rust: code`let root = Box::new(Node::new(value));`,
    note: '`new` in C# allocates classes on the heap implicitly. In Rust values are inline unless you box them, which you need mainly for recursive types and trait objects.',
    fit: 'different',
  },
  {
    id: 'p-shared-mutable-graph',
    category: 'memory',
    csharp: code`account.Owner = customer; customer.Accounts.Add(account);`,
    rust: code`
      let customer = Rc::new(RefCell::new(Customer::new()));
      customer.borrow_mut().accounts.push(Rc::clone(&account));
    `,
    note: 'Object graphs with back-references need `Rc<RefCell<T>>` (or `Arc<Mutex<T>>`), which moves borrow checking to runtime. Many designs avoid this with IDs into a `Vec` or map instead.',
    fit: 'different',
  },
  {
    id: 'p-clone',
    category: 'memory',
    csharp: code`var copy = order with { }; // shallow copy`,
    rust: code`let copy = order.clone();`,
    note: 'Derived `Clone` clones every field, so a `Vec` inside is duplicated, not shared. Cloning an `Rc` or `Arc` only bumps a count.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'cloning' },
  },
  {
    id: 'p-lazy',
    category: 'memory',
    csharp: code`private readonly Lazy<Catalog> _catalog = new(LoadCatalog);`,
    rust: code`
      catalog: OnceLock<Catalog>,
      let c = self.catalog.get_or_init(load_catalog);
    `,
    note: '`std::sync::OnceLock` (thread-safe) and `std::cell::OnceCell` initialise on first access. `LazyLock` bundles the init function in, like `Lazy<T>`.',
    fit: 'close',
  },

  // ---------------------------------------------------------------------------
  // strings
  // ---------------------------------------------------------------------------
  {
    id: 'p-string-interpolation',
    category: 'strings',
    csharp: code`var msg = $"Order {order.Id} total {total:F2}";`,
    rust: code`let msg = format!("Order {} total {total:.2}", order.id);`,
    note: 'Inline `{name}` works only for plain identifiers, not expressions like `order.id`, which go in positional arguments. Format specs differ: `:.2`, `:>10`, `:?`.',
    fit: 'close',
  },
  {
    id: 'p-verbatim-string',
    category: 'strings',
    csharp: code`var path = @"C:\exports\daily";`,
    rust: code`let path = r"C:\exports\daily";`,
    note: 'Raw strings with `r"..."`; use `r#"..."#` when the content contains quotes, similar to C# raw string literals.',
    fit: 'direct',
  },
  {
    id: 'p-stringbuilder',
    category: 'strings',
    csharp: code`
      var sb = new StringBuilder();
      sb.Append("id,total").AppendLine();
    `,
    rust: code`
      let mut csv = String::new();
      csv.push_str("id,total\n");
      writeln!(csv, "{},{}", id, total)?; // use std::fmt::Write
    `,
    note: '`String` is already a growable mutable buffer, so no separate builder type is needed. `String::with_capacity` pre-sizes it.',
    fit: 'close',
  },
  {
    id: 'p-string-join',
    category: 'strings',
    csharp: code`var header = string.Join(",", columns);`,
    rust: code`let header = columns.join(",");`,
    note: '`join` is a slice method on `[String]` or `[&str]`. For an iterator, collect into a `Vec` first or use `itertools::join`.',
    fit: 'close',
  },
  {
    id: 'p-split',
    category: 'strings',
    csharp: code`var parts = line.Split(',', StringSplitOptions.TrimEntries);`,
    rust: code`let parts: Vec<&str> = line.split(',').map(str::trim).collect();`,
    note: '`split` is lazy and yields `&str` slices borrowing from `line`, with no allocation per part. `split_once` covers the common key=value case.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'lifetimes' },
  },
  {
    id: 'p-substring',
    category: 'strings',
    csharp: code`var prefix = sku.Substring(0, 3);`,
    rust: code`
      let prefix = &sku[0..3];                // byte offsets, panics inside a char
      let prefix: String = sku.chars().take(3).collect();
    `,
    note: 'Strings are UTF-8 and indexed by byte, so slicing in the middle of a multi-byte character panics. `sku.get(0..3)` returns `Option` instead.',
    fit: 'different',
  },
  {
    id: 'p-string-length',
    category: 'strings',
    csharp: code`if (name.Length > 50) ...`,
    rust: code`if name.chars().count() > 50 { ... }`,
    note: '`len()` is the byte count, not UTF-16 code units. `"é".len()` is 2. Both languages still differ from user-perceived characters.',
    fit: 'different',
  },
  {
    id: 'p-toupper',
    category: 'strings',
    csharp: code`var code = input.ToUpperInvariant();`,
    rust: code`let code = input.to_uppercase();`,
    note: 'Always culture-invariant Unicode rules, returning a new `String`. Unlike `ToUpperInvariant`, the length can change: `"ß".to_uppercase()` is `"SS"`. `to_ascii_uppercase` is cheaper and `make_ascii_uppercase` works in place.',
    fit: 'close',
  },
  {
    id: 'p-string-compare-ignore-case',
    category: 'strings',
    csharp: code`string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`,
    rust: code`a.eq_ignore_ascii_case(b)`,
    note: 'Only ASCII letters are folded. For full Unicode compare `a.to_lowercase() == b.to_lowercase()`, which allocates.',
    fit: 'close',
  },
  {
    id: 'p-string-equality',
    category: 'strings',
    csharp: code`if (status == "active") ...`,
    rust: code`if status == "active" { ... }`,
    note: 'Content comparison, ordinal. It works across `String` and `&str` because `PartialEq` is implemented between them.',
    fit: 'direct',
  },
  {
    id: 'p-isnullorwhitespace',
    category: 'strings',
    csharp: code`if (string.IsNullOrWhiteSpace(title)) return;`,
    rust: code`if title.trim().is_empty() { return; }`,
    note: 'The null half disappears; an absent title would be `Option<String>`, checked with `title.as_deref().is_none_or(|t| t.trim().is_empty())`.',
    fit: 'close',
  },
  {
    id: 'p-string-param',
    category: 'strings',
    csharp: code`bool IsValidEmail(string email)`,
    rust: code`fn is_valid_email(email: &str) -> bool`,
    note: 'Take `&str` to read, `String` only when you keep it. `&String` arguments coerce to `&str`, so callers pass `&owned` or a literal.',
    fit: 'close',
    seeAlso: { kind: 'lesson', id: 'functions' },
  },
  {
    id: 'p-string-helpers',
    category: 'strings',
    csharp: code`s.Trim().StartsWith("ORD-") && s.Contains('-')`,
    rust: code`s.trim().starts_with("ORD-") && s.contains('-')`,
    note: 'Same names, snake_case, always ordinal. C# `StartsWith(string)` is culture-sensitive unless you pass `StringComparison.Ordinal`. `strip_prefix("ORD-")` returns the remainder as `Option<&str>`, which is usually what you wanted next.',
    fit: 'close',
  },
  {
    id: 'p-format-padding',
    category: 'strings',
    csharp: code`Console.WriteLine($"{sku,-10}{qty,5}");`,
    rust: code`println!("{sku:<10}{qty:>5}");`,
    note: 'Alignment is `<`, `>` or `^` plus a width. Numbers and strings honour width; your own `Display` impl ignores it unless it calls `f.pad`.',
    fit: 'close',
  },

  // ---------------------------------------------------------------------------
  // tooling
  // ---------------------------------------------------------------------------
  {
    id: 'p-dotnet-new',
    category: 'tooling',
    csharp: code`
      dotnet new console -n billing
      dotnet new classlib -n Billing.Core
    `,
    rust: code`
      cargo new billing
      cargo new --lib billing-core
    `,
    note: 'One crate can hold both `src/main.rs` and `src/lib.rs`, which is common: the binary is a thin wrapper around the library.',
    fit: 'direct',
  },
  {
    id: 'p-dotnet-build-run',
    category: 'tooling',
    csharp: code`
      dotnet build -c Release
      dotnet run -- --port 8080
    `,
    rust: code`
      cargo build --release
      cargo run -- --port 8080
    `,
    note: 'Debug builds are much slower at runtime than .NET Debug builds, so benchmark only with `--release`. `cargo check` type-checks without generating code and is what you run in the edit loop.',
    fit: 'direct',
  },
  {
    id: 'p-dotnet-test',
    category: 'tooling',
    csharp: code`dotnet test --filter "FullyQualifiedName~Pricing"`,
    rust: code`cargo test pricing`,
    note: 'Runs unit tests inside `src`, integration tests in `tests/`, and code examples in doc comments. The filter is a substring of the test path.',
    fit: 'close',
  },
  {
    id: 'p-xunit-fact',
    category: 'tooling',
    csharp: code`
      [Fact]
      public void Vat_is_twenty_percent() => Assert.Equal(20m, Tax.Vat(100m));
    `,
    rust: code`
      #[test]
      fn vat_is_twenty_percent() { assert_eq!(tax::vat(10_000), 2_000); }
    `,
    note: 'Unit tests live in a `#[cfg(test)] mod tests` next to the code and can call private functions. There is no built-in `[Theory]`; loop over cases or use `rstest`.',
    fit: 'close',
  },
  {
    id: 'p-nuget-csproj',
    category: 'tooling',
    csharp: code`<PackageReference Include="Serilog" Version="4.0.0" />`,
    rust: code`
      [dependencies]
      tracing = "0.1"
    `,
    note: 'Versions are semver ranges by default (`"0.1"` means `>=0.1.0, <0.2.0`) and `Cargo.lock` pins the exact resolution. `cargo add tracing` edits the file for you.',
    fit: 'close',
  },
  {
    id: 'p-directory-build-props',
    category: 'tooling',
    csharp: code`<!-- Directory.Build.props + Directory.Packages.props -->`,
    rust: code`
      [workspace]
      members = ["crates/*"]
      [workspace.dependencies]
      serde = { version = "1", features = ["derive"] }
    `,
    note: 'A workspace shares one `Cargo.lock` and `target/` directory. Member crates opt in per dependency with `serde = { workspace = true }`, similar to central package management.',
    fit: 'close',
  },
  {
    id: 'p-roslyn-analyzers',
    category: 'tooling',
    csharp: code`<TreatWarningsAsErrors>true</TreatWarningsAsErrors> + analyzers`,
    rust: code`cargo clippy --all-targets -- -D warnings`,
    note: 'Clippy ships with the toolchain and has several hundred lints. Lint levels can also be set in `Cargo.toml` under `[lints.clippy]`.',
    fit: 'close',
  },
  {
    id: 'p-dotnet-format',
    category: 'tooling',
    csharp: code`dotnet format`,
    rust: code`cargo fmt`,
    note: 'rustfmt has very few options and the community uses the defaults, so style discussions mostly do not happen.',
    fit: 'direct',
  },
  {
    id: 'p-global-json',
    category: 'tooling',
    csharp: code`{ "sdk": { "version": "9.0.100" } }  // global.json`,
    rust: code`
      # rust-toolchain.toml
      [toolchain]
      channel = "1.97"
    `,
    note: '`rustup` reads this file and installs the pinned toolchain automatically on first build.',
    fit: 'direct',
  },
  {
    id: 'p-internals-visible-to',
    category: 'tooling',
    csharp: code`[assembly: InternalsVisibleTo("Billing.Tests")]`,
    rust: code`
      #[cfg(test)]
      mod tests { use super::*; }
    `,
    note: 'A child module can see its parent private items, so tests nested in the same file need no special access. Integration tests in `tests/` see only the public API.',
    fit: 'different',
  },
  {
    id: 'p-xml-doc',
    category: 'tooling',
    csharp: code`/// <summary>Calculates VAT in minor units.</summary>`,
    rust: code`
      /// Calculates VAT in minor units.
      ///
      /// \`\`\`
      /// assert_eq!(billing::vat(100), 20);
      /// \`\`\`
    `,
    note: 'Doc comments are Markdown, rendered by `cargo doc`, and fenced examples inside them are compiled and run by `cargo test`.',
    fit: 'close',
  },

  // ---------------------------------------------------------------------------
  // syntax
  // ---------------------------------------------------------------------------
  {
    id: 'p-switch-expression',
    category: 'syntax',
    csharp: code`
      var fee = tier switch { Tier.Free => 0, Tier.Pro => 900, _ => 2900 };
    `,
    rust: code`
      let fee = match tier { Tier::Free => 0, Tier::Pro => 900, Tier::Team => 2900 };
    `,
    note: '`match` must be exhaustive, so listing every variant instead of `_` makes adding a new tier a compile error at every match. C# only warns.',
    fit: 'close',
  },
  {
    id: 'p-property-pattern',
    category: 'syntax',
    csharp: code`if (order is { Status: OrderStatus.Paid, Total: > 10_000 }) FlagForReview(order);`,
    rust: code`
      if let Order { status: OrderStatus::Paid, total: 10_001.., .. } = order { flag_for_review(order); }
      if order.status == OrderStatus::Paid && order.total > 10_000 { ... }
    `,
    note: 'Struct patterns and range patterns exist, but there is no relational `>` pattern: `> 10_000` becomes the range `10_001..`, and range bounds must be constants. A plain boolean condition or a match guard is often clearer.',
    fit: 'close',
  },
  {
    id: 'p-is-type-pattern',
    category: 'syntax',
    csharp: code`if (evt is PaymentFailed failed) Notify(failed.Reason);`,
    rust: code`if let Event::PaymentFailed { reason } = &evt { notify(reason); }`,
    note: 'Type tests become variant tests on an enum. Matching on `&evt` binds `reason` as a reference so `evt` is not moved.',
    fit: 'close',
  },
  {
    id: 'p-matches-macro',
    category: 'syntax',
    csharp: code`bool terminal = state is JobState.Done or JobState.Failed;`,
    rust: code`let terminal = matches!(state, JobState::Done | JobState::Failed);`,
    note: 'The `matches!` macro is a boolean pattern test, including guards: `matches!(n, 1..=9 if n % 2 == 1)`.',
    fit: 'direct',
  },
  {
    id: 'p-foreach',
    category: 'syntax',
    csharp: code`foreach (var order in orders) Ship(order);`,
    rust: code`
      for order in &orders { ship(order); }     // borrows
      for order in orders { archive(order); }   // consumes orders
    `,
    note: '`for x in orders` moves the collection into the loop and it is gone afterwards. Iterating `&orders` or `&mut orders` is the usual choice.',
    fit: 'close',
    seeAlso: { kind: 'drill', id: 'move-in-loop' },
  },
  {
    id: 'p-for-loop',
    category: 'syntax',
    csharp: code`for (int i = 0; i < pages; i++) Fetch(i);`,
    rust: code`for i in 0..pages { fetch(i); }`,
    note: 'No C-style `for`. Ranges are half-open (`0..n`) or inclusive (`0..=n`), and `(0..n).rev().step_by(2)` covers the rest.',
    fit: 'close',
  },
  {
    id: 'p-ranges-index',
    category: 'syntax',
    csharp: code`var middle = items[1..^1];`,
    rust: code`let middle = &items[1..items.len() - 1];`,
    note: 'There is no from-end `^` index. The slice borrows instead of copying (C# ranges on arrays allocate), and an empty `items` makes `len() - 1` underflow and panic.',
    fit: 'close',
  },
  {
    id: 'p-nameof',
    category: 'syntax',
    csharp: code`throw new ArgumentException("must be positive", nameof(quantity));`,
    rust: code`return Err(format!("{} must be positive", stringify!(quantity)));`,
    note: '`stringify!` turns tokens into a string but does not check that the name refers to anything, so renames do not update it. In practice people write the literal.',
    fit: 'different',
  },
  {
    id: 'p-attributes',
    category: 'syntax',
    csharp: code`[Obsolete("Use SubmitAsync")] public void Submit() { }`,
    rust: code`
      #[deprecated(note = "use submit_async")]
      pub fn submit() {}
    `,
    note: 'Attributes are not metadata you read by reflection at runtime. Built-ins steer the compiler, and derive or attribute macros generate code at compile time.',
    fit: 'close',
  },
  {
    id: 'p-conditional-compilation',
    category: 'syntax',
    csharp: code`
      #if DEBUG
      _log.LogDebug("payload {Payload}", payload);
      #endif
    `,
    rust: code`
      #[cfg(debug_assertions)]
      tracing::debug!(?payload, "payload");
    `,
    note: '`#[cfg]` attaches to an item, statement or expression and removes it before type checking. `cfg!(...)` is the expression form that keeps both branches compiled.',
    fit: 'close',
  },
  {
    id: 'p-using-namespace',
    category: 'syntax',
    csharp: code`
      namespace Billing.Invoices;
      using Billing.Tax;
    `,
    rust: code`
      // src/invoices.rs is module crate::invoices
      use crate::tax::vat;
    `,
    note: 'Modules follow the file tree and must be declared with `mod invoices;` in the parent. `use` imports specific items, not whole namespaces, unless you write `::*`.',
    fit: 'different',
  },
  {
    id: 'p-lambda',
    category: 'syntax',
    csharp: code`Func<Order, bool> isLarge = o => o.Total > threshold;`,
    rust: code`let is_large = |o: &Order| o.total > threshold;`,
    note: 'Closures capture by reference unless they must own, and `move` forces ownership. Each closure has its own unnamed type, so storing them uses generics or `Box<dyn Fn(&Order) -> bool>`.',
    fit: 'close',
  },
  {
    id: 'p-ternary',
    category: 'syntax',
    csharp: code`var label = qty == 1 ? "item" : "items";`,
    rust: code`let label = if qty == 1 { "item" } else { "items" };`,
    note: '`if` is an expression, as are `match` and blocks. There is no `?:` operator.',
    fit: 'direct',
  },
  {
    id: 'p-while-pattern',
    category: 'syntax',
    csharp: code`while (reader.ReadLine() is { } line) Process(line);`,
    rust: code`for line in reader.lines() { process(&line?); }`,
    note: '`while let Some(x) = next()` is the general form. `lines()` yields `io::Result<String>`, so each line can fail independently.',
    fit: 'close',
  },
  {
    id: 'p-labeled-break',
    category: 'syntax',
    csharp: code`goto done; // breaking out of nested loops`,
    rust: code`
      'rows: for row in &grid {
          for cell in row { if cell.is_empty() { break 'rows; } }
      }
    `,
    note: 'Labeled `break` and `continue` replace `goto`. `loop` can also return a value: `let id = loop { break next_id(); };`.',
    fit: 'close',
  },
];
