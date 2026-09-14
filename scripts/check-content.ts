// Validates everything under src/content.
//
//   npm run check:content                      structural checks + check every Rust program
//   npm run check:content -- --no-rustc        structural checks only
//   npm run check:content -- --dump            also write rustc/run output to .content-check/<id>.txt
//   npm run check:content -- --only drill/,gotcha/string   only Rust units whose id contains one of these
//   npm run check:content -- --no-dotnet       skip the C# pass (keeps the existing generated file)
//
// The C# pass compiles every C# snippet with the runner's own Roslyn setup
// (runner/, via `dotnet run -- check-csharp`), records which snippets are
// full programs, compile-only excerpts, or excerpts that reference types not
// shown, into src/content/generated/csharp.json, and verifies the output of
// C# timelines by running them.
//
// Requires Node 22.18+ (native TypeScript type stripping) and, unless
// --no-rustc is passed, `rustc` on PATH at the version in src/content/meta.ts.
//
// The logic lives in scripts/lib/checkContent.ts.

import { main, nodeDeps } from './lib/checkContent.ts';

const code = await main(process.argv.slice(2), nodeDeps());
if (code !== 0) process.exit(code);
