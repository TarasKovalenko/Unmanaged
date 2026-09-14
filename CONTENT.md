# Authoring content

Everything a learner reads lives in `src/content/` as typed data. You should be able to add a snippet, a lesson, or a whole track without touching `src/components/`.

```
src/content/
  types.ts            the content model (read this first)
  code.ts             `code` template tag and `lines()` helper
  meta.ts             rustc version + edition the content was verified against
  validate.ts         structural checks (also run in dev, printed to the console)
  index.ts            everything in one object, used by the checker and search
  errors.ts           one-line summaries for the error index
  borrow/             borrow-visualizer snippets (one file each; extra/ holds per-track arrays)
  tracks/<track>/     one file per lesson, plus index.ts exporting the ordered lessons
  drills/<track>.ts   compiler-error drills, one array per track
  gotchas/            gotcha cards
  timelines/          async execution timelines
  projects/           mini-projects (list.ts) and the .NET-to-Rust ecosystem map
  phrasebook/         C#-to-Rust phrase entries
```

## The checker

```sh
npm run check:content                          # structure + every Rust program
npm run check:content -- --no-rustc            # structure only
npm run check:content -- --only drill/,gotcha/g-string   # only units whose id contains one of these
npm run check:content -- --dump --only drill/my-drill     # also save output to .content-check/
npm run paste-output -- drill/my-drill         # print that output escaped for a TS template literal
npm run check:content -- --no-dotnet           # skip the C# pass
```

Every Rust program in content is complete (it has `fn main`) and declares what should happen to it. The checker needs `rustc` at the version in `src/content/meta.ts`, with the `rust-src` component (`rustup component add rust-src`). Without it, rustc prints notes that point into the standard library differently, so the checker stops early and says so. It enforces:

| `expect` | the checker |
|---|---|
| `compiles` | compiles it. If `stdout` (or a timeline's `output`) is set, also runs it and compares stdout verbatim |
| `fails` | requires a compile error; the error codes and any authored `message` must match rustc verbatim |
| `panics` | compiles and runs it; it must panic, and any authored panic `message` must match verbatim |
| `unchecked` | skips it. Only for code that needs crates (tokio, serde, axum); requires `uncheckedReason`, and the UI labels it "not compiled" |

Unit ids, for `--only`: `borrow/<id>`, `lesson/<id>/rust`, `lesson/<id>/break-<n>`, `drill/<id>`, `drill/<id>/fix-<n>`, `gotcha/<id>`, `timeline/<id>/rust`, `project/<id>/<milestone>`.

It also fails on structural problems: spans or links outside the code, references to ids that don't exist, a drill without exactly one correct option, an empty beat 3, duplicate ids, and any authored output that contains a local filesystem path. (With the `rust-src` component installed, rustc points notes at `~/.rustup/...`; the checker rewrites those to the portable `/rustc/<commit>/` form before comparing or dumping.)

### The C# pass

After the Rust checks, the checker compiles every C# snippet (lesson panes, C# break-point code, visualizer C# equivalents, gotcha C# lines, timelines) through the runner's own Roslyn setup: `dotnet run --project runner -- check-csharp`. It needs the .NET 10 SDK; pass `--no-dotnet` to skip it.

- Each snippet is classified as a complete program (runs), code without an entry point that compiles (compiles), or code that only works alongside types not shown (excerpt). The result is written to `src/content/generated/csharp.json`, keyed by a hash of the code. Commit it: the UI uses it to label C# Run buttons and explain excerpt errors, and it goes stale when C# code changes.
- **Timeline C# must be a complete program**, and its `output` must match what it really prints, verbatim. Output that depends on timing is retried once before failing; use delays with a margin of at least 100 ms.
- Prefer C# lesson panes that compile on their own: put top-level statements first and types after them (C# rejects the reverse with CS8803), and define small helpers locally instead of referencing types that don't exist.

Panic output contains a per-run thread id (`thread 'main' (17287168) panicked`); the checker and `paste-output` strip it, so author it without.

## Line numbers

Wrap all code in the `code` tag. It removes the leading newline and the common indentation, so you can indent snippets naturally inside TypeScript:

```ts
code: code`
  fn main() {          // line 1
      let v = vec![1]; // line 2
  }                    // line 3
`,
```

Line numbers everywhere (spans, links, rustc output) are 1-based and count from the first line inside the tag. Use `lines(7, 10)` for ranges in lesson links.

Inside `code`, escape a backtick as `` \` ``. Rust escapes like `\n` are kept literally, which is what you want.

## Adding a borrow snippet

1. **Write the Rust.** Keep it a complete program with `fn main`, under ~20 lines, and realistic: orders, invoices, connection strings, not `foo` and `bar`. Decide up front whether it compiles. The library should stay roughly half and half, because learners need to see what fine looks like.

2. **Create `src/content/borrow/<id>.ts`:**

   ```ts
   import { code } from '../code.ts';
   import type { BorrowSnippet } from '../types.ts';

   export const readThenWrite: BorrowSnippet = {
     id: 'read-then-write',            // URL: #/visualizer/read-then-write
     title: 'Read first, then write',   // sentence case, no trailing period
     summary: 'One sentence on what this demonstrates.',
     variables: ['orders'],             // optional: track order, left to right
     code: code`
       ...
     `,
     spans: [ ... ],
     conflicts: [],                     // empty = compiles
     takeaway: 'Required when conflicts is empty.',
     pairedWith: 'mutate-while-iterating', // optional: the broken/fixed counterpart
     csharpEquivalent: code`...`,       // optional, shown collapsed
     csharpNote: 'What the C# does at runtime.',
   };
   ```

3. **Register it** in `src/content/borrow/index.ts` (import and add to `borrowSnippets` in the order it should appear).

4. **Reference it** from a lesson's `visualize: ['read-then-write']` if it belongs in the track.

5. Run `npm run check:content`.

## Authoring spans

Spans are drawn by hand. Nothing infers them. The goal is to show the model rustc uses, simplified to whole lines, not to reproduce the compiler's analysis.

A span sits on **one variable's track**, covers `startLine`..`endLine` inclusive, and has a kind:

| kind | meaning | how it is drawn | end line is |
|---|---|---|---|
| `owned` | the variable owns a live value | solid oxide bar | last line shown as owned (use when the value outlives the snippet) |
| `moved` | owned, then moved away | solid bar with a cut mark | the line that moves it |
| `dropped` | owned, then dropped | solid bar that fades out | the line where the drop happens (usually the closing `}`) |
| `borrow` | a shared `&` borrow of this variable is alive | lighter, striped | the reference's **last use**, not its scope end |
| `borrow_mut` | an exclusive `&mut` borrow is alive | bold ochre bar | the reference's last use |

Rules of thumb:

- **Borrows go on the lender's track.** `let next = &queue[0];` is a `borrow` span with `variable: 'queue'`, labelled `next = &queue[0], used on line 5`. The reference variable `next` does not get its own track.
- **Borrows end at last use.** Non-lexical lifetimes are one of the most useful things to show. If the reference is last read on line 4, the span ends on line 4 even if the variable is in scope until line 9.
- **Temporary borrows are one line.** A method call like `v.push(x)` is `borrow_mut` on that line only; `println!("{v:?}")` is a one-line `borrow`.
- **Reassignment hands over.** `x = new_value;` ends the old `dropped` span and starts a new ownership span on the same line. The visualizer draws them meeting mid-row.
- **Parameters inside a called function** can get their own track with a qualified name, e.g. `archive::invoice`.
- **Labels are short and concrete.** They appear in tooltips and in the line-by-line readout. Say what happens on which line: `moved into archive() on line 12`, not `ownership transferred`.
- **Copy types** still get a `dropped` span at scope end, and the label should say why assignment did not move them.

## Authoring conflicts

A conflict connects **two span indices** (0-based, into `spans`) that rustc rejects together, usually the borrow that is alive and the use that breaks the rule.

```ts
conflicts: [
  {
    spans: [1, 2],        // [the existing borrow/ownership, the violating use]
    errorCode: 'E0502',
    message: `...`,       // verbatim rustc output, see below
    explanation: '...',   // plain English, framed against C#
  },
],
```

**Getting `message`:** do not write it by hand.

1. Author the snippet with `message: 'error[E0502]: TODO'`.
2. Run `npm run check:content -- --dump`.
3. Open `.content-check/borrow__<id>.txt` and copy everything from `error[` up to, but not including, the `error: aborting due to` line.
4. Paste it into a template literal, escaping backticks as `` \` ``.
5. Run the check again. It verifies the text is verbatim.

The visualizer parses the `^^^` and `---` markers in that output to underline the offending code, so a real message gives you inline annotations for free.

**Writing `explanation`:** start from what the C# developer expects to happen, then say what Rust does and why. Name the C# behaviour precisely (`List<T>`'s version check, GC reachability, `using` disposal). One paragraph. No "simply", no "just".

The conflict is shown as **live** on the lines covered by whichever of its two spans starts later, so the order of the two indices does not matter.

## Adding a lesson

Create `src/content/tracks/<track>/<nn>-<id>.ts` exporting a `Lesson`, then add it to that track's `lessons` array in `src/content/tracks/index.ts`.

Every lesson has the same three beats, and all three are required:

1. **`csharp`**: the C# you already write. Production-shaped: a service, a repository, a parser. Not `Foo`. It is not compiled, so read it twice.
2. **`rust`**: the Rust equivalent. It must compile (the checker enforces this). Prefer the idiomatic translation over a literal one, and let `links` explain the gaps.
3. **`breaks`**: where the analogy breaks. This is the product. Each break point is a one-line `heading`, a `body` of short paragraphs, and optional `code` with `expect: 'compiles' | 'fails'` (Rust code is checked either way).

`links` connect lines across the two panes. Hovering or tapping a line in either pane highlights its partner and shows the `note`. Every important line of the Rust should be covered by some link; not every line of the C# needs one.

```ts
links: [
  { csharp: [8], rust: [11], note: 'Identical syntax, different operation...' },
  { csharp: [5, 10], rust: lines(17, 19), note: '...' },
],
```

`intro`, `body` and notes support `` `inline code` `` and `**strong**`. Nothing else.

`takeaways` are two or three lines the reader should carry into the next lesson.

## Adding a track

Tracks are listed in `src/content/tracks/index.ts`. A track with `status: 'planned'` shows on the home page as not written yet. Switch it to `'available'` once it has at least one lesson; the checker refuses an available track with no lessons.

## Style

- Write for someone with ten years of C#. Skip anything that maps cleanly in one sentence.
- Sentence case for titles. No exclamation marks.
- Name real .NET types and behaviours. Vague comparisons ("like in other languages") teach nothing.
- If a Rust feature is covered by a later track, say which, and move on.
- When rustc gets a new version, run the checker. Update `meta.ts` only after messages have been re-pasted and pass.

## Runtime conflicts (RefCell)

A borrow snippet can show the aliasing rule enforced at runtime. Mark the borrow spans `checked: 'runtime'` (drawn dashed) and the conflict `phase: 'runtime'` with `errorCode: 'panic'`. The program must compile and panic; paste the panic output (`thread 'main' panicked at src/main.rs:6:10:` plus the message line) with `paste-output`. The visualizer underlines the call at the reported column. A snippet cannot mix compile and runtime conflicts.

Remember that a `Ref`/`RefMut` guard is a value with `Drop`: its span runs to the end of its scope, not to its last use.

## Drills

`src/content/drills/<track>.ts` exports an array of `Drill`. A drill is diagnose-before-reveal:

- `code`: a complete program that fails to compile (`outcome: 'compile-error'`, real `errorCode`) or panics (`outcome: 'panic'`, `errorCode: 'panic'`).
- `message`: pasted verbatim.
- `options`: 3 or 4, exactly one `correct: true`. Write them in any order; the UI shuffles them deterministically per drill id, so the correct answer is not always first. Every option has a `why`. Wrong options should be the misdiagnoses a C# developer would actually make, not filler.
- `fixes`: the first is `idiomatic`. Include at least one `works-but` (compiles, and says why it is worse: a clone, an `Rc<RefCell>`, a lost guarantee) and ideally a `wrong` one whose note explains the new error. `idiomatic` and `works-but` fixes must compile.
- `csharpReflex` (optional): the habit that produces the bug.

Reference drills from a lesson with `drills: ['id']`; they appear at the end of the lesson and on `#/drills`. The first answer per drill is stored locally so the drills page can offer "missed" for review.

## Gotcha cards

`src/content/gotchas/*.ts`. One assumption, one reality, one tiny program. Prefer `expect: 'compiles'` with `stdout` whenever the output makes the point; use `fails` with `errorCode`, or `panics`. Don't set `stdout` for nondeterministic output (HashMap iteration order).

Integer overflow on constants is a compile-time lint error; use `std::hint::black_box` to demonstrate the runtime panic.

## Async timelines

`src/content/timelines/*.ts`. Two programs on a shared clock of `ticks` abstract steps. For each side:

- `events`: lane, kind (`running`, `waiting`, `inert`, `blocked`, `done`, `dropped`), inclusive `start`/`end` ticks, optional label.
- `lineAtTick`: the executing line for every tick (0 for none); length must equal `ticks`.
- `output`: what the program prints. For the Rust side with `expect: 'compiles'` this is verified by running it. The C# side is not compiled: reason about it carefully.

Keep the Rust side std-only where possible. A minimal `block_on` using `Waker::noop()` is enough to demonstrate laziness, polling order and blocking without tokio.

## Projects and the ecosystem map

`src/content/projects/list.ts` holds `Project`s: a spec, crates with their .NET equivalents, and milestones. Each milestone has a goal, progressive hints (revealed one at a time), a concrete checkpoint the learner can verify on their machine, and optional code. `toml` and `shell` code is never checked; Rust using crates must be `unchecked` with a reason. `exercises` lists track ids.

`src/content/projects/ecosystem.ts` is the .NET-to-Rust library table.

## Phrasebook

`src/content/phrasebook/phrases.ts`. Short C# on the left, closest Rust on the right, and an honest `fit`: `direct`, `close`, or `different`. Phrase code is not compiled, so keep it to one to three lines and double-check method names.

## Error index

`#/errors` is built from every error code used by snippets, drills and gotchas. Add a one-line summary for new codes to `src/content/errors.ts`; codes without one still get a page.
