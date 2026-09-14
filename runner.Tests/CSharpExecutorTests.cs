using System.Runtime.InteropServices;
using Microsoft.Extensions.Options;
using Unmanaged.Runner;
using Unmanaged.Runner.Execution;
using Unmanaged.Runner.Tests.Support;

namespace Unmanaged.Runner.Tests;

public sealed class CSharpExecutorTests
{
    private static CSharpExecutor Executor(Action<RunnerOptions>? configure = null)
    {
        var options = new RunnerOptions { RunTimeoutSeconds = 5 };
        configure?.Invoke(options);
        return new CSharpExecutor(Options.Create(options));
    }

    [Fact]
    public async Task Top_level_statements_run_with_implicit_usings()
    {
        var result = await Executor().RunAsync("var xs = new List<int> { 1, 2, 3 };\nConsole.WriteLine(xs.Sum());", execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("run", result.Mode);
        Assert.Equal(0, result.Execution!.ExitCode);
        Assert.Equal("6\n", result.Execution.Stdout.Replace("\r\n", "\n"));
    }

    [Fact]
    public async Task Compile_errors_are_reported_msbuild_style_and_nothing_runs()
    {
        var result = await Executor().RunAsync("int x = \"a\";", execute: true, CancellationToken.None);

        Assert.False(result.Compile.Success);
        Assert.Contains("Program.cs(1,9): error CS0029", result.Compile.Output);
        Assert.Null(result.Execution);
    }

    [Fact]
    public async Task Warnings_are_reported_msbuild_style_and_the_program_still_runs()
    {
        var result = await Executor().RunAsync("int unused = 1;\nConsole.Write(\"ran\");", execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("Program.cs(1,5): warning CS0219: The variable 'unused' is assigned but its value is never used\n", result.Compile.Output);
        Assert.Equal("ran", result.Execution!.Stdout);
    }

    [Fact]
    public async Task Errors_and_warnings_are_listed_in_source_order()
    {
        var result = await Executor().RunAsync("int unused = 1;\nint x = \"a\";", execute: true, CancellationToken.None);

        var lines = result.Compile.Output.TrimEnd('\n').Split('\n');
        Assert.Equal(2, lines.Length);
        Assert.StartsWith("Program.cs(1,5): warning CS0219", lines[0]);
        Assert.StartsWith("Program.cs(2,9): error CS0029", lines[1]);
    }

    [Fact]
    public async Task Programs_are_only_compiled_when_execution_is_not_requested()
    {
        var result = await Executor().RunAsync("Console.Write(\"should not run\");", execute: false, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("run", result.Mode);
        Assert.Equal("csharp", result.Language);
        Assert.Equal(CSharpExecutor.Toolchain, result.Toolchain);
        Assert.Null(result.Execution);
    }

    [Fact]
    public async Task Code_without_an_entry_point_is_type_checked_as_a_library()
    {
        var result = await Executor().RunAsync("public sealed class Money(decimal Amount) { public decimal Doubled => Amount * 2; }", execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("compile-only", result.Mode);
        Assert.DoesNotContain("CS5001", result.Compile.Output);
        Assert.Null(result.Execution);
    }

    [Fact]
    public async Task Excerpts_report_the_real_error_not_the_missing_entry_point()
    {
        var result = await Executor().RunAsync("public sealed class Service(IOrderRepository repository);", execute: true, CancellationToken.None);

        Assert.False(result.Compile.Success);
        Assert.Equal("compile-only", result.Mode);
        Assert.Contains("CS0246", result.Compile.Output);
        Assert.DoesNotContain("CS5001", result.Compile.Output);
    }

    [Fact]
    public void Toolchain_names_the_runtime_and_language_version()
    {
        Assert.Matches(@"^\.NET \d+\.\d+\.\d+, C# \d+(\.\d+)?$", CSharpExecutor.Toolchain);
        Assert.StartsWith($".NET {Environment.Version},", CSharpExecutor.Toolchain);
    }

    [Fact]
    public async Task Unhandled_exceptions_surface_on_stderr_with_a_non_zero_exit()
    {
        var result = await Executor().RunAsync("string? s = null;\nConsole.WriteLine(s!.Length);", execute: true, CancellationToken.None);

        Assert.NotEqual(0, result.Execution!.ExitCode);
        Assert.Contains("NullReferenceException", result.Execution.Stderr);
    }

    [Fact]
    public async Task Infinite_loops_are_killed_at_the_timeout()
    {
        var result = await Executor(o => o.RunTimeoutSeconds = 1).RunAsync("while (true) { }", execute: true, CancellationToken.None);

        Assert.True(result.Execution!.TimedOut);
        Assert.Null(result.Execution.ExitCode);
        Assert.InRange(result.Execution.DurationMs, 900, 4000);
    }

    [Fact]
    public async Task Output_is_capped()
    {
        var result = await Executor(o => o.MaxOutputBytes = 1000).RunAsync("for (var i = 0; i < 100_000; i++) Console.WriteLine(\"spam spam spam\");", execute: true, CancellationToken.None);

        Assert.True(result.Execution!.Truncated);
        Assert.True(result.Execution.Stdout.Length < 1100);
    }

    [Fact]
    public async Task Programs_run_with_a_scrubbed_environment_a_scratch_home_and_a_heap_limit()
    {
        const string code = """
            foreach (var name in new[] { "PATH", "DOTNET_GCHeapHardLimit", "DOTNET_ROOT", "SECRET" })
                Console.WriteLine($"{name}={Environment.GetEnvironmentVariable(name) ?? "<unset>"}");
            Console.WriteLine(Path.GetFileName(Environment.GetEnvironmentVariable("HOME")) == Path.GetFileName(Environment.CurrentDirectory));
            """;
        var executor = new CSharpExecutor(
            Options.Create(new RunnerOptions { MemoryLimitMb = 64 }),
            name => name == "SECRET" ? "leaked" : null,
            RuntimeEnvironment.GetRuntimeDirectory());

        var result = await executor.RunAsync(code, execute: true, CancellationToken.None);

        Assert.Equal("PATH=/usr/bin:/bin\nDOTNET_GCHeapHardLimit=0x4000000\nDOTNET_ROOT=<unset>\nSECRET=<unset>\nTrue\n", result.Execution!.Stdout);
    }

    [Fact]
    public async Task The_runners_DOTNET_ROOT_is_passed_through_to_the_program()
    {
        var root = Path.GetFullPath(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(), "..", "..", ".."));
        var executor = new CSharpExecutor(
            Options.Create(new RunnerOptions()),
            name => name == "DOTNET_ROOT" ? root : null,
            RuntimeEnvironment.GetRuntimeDirectory());

        var result = await executor.RunAsync("Console.Write(Environment.GetEnvironmentVariable(\"DOTNET_ROOT\"));", execute: true, CancellationToken.None);

        Assert.Equal(root, result.Execution!.Stdout);
    }

    [Fact]
    public async Task Programs_are_started_with_the_dotnet_host_that_owns_the_runtime()
    {
        using var root = new TempDirectory();
        var runtime = FakeRuntimeDirectory(root);
        root.WriteScript("dotnet", "printf '%s ' \"$@\"");
        var executor = new CSharpExecutor(Options.Create(new RunnerOptions()), _ => null, runtime);

        var result = await executor.RunAsync("Console.Write(1);", execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Matches(@"^exec /.+/program\.dll $", result.Execution!.Stdout);
    }

    [Fact]
    public async Task Without_a_host_next_to_the_runtime_dotnet_from_PATH_is_used_and_native_dlls_are_not_referenced()
    {
        using var root = new TempDirectory();
        var runtime = FakeRuntimeDirectory(root);
        // Native libraries named *.dll (as on Windows) must not break reference loading.
        await File.WriteAllTextAsync(Path.Combine(runtime, "native-library.dll"), "not a managed assembly");
        var executor = new CSharpExecutor(Options.Create(new RunnerOptions()), _ => null, runtime);

        var result = await executor.RunAsync("Console.Write(typeof(List<int>).Name);", execute: true, CancellationToken.None);

        Assert.True(result.Compile.Success, result.Compile.Output);
        Assert.Equal("List`1", result.Execution!.Stdout);
        Assert.Equal(0, result.Execution.ExitCode);
    }

    [Fact]
    public async Task The_scratch_directory_is_removed_after_a_run()
    {
        var result = await Executor().RunAsync("Console.Write(Environment.CurrentDirectory);", execute: true, CancellationToken.None);

        Assert.StartsWith("unmanaged-cs-", Path.GetFileName(result.Execution!.Stdout));
        Assert.False(Directory.Exists(result.Execution.Stdout));
    }

    [Fact]
    public async Task A_program_that_deletes_its_own_directory_still_gets_its_result()
    {
        var result = await Executor().RunAsync("Directory.Delete(Environment.CurrentDirectory, recursive: true);\nConsole.Write(\"gone\");", execute: true, CancellationToken.None);

        Assert.Equal("gone", result.Execution!.Stdout);
        Assert.Equal(0, result.Execution.ExitCode);
    }

    [NonRootFact]
    public async Task A_program_that_leaves_an_undeletable_directory_still_gets_its_result()
    {
        const string code = """
            Directory.CreateDirectory("locked/inner");
            File.SetUnixFileMode("locked", UnixFileMode.UserRead | UnixFileMode.UserExecute);
            Console.Write(Environment.CurrentDirectory);
            """;

        var result = await Executor().RunAsync(code, execute: true, CancellationToken.None);
        try
        {
            Assert.Equal(0, result.Execution!.ExitCode);
            Assert.True(Directory.Exists(Path.Combine(result.Execution.Stdout, "locked", "inner")), "cleanup is best effort, so the locked directory is left behind");
        }
        finally
        {
            TempDirectory.ForceDelete(result.Execution!.Stdout);
        }
    }

    /// <summary>&lt;root&gt;/shared/Microsoft.NETCore.App/&lt;version&gt;/ with the real framework assemblies linked in.</summary>
    private static string FakeRuntimeDirectory(TempDirectory root)
    {
        var runtime = Directory.CreateDirectory(root.Combine("shared", "Microsoft.NETCore.App", Environment.Version.ToString())).FullName;
        foreach (var dll in Directory.EnumerateFiles(RuntimeEnvironment.GetRuntimeDirectory(), "*.dll"))
        {
            File.CreateSymbolicLink(Path.Combine(runtime, Path.GetFileName(dll)), dll);
        }
        return runtime;
    }
}
