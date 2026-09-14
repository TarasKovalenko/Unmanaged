# Unmanaged

[![CI](https://github.com/TarasKovalenko/Unmanaged/actions/workflows/ci.yml/badge.svg)](https://github.com/TarasKovalenko/Unmanaged/actions/workflows/ci.yml)

Rust for people who write C#.

Unmanaged teaches Rust to experienced C# and .NET developers. It does not re-explain generics, closures or async. It concentrates on the places where C# intuition gives the wrong answer, and it is built around interaction rather than prose: you watch borrows collide, step through async code on a clock, diagnose real compiler errors before seeing the fix, and run and edit the code yourself.

## What is in it

**Six tracks**, in the order the problems tend to hit: ownership and borrowing, `Option`/`Result`, struct semantics, `Rc<RefCell<T>>`, async, and reading rustc errors. Every lesson has the same three beats:
1. the C# you already write,
2. the Rust equivalent, side by side, with linked line annotations (hover a line in one pane to light up its partner),
3. where the analogy breaks, which is mandatory.

**Run and edit code.** Rust and C# blocks have Run and Edit buttons. Change a drill's broken program into your fix and run it; break a snippet that compiles and read what rustc says. See [Running code](#running-code).

**Borrow visualizer.** One track per variable, with bars for owned, shared-borrowed, mutably-borrowed, moved (cut) and dropped (fade). Scrub a cursor down the code to read every variable's state on that line. When borrows collide, the bars turn red, the offending code gets rustc's own underlines, and the real error is shown with a C#-framed explanation. `RefCell` snippets show the same rule enforced at runtime.

**Async timelines.** The same program in C# and Rust on a shared clock: which code runs at each step, and which tasks are running, suspended, blocked, or (in Rust's case) created but never polled. Both sides' output is verified by running them.

**Error drills.** A rustc error and the code behind it. Pick a diagnosis first; then see why each option is right or wrong, the idiomatic fix, and fixes that compile but are worse or still broken. Your first answer is kept locally, so you can return to the ones you missed.

**Gotcha cards, phrasebook, mini-projects, error index, search.** Searchable traps each proven by a program; C#-to-Rust translations rated by how faithful they are; four .NET-style projects with milestones and a .NET-to-Rust ecosystem map; every error code on the site; Ctrl/Cmd-K across everything.

No progress rings, streaks or points. Read markers, drill answers and milestone checkboxes live in `localStorage`.

## Running code

Rust and C# cannot be compiled inside a browser tab, so Run sends code to a server. The app picks a backend automatically:

| Backend | Languages | When it is used |
|---|---|---|
| **Code runner** (`runner/`, ASP.NET Core) | Rust (rustc 1.97.1) and C# (.NET 10, Roslyn) | Whenever `GET {VITE_RUNNER_URL}/info` answers. Default URL `/api`. |
| **Rust Playground** (play.rust-lang.org) | Rust only | When no runner answers. Disable with `VITE_RUST_PLAYGROUND=off`. |

If neither is available for a language, no Run button is shown for it.

The runner compiles C# the way `dotnet new console` would (implicit usings, nullable enabled, top-level statements) and runs it with `dotnet exec`. Code without an entry point, such as a class excerpt, is type-checked instead. Rust is a single file compiled with `rustc --edition 2024`; there are no crates.

### Security model

The runner executes arbitrary code sent by visitors. `docker-compose.yml` is the supported deployment, and every layer below is tested:

- **Network:** the runner container sits on an `internal` Docker network. It has no route to the internet, and only nginx can reach it. (Tested: `HttpClient` to example.com fails.)
- **Filesystem:** the root filesystem is read-only, and there is a 512 MB `/tmp` for builds. (Tested: writing to `/app` fails.)
- **Privileges:** it runs as a non-root user with all capabilities dropped and `no-new-privileges`.
- **Resources:**
  - The container is limited to 1.5 GB of memory, 2 CPUs and 512 PIDs.
  - Each program gets a 5 s wall-clock timeout plus CPU-time, memory and file-size ulimits. Process count is limited by the container, not per program, because `ulimit -u` counts the runner user's own threads too.
  - Each program's process group is killed when its run ends. (Tested: a fork bomb returns in milliseconds and leaves no orphans; a 4 GB file write is killed at 10 MB.)
  - C# heap is capped at 256 MB. (Tested: a memory bomb gets `OutOfMemoryException`.)
  - Output is capped at 64 KB per stream, and code at 64 KB.
- **Abuse:** 30 runs per client IP per minute and a concurrency cap; excess requests get 429 or 503.

For a public deployment, also run the runner under gVisor (`runtime: runsc` in the compose file) and put the site behind your usual edge protection. Do not expose the runner's port directly.

## Setup

Requires Node 22.18+. Running code locally also needs the .NET 10 SDK, and rustc 1.97.1 with the `rust-src` component for Rust.

**Development: site plus a local runner**

```sh
npm install
npm run runner       # terminal 1: code runner on http://localhost:8080
npm run dev          # terminal 2: http://localhost:5173, proxies /api to the runner
```

Without `npm run runner`, the dev site still works: Rust runs on the Rust Playground and C# has no Run button.

**Everything in Docker, with the sandboxing described above**

```sh
docker compose up --build        # http://localhost:8000
```

**Static only** (any static host, no server): `npm run build` and serve `dist/`. Rust runs on the Rust Playground; set `VITE_RUST_PLAYGROUND=off` at build time to disable running altogether.

### Commands

```sh
npm run build          # type-check and build static files into dist/
npm test               # frontend unit tests (Vitest + Testing Library)
npm run coverage       # frontend coverage gate: fails below 100% lines, branches, functions, statements
dotnet test runner.Tests   # runner tests: compile, run, timeouts, output caps, sandbox limits, API
runner.Tests/coverage.sh   # runner coverage gate: runs the suite in a Linux container and on the host, merges, fails below 100% line/branch (needs Docker)
npm run lint
npm run check:content  # validate all content (see CONTENT.md); needs rustc 1.97.1, and dotnet for the C# pass
```

## What it does not do

- **Outputs in lessons are not produced live.** Every output, compiler error and panic shown in the content was verified ahead of time by `npm run check:content`: Rust with rustc 1.97.1 (edition 2024), C# with the runner's Roslyn setup. Pressing Run gives you a live result, which can differ if the backend has a different version (the Rust Playground tracks the latest stable).
- **Code that needs crates does not run.** tokio, axum and serde aren't available to rustc here or on the checker. That code is marked "not compiled: needs crates", and the mini-projects are for your own machine.
- **Many C# snippets are excerpts.** They use types defined elsewhere, so they don't compile on their own; the UI says so when you try. Complete C# programs, including every timeline, were run and their output checked.
- **Borrow spans and timeline events are drawn by hand.** They follow the compiler's and runtimes' models at a readable granularity; they are not produced by analysing the code.
- **Projects are not graded.**
- **No accounts, no tracking.** Code you run is sent to the backend above and nowhere else. The runner keeps nothing after the run; the Rust Playground has its own policies.

## Project layout

```
src/
  content/         lessons, snippets, drills, gotchas, timelines, projects, phrasebook (see CONTENT.md)
    generated/     csharp.json: which C# snippets are programs, excerpts, or don't compile (from check:content)
  components/      BorrowVisualizer, TimelineView, DrillCard, ComparePanes, Runnable (run/edit), SearchPalette, …
  lib/             pure logic: span layout, rustc/panic parsing, runner client, playground parsing, search, routing, storage
  pages/
runner/            ASP.NET Core code runner (C# via Roslyn, Rust via rustc); also a batch mode for the checker
runner.Tests/      xUnit tests for the runner
docker/            runner and web Dockerfiles, nginx config
scripts/
  check-content.ts compiles and runs every Rust and C# program in content and validates the content model
  paste-output.ts  prints real compiler or panic output ready to paste into content
tests/             frontend unit tests
```
