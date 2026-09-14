using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Unmanaged.Runner;
using Unmanaged.Runner.Execution;
using Unmanaged.Runner.Tests.Support;

namespace Unmanaged.Runner.Tests;

/// <summary>Against the real rustc, when it is installed.</summary>
public sealed class RustExecutorTests
{
    private static RustExecutor Executor(Action<RunnerOptions>? configure = null)
    {
        var options = new RunnerOptions { RunTimeoutSeconds = 5 };
        configure?.Invoke(options);
        return new RustExecutor(Options.Create(options), NullLogger<RustExecutor>.Instance);
    }

    private static async Task<bool> RustAvailable() => await Executor().VersionAsync(CancellationToken.None) is not null;

    [Fact]
    public async Task Runs_a_program_and_captures_stdout()
    {
        if (!await RustAvailable()) return;
        var result = await Executor().RunAsync("fn main() { println!(\"{}\", 2 + 2); }", execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("4\n", result.Execution!.Stdout);
    }

    [Fact]
    public async Task Borrow_errors_come_back_verbatim_with_relative_paths()
    {
        if (!await RustAvailable()) return;
        var result = await Executor().RunAsync("fn main() { let s = String::new(); let t = s; println!(\"{s}\"); }", execute: true, CancellationToken.None);

        Assert.False(result.Compile.Success);
        Assert.Contains("error[E0382]: borrow of moved value: `s`", result.Compile.Output);
        Assert.Contains("--> src/main.rs:1:", result.Compile.Output);
        Assert.DoesNotContain("/tmp", result.Compile.Output);
    }

    [Fact]
    public async Task Panics_exit_101_without_thread_ids()
    {
        if (!await RustAvailable()) return;
        var result = await Executor().RunAsync("fn main() { let v: Vec<i32> = Vec::new(); let i = std::hint::black_box(3); println!(\"{}\", v[i]); }", execute: true, CancellationToken.None);

        Assert.Equal(101, result.Execution!.ExitCode);
        Assert.Matches(@"thread 'main' panicked at src/main\.rs:\d+:\d+:", result.Execution.Stderr);
    }

    [Fact]
    public async Task Infinite_loops_are_killed_at_the_timeout()
    {
        if (!await RustAvailable()) return;
        var result = await Executor(o => o.RunTimeoutSeconds = 1).RunAsync("fn main() { loop {} }", execute: true, CancellationToken.None);

        Assert.True(result.Execution!.TimedOut);
    }
}

/// <summary>Against a scripted stand-in for rustc (see <see cref="FakeRustc"/>), so every path runs on any machine.</summary>
public sealed class RustExecutorBehaviourTests : IDisposable
{
    private static readonly Dictionary<string, string> SystemPath = new() { ["PATH"] = "/usr/bin:/bin" };

    private readonly TempDirectory _directory = new();

    public void Dispose() => _directory.Dispose();

    private RustExecutor Executor(
        string rustc,
        Action<RunnerOptions>? configure = null,
        IReadOnlyDictionary<string, string>? environment = null,
        string? userProfile = null,
        ListLogger<RustExecutor>? logger = null)
    {
        var options = new RunnerOptions { Rustc = rustc, RunTimeoutSeconds = 5, CompileTimeoutSeconds = 10 };
        configure?.Invoke(options);
        var env = environment ?? SystemPath;
        return new RustExecutor(
            Options.Create(options),
            logger ?? new ListLogger<RustExecutor>(),
            name => env.GetValueOrDefault(name),
            userProfile ?? _directory.Combine("no-home"));
    }

    [Fact]
    public async Task Version_is_the_first_line_of_rustc_vV_and_is_asked_only_once()
    {
        var calls = _directory.Combine("calls");
        var executor = Executor(FakeRustc.Create(_directory, callsFile: calls));

        Assert.Equal(FakeRustc.Version, await executor.VersionAsync(CancellationToken.None));
        Assert.Equal(FakeRustc.Version, await executor.VersionAsync(CancellationToken.None));
        Assert.Equal("x", await File.ReadAllTextAsync(calls));
    }

    [Fact]
    public async Task Rust_is_unavailable_when_rustc_is_missing_and_a_warning_is_logged()
    {
        var logger = new ListLogger<RustExecutor>();
        var executor = Executor(_directory.Combine("missing", "rustc"), logger: logger);

        Assert.Null(await executor.VersionAsync(CancellationToken.None));
        var message = Assert.Single(logger.Messages);
        Assert.StartsWith($"Warning: rustc not available at '{_directory.Combine("missing", "rustc")}'", message);
        Assert.EndsWith("Rust support disabled.", message);
    }

    [Fact]
    public async Task Rust_is_unavailable_when_rustc_fails_and_it_is_asked_again_next_time()
    {
        var calls = _directory.Combine("calls");
        var executor = Executor(FakeRustc.Create(_directory, "error: toolchain not installed", versionExitCode: 1, callsFile: calls));

        Assert.Null(await executor.VersionAsync(CancellationToken.None));
        Assert.Null(await executor.VersionAsync(CancellationToken.None));
        Assert.Equal("xx", await File.ReadAllTextAsync(calls));
    }

    [Fact]
    public async Task Running_without_rustc_is_an_error()
    {
        var executor = Executor(_directory.Combine("missing", "rustc"));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => executor.RunAsync("fn main() {}", execute: true, CancellationToken.None));
        Assert.Equal("rustc is not available", error.Message);
    }

    [Fact]
    public async Task Compiles_with_the_configured_edition_then_runs_the_binary()
    {
        var executor = Executor(FakeRustc.Create(_directory), o => o.RustEdition = "2021");
        var code = "echo \"$@\" > args.txt\n" + FakeRustc.Emitting("read -r args < args.txt; echo \"$args\"; echo from-main");

        var result = await executor.RunAsync(code, execute: true, CancellationToken.None);

        Assert.Equal("rust", result.Language);
        Assert.Equal(FakeRustc.Version, result.Toolchain);
        Assert.Equal("run", result.Mode);
        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("", result.Compile.Output);
        Assert.Equal(
            "--edition 2021 --crate-type bin --crate-name main --color never -C debuginfo=0 --emit=link -o main src/main.rs\nfrom-main\n",
            result.Execution!.Stdout);
        Assert.Equal("", result.Execution.Stderr);
        Assert.Equal(0, result.Execution.ExitCode);
    }

    [Fact]
    public async Task Code_is_only_type_checked_when_execution_is_not_requested()
    {
        var executor = Executor(FakeRustc.Create(_directory));
        var code = "echo \"$@\" >&2\n" + FakeRustc.Emitting("echo should-not-run");

        var result = await executor.RunAsync(code, execute: false, CancellationToken.None);

        Assert.Equal("compile-only", result.Mode);
        Assert.True(result.Compile.Success);
        Assert.Contains("--emit=metadata -o main src/main.rs", result.Compile.Output);
        Assert.Null(result.Execution);
    }

    [Fact]
    public async Task Compile_errors_are_returned_without_running_and_std_paths_are_made_portable()
    {
        var executor = Executor(FakeRustc.Create(_directory));
        const string code = """
            echo 'error[E0382]: borrow of moved value' >&2
            echo '  --> /home/dev/.rustup/toolchains/1.97.1-aarch64-apple-darwin/lib/rustlib/src/rust/library/core/src/fmt/mod.rs:1:1' >&2
            echo '  --> /.rustup/toolchains/stable/lib/rustlib/src/rust/library/alloc/src/vec.rs:2:2' >&2
            exit 1
            """;

        var result = await executor.RunAsync(code, execute: true, CancellationToken.None);

        Assert.False(result.Compile.Success);
        Assert.Equal("run", result.Mode);
        Assert.Equal(
            "error[E0382]: borrow of moved value\n  --> /rustc/0123abcd/library/core/src/fmt/mod.rs:1:1\n  --> /rustc/0123abcd/library/alloc/src/vec.rs:2:2\n",
            result.Compile.Output);
        Assert.Null(result.Execution);
    }

    [Fact]
    public async Task Std_paths_use_an_unknown_commit_when_rustc_does_not_report_one()
    {
        var executor = Executor(FakeRustc.Create(_directory, "rustc 1.97.1-dev"));

        var result = await executor.RunAsync("echo '/x/.rustup/toolchains/dev/lib/rustlib/src/rust/library/std/src/lib.rs' >&2; exit 1", execute: true, CancellationToken.None);

        Assert.Equal("rustc 1.97.1-dev", result.Toolchain);
        Assert.Equal("/rustc/unknown/library/std/src/lib.rs\n", result.Compile.Output);
    }

    [Fact]
    public async Task A_compiler_that_hangs_is_killed_at_the_compile_timeout()
    {
        var executor = Executor(FakeRustc.Create(_directory), o => o.CompileTimeoutSeconds = 1);

        var result = await executor.RunAsync("echo partial >&2; exec sleep 30", execute: true, CancellationToken.None);

        Assert.False(result.Compile.Success);
        Assert.Equal("rustc timed out", result.Compile.Output);
        Assert.Null(result.Execution);
        Assert.InRange(result.Compile.DurationMs, 900, 5000);
    }

    [Fact]
    public async Task Panic_messages_lose_their_thread_ids()
    {
        var executor = Executor(FakeRustc.Create(_directory));
        var code = FakeRustc.Emitting("""
            echo "thread 'main' (48213) panicked at src/main.rs:1:40:" >&2
            echo "thread 'worker-1' (7) panicked at src/main.rs:2:1:" >&2
            exit 101
            """);

        var result = await executor.RunAsync(code, execute: true, CancellationToken.None);

        Assert.Equal(101, result.Execution!.ExitCode);
        Assert.Equal("thread 'main' panicked at src/main.rs:1:40:\nthread 'worker-1' panicked at src/main.rs:2:1:\n", result.Execution.Stderr);
    }

    [Fact]
    public async Task The_binary_runs_with_the_run_timeout()
    {
        var executor = Executor(FakeRustc.Create(_directory), o => o.RunTimeoutSeconds = 1);

        var result = await executor.RunAsync(FakeRustc.Emitting("exec sleep 30"), execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success);
        Assert.True(result.Execution!.TimedOut);
        Assert.InRange(result.Execution.DurationMs, 900, 5000);
    }

    [Fact]
    public async Task The_scratch_directory_is_removed_after_a_run()
    {
        var executor = Executor(FakeRustc.Create(_directory));

        var result = await executor.RunAsync("pwd >&2; exit 1", execute: true, CancellationToken.None);

        var scratch = result.Compile.Output.Trim();
        Assert.StartsWith("unmanaged-rs-", Path.GetFileName(scratch));
        Assert.False(Directory.Exists(scratch));
    }

    [NonRootFact]
    public async Task A_compile_that_leaves_an_undeletable_directory_still_gets_its_result()
    {
        var executor = Executor(FakeRustc.Create(_directory));

        var result = await executor.RunAsync("mkdir -p locked/inner && chmod 500 locked && pwd >&2; exit 1", execute: true, CancellationToken.None);

        var scratch = result.Compile.Output.Trim();
        try
        {
            Assert.False(result.Compile.Success);
            Assert.True(Directory.Exists(Path.Combine(scratch, "locked", "inner")), "cleanup is best effort, so the locked directory is left behind");
        }
        finally
        {
            TempDirectory.ForceDelete(scratch);
        }
    }

    [Fact]
    public async Task Rustup_and_cargo_locations_from_the_runner_environment_are_passed_on_with_a_scratch_home()
    {
        var environment = new Dictionary<string, string>
        {
            ["RUSTUP_HOME"] = "/opt/rustup",
            ["CARGO_HOME"] = "/opt/cargo",
            ["RUSTUP_TOOLCHAIN"] = "1.97.1",
            ["SECRET"] = "leaked",
        };
        // No PATH in the runner's environment: a default one is used.
        var executor = Executor(FakeRustc.Create(_directory), environment: environment, userProfile: WithRustupAndCargo());

        var env = await ChildEnvironment(executor);

        Assert.Equal("/usr/local/bin:/usr/bin:/bin", env["PATH"]);
        Assert.Equal("/opt/rustup", env["RUSTUP_HOME"]);
        Assert.Equal("/opt/cargo", env["CARGO_HOME"]);
        Assert.Equal("1.97.1", env["RUSTUP_TOOLCHAIN"]);
        Assert.Equal("0", env["RUST_BACKTRACE"]);
        Assert.Equal("2", env["MALLOC_ARENA_MAX"]);
        Assert.StartsWith("unmanaged-rs-", Path.GetFileName(env["HOME"]));
        Assert.DoesNotContain("SECRET", env.Keys);
    }

    [LinuxFact]
    public async Task Programs_get_the_address_space_limit_not_the_heap_limit_so_threads_can_spawn()
    {
        // Regression: -v used to equal MemoryLimitMb (256 MB), and spawning ~29 threads failed with EAGAIN.
        var executor = Executor(FakeRustc.Create(_directory), o =>
        {
            o.MemoryLimitMb = 256;
            o.ProgramAddressSpaceMb = 1536;
        });

        var result = await executor.RunAsync(FakeRustc.Emitting("ulimit -v"), execute: true, CancellationToken.None);

        Assert.Equal($"{1536 * 1024}\n", result.Execution!.Stdout);
    }

    [Fact]
    public async Task Rustup_and_cargo_in_the_real_home_are_found_even_though_HOME_is_replaced()
    {
        var home = WithRustupAndCargo();
        var executor = Executor(FakeRustc.Create(_directory), userProfile: home);

        var env = await ChildEnvironment(executor);

        Assert.Equal("/usr/bin:/bin", env["PATH"]);
        Assert.Equal(Path.Combine(home, ".rustup"), env["RUSTUP_HOME"]);
        Assert.Equal(Path.Combine(home, ".cargo"), env["CARGO_HOME"]);
        Assert.DoesNotContain("RUSTUP_TOOLCHAIN", env.Keys);
    }

    [Fact]
    public async Task Without_rustup_or_cargo_no_locations_are_passed()
    {
        var executor = Executor(FakeRustc.Create(_directory), userProfile: _directory.Combine("empty-home"));

        var env = await ChildEnvironment(executor);

        Assert.DoesNotContain("RUSTUP_HOME", env.Keys);
        Assert.DoesNotContain("CARGO_HOME", env.Keys);
    }

    [Fact]
    public void A_configured_rustc_is_used_as_is()
    {
        var bin = _directory.Combine("bin");
        FakeRustc.Create(_directory, relativePath: "bin/rustc");

        var executor = Executor("/opt/rust/bin/rustc", environment: new Dictionary<string, string> { ["PATH"] = bin }, userProfile: WithCargoRustc());

        Assert.Equal("/opt/rust/bin/rustc", executor.RustcPath());
    }

    [Fact]
    public void The_default_rustc_is_used_when_it_is_on_PATH()
    {
        var bin = _directory.Combine("bin");
        FakeRustc.Create(_directory, relativePath: "bin/rustc");

        var executor = Executor("rustc", environment: new Dictionary<string, string> { ["PATH"] = $"{_directory.Combine("empty")}{Path.PathSeparator}{bin}" }, userProfile: WithCargoRustc());

        Assert.Equal("rustc", executor.RustcPath());
    }

    [Fact]
    public async Task Rustc_falls_back_to_cargo_bin_in_the_real_home_when_it_is_not_on_PATH()
    {
        var home = WithCargoRustc();
        var executor = Executor("rustc", environment: SystemPathWithoutRustc(), userProfile: home);

        Assert.Equal(Path.Combine(home, ".cargo", "bin", "rustc"), executor.RustcPath());
        Assert.Equal(FakeRustc.Version, await executor.VersionAsync(CancellationToken.None));
    }

    [Fact]
    public void Rustc_is_left_to_the_OS_when_it_is_nowhere_to_be_found()
    {
        Assert.Equal("rustc", Executor("rustc", environment: SystemPathWithoutRustc()).RustcPath());
        Assert.Equal("rustc", Executor("rustc", environment: new Dictionary<string, string>()).RustcPath());
    }

    private static IReadOnlyDictionary<string, string> SystemPathWithoutRustc() =>
        new Dictionary<string, string> { ["PATH"] = "/nonexistent-bin" };

    private string WithRustupAndCargo()
    {
        var home = _directory.Combine("home");
        Directory.CreateDirectory(Path.Combine(home, ".rustup"));
        Directory.CreateDirectory(Path.Combine(home, ".cargo"));
        return home;
    }

    private string WithCargoRustc()
    {
        FakeRustc.Create(_directory, relativePath: "cargo-home/.cargo/bin/rustc");
        return _directory.Combine("cargo-home");
    }

    /// <summary>The environment rustc sees, dumped by the fake compiler.</summary>
    private static async Task<Dictionary<string, string>> ChildEnvironment(RustExecutor executor)
    {
        var result = await executor.RunAsync("/usr/bin/env >&2; exit 1", execute: false, CancellationToken.None);
        return result.Compile.Output
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Split('=', 2))
            .Where(pair => pair.Length == 2 && pair[0] is not ("PWD" or "SHLVL" or "_"))
            .ToDictionary(pair => pair[0], pair => pair[1]);
    }
}
