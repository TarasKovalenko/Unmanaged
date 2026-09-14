import type { EcosystemEntry } from '../types.ts';

export const ecosystem: EcosystemEntry[] = [
  {
    dotnet: 'NuGet + .csproj',
    rust: 'Cargo + Cargo.toml',
    note: 'Cargo is the build tool, package manager, test runner and doc generator in one, and `Cargo.lock` pins the resolved graph. Crate features (`features = ["derive"]`) replace separate add-on packages.',
  },
  {
    dotnet: 'Directory.Build.props / Directory.Packages.props',
    rust: 'Cargo workspaces (`[workspace.dependencies]`)',
    note: 'A workspace shares one lockfile, one `target/` directory and centrally declared dependency versions that members opt into with `workspace = true`.',
  },
  {
    dotnet: 'ASP.NET Core Minimal API',
    rust: 'axum (on tokio + hyper)',
    note: 'Handlers are plain async functions whose parameters are extractors, much like Minimal API parameter binding. There is no hosting model or DI container, so you build the router and its state explicitly in `main`.',
  },
  {
    dotnet: 'ASP.NET Core middleware',
    rust: 'tower layers (`tower`, `tower-http`)',
    note: 'Middleware is a `Service` wrapped by a `Layer`, composed with `ServiceBuilder` or `Router::layer`. `tower-http` provides the usual suspects: tracing, CORS, compression, timeouts, request ids.',
  },
  {
    dotnet: 'System.CommandLine',
    rust: 'clap',
    note: 'The derive API turns a struct with doc comments into a parser with help text, subcommands and validation. It is stable and ubiquitous, where System.CommandLine spent years in preview.',
  },
  {
    dotnet: 'System.Text.Json',
    rust: 'serde + serde_json',
    note: 'serde generates (de)serialisation code at compile time via `#[derive(Serialize, Deserialize)]`, closer to the STJ source generator than to reflection. The same derives work for TOML, YAML, MessagePack and others.',
  },
  {
    dotnet: 'xUnit / NUnit / MSTest',
    rust: '`#[test]` + `cargo test`',
    note: 'The test harness is built in: no package, no runner adapter. Parameterised tests, fixtures and snapshot testing come from crates like `rstest` and `insta`.',
  },
  {
    dotnet: 'FluentAssertions / Shouldly',
    rust: 'pretty_assertions, assert_matches',
    note: 'Most tests use plain `assert_eq!` and `assert!(matches!(..))`. `pretty_assertions` adds coloured diffs; there is no widely used fluent assertion DSL.',
  },
  {
    dotnet: 'Moq / NSubstitute',
    rust: 'mockall (and traits as seams)',
    note: 'Without runtime proxies, mocking needs a trait at the seam; `mockall` generates implementations from it. Many Rust codebases prefer hand-written fakes or testing against real in-memory implementations.',
  },
  {
    dotnet: 'Serilog / Microsoft.Extensions.Logging',
    rust: 'tracing + tracing-subscriber',
    note: 'Structured fields and spans are first class (`info!(order_id, "shipped")`), and subscribers decide output format and filtering. The `log` crate still exists but new code generally uses `tracing`.',
  },
  {
    dotnet: 'OpenTelemetry .NET',
    rust: 'opentelemetry + tracing-opentelemetry',
    note: 'The usual setup keeps `tracing` as the instrumentation API and exports its spans through the `tracing-opentelemetry` layer. The OpenTelemetry Rust crates change more between versions than their .NET counterparts.',
  },
  {
    dotnet: 'Entity Framework Core',
    rust: 'sqlx, diesel, SeaORM',
    note: 'sqlx is not an ORM: you write SQL, and its `query!` macros check it against a real database schema at compile time. diesel is a typed query builder; SeaORM is the closest to EF, with entities and an async active-record style, but there is no `DbContext`-style change tracker or unit of work.',
  },
  {
    dotnet: 'HttpClient / IHttpClientFactory',
    rust: 'reqwest',
    note: 'A `reqwest::Client` holds a connection pool and is cheap to clone, so you create one and share it, avoiding the socket exhaustion problem without a factory.',
  },
  {
    dotnet: 'IConfiguration + Options pattern',
    rust: 'config or figment + serde',
    note: 'Layer files and environment variables, then deserialise into a plain struct once at startup. There is no `IOptionsMonitor` reload story out of the box; you pass the struct (or an `Arc` of it) to whoever needs it.',
  },
  {
    dotnet: 'Microsoft.Extensions.DependencyInjection',
    rust: 'No standard container (explicit construction, axum `State`)',
    note: 'Services are constructed in `main` and passed down as arguments or held in an `Arc`ed app state struct. Generics and trait objects provide the substitution points that DI registration gives you in .NET.',
  },
  {
    dotnet: 'MediatR',
    rust: 'None (plain function calls and traits)',
    note: 'The indirection MediatR adds is rarely reproduced. A handler is a function or a trait method you call directly; cross-cutting behaviour goes in tower layers or wrapper functions.',
  },
  {
    dotnet: 'Polly',
    rust: 'tower middleware (retry, timeout, rate limit), backon',
    note: 'tower provides retry, timeout, concurrency limit and load shedding as layers for any `Service`. For retrying arbitrary async calls, `backon` offers exponential backoff with jitter (the older `backoff` crate is unmaintained).',
  },
  {
    dotnet: 'Task Parallel Library / async runtime',
    rust: 'tokio',
    note: 'Rust ships no async runtime in std; tokio is the de facto choice and provides the executor, timers, sockets, sync primitives and `spawn`. CPU-bound data parallelism goes to `rayon` instead.',
  },
  {
    dotnet: 'System.Threading.Channels',
    rust: 'tokio::sync::mpsc (also broadcast, watch, oneshot)',
    note: 'Bounded `mpsc` gives backpressure like `Channel.CreateBounded`. The channel closes when all senders drop, and tokio adds `oneshot` for request/response and `watch` for latest-value state.',
  },
  {
    dotnet: 'BackgroundService / IHostedService',
    rust: 'tokio::spawn + CancellationToken (tokio-util)',
    note: 'A long-running task is a spawned future with a loop and a `select!` on a cancellation token. Graceful shutdown is wired by hand: listen for `ctrl_c`, cancel, then await the task handles.',
  },
  {
    dotnet: 'Parallel.ForEach / PLINQ',
    rust: 'rayon',
    note: 'Swap `iter()` for `par_iter()` and rayon runs the pipeline on a work-stealing pool. The compiler rejects closures that would race on shared state.',
  },
  {
    dotnet: 'BenchmarkDotNet',
    rust: 'criterion (or divan)',
    note: 'criterion runs warmups and statistical analysis and reports changes against a saved baseline; divan is a lighter attribute-based alternative. Benchmarks live in `benches/` (with `harness = false`) and run with `cargo bench`.',
  },
  {
    dotnet: 'Roslyn analyzers',
    rust: 'clippy',
    note: 'Clippy ships with rustup and is the default lint pass in CI. Custom project-specific analyzers are much rarer than in .NET; `dylint` exists but few teams use it.',
  },
  {
    dotnet: 'dotnet format / .editorconfig',
    rust: 'rustfmt (`cargo fmt`)',
    note: 'One formatter, almost no configuration, and nearly every project uses the defaults. CI typically runs `cargo fmt --check`.',
  },
  {
    dotnet: 'Swashbuckle / NSwag',
    rust: 'utoipa',
    note: 'OpenAPI documents are generated from derive macros on your types and handler attributes, not from runtime reflection over controllers.',
  },
];
