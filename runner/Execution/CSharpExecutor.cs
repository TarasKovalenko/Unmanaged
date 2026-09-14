using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.Extensions.Options;

namespace Unmanaged.Runner.Execution;

/// <summary>
/// Compiles C# in memory with Roslyn, the same way `dotnet new console` would
/// (implicit usings, nullable enabled, top-level statements), then runs the
/// result in a separate `dotnet exec` process.
/// </summary>
public sealed class CSharpExecutor
{
    private const string FileName = "Program.cs";

    // Same set as the SDK's implicit usings for Microsoft.NET.Sdk console apps.
    private const string GlobalUsings = """
        global using System;
        global using System.Collections.Generic;
        global using System.IO;
        global using System.Linq;
        global using System.Net.Http;
        global using System.Threading;
        global using System.Threading.Tasks;
        """;

    // Loading ~200 references is expensive, so they are shared per runtime directory.
    private static readonly ConcurrentDictionary<string, Lazy<ImmutableArray<MetadataReference>>> References = new();

    private static readonly CSharpParseOptions ParseOptions = new(LanguageVersion.Latest);

    private readonly RunnerOptions _options;
    private readonly Func<string, string?> _getEnvironmentVariable;
    private readonly string _runtimeDirectory;

    public CSharpExecutor(IOptions<RunnerOptions> options)
        : this(options, Environment.GetEnvironmentVariable, RuntimeEnvironment.GetRuntimeDirectory())
    {
    }

    /// <param name="options">Runner limits.</param>
    /// <param name="getEnvironmentVariable">Reads the runner's own environment (DOTNET_ROOT is passed through).</param>
    /// <param name="runtimeDirectory">&lt;root&gt;/shared/Microsoft.NETCore.App/&lt;version&gt;/, used for references and to find the dotnet host.</param>
    internal CSharpExecutor(IOptions<RunnerOptions> options, Func<string, string?> getEnvironmentVariable, string runtimeDirectory)
    {
        _options = options.Value;
        _getEnvironmentVariable = getEnvironmentVariable;
        _runtimeDirectory = runtimeDirectory;
    }

    public static string Toolchain =>
        $".NET {Environment.Version}, C# {LanguageVersionFacts.ToDisplayString(LanguageVersion.Latest.MapSpecifiedToEffectiveVersion())}";

    public async Task<RunResult> RunAsync(string code, bool execute, CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var (compilation, emitted, diagnostics) = Compile(code, OutputKind.ConsoleApplication);
        var mode = "run";

        // Excerpts (classes without Main) are still worth type-checking, so
        // recompile as a library and report only the errors that remain.
        if (!emitted.Success && diagnostics.Any(d => d.Id == "CS5001"))
        {
            (compilation, emitted, diagnostics) = Compile(code, OutputKind.DynamicallyLinkedLibrary);
            mode = "compile-only";
        }
        stopwatch.Stop();

        var compile = new CompileResult(emitted.Success, FormatDiagnostics(diagnostics), stopwatch.ElapsedMilliseconds);
        if (!emitted.Success || mode == "compile-only" || !execute)
        {
            return new RunResult("csharp", Toolchain, mode, compile, null);
        }

        var directory = Directory.CreateTempSubdirectory("unmanaged-cs-");
        try
        {
            var dll = Path.Combine(directory.FullName, "program.dll");
            await File.WriteAllBytesAsync(dll, emitted.Bytes, cancellationToken);
            await File.WriteAllTextAsync(Path.Combine(directory.FullName, "program.runtimeconfig.json"), RuntimeConfig(), cancellationToken);

            var environment = new Dictionary<string, string>
            {
                ["PATH"] = "/usr/bin:/bin",
                ["HOME"] = directory.FullName,
                ["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1",
                ["DOTNET_NOLOGO"] = "1",
                // The GC reserves a large virtual range, so ulimit -v can't cap .NET.
                // A hard heap limit does the same job from inside the runtime.
                ["DOTNET_GCHeapHardLimit"] = $"0x{_options.MemoryLimitMb * 1024L * 1024L:X}",
                ["DOTNET_gcServer"] = "0",
                ["DOTNET_TieredCompilation"] = "1",
            };
            if (_getEnvironmentVariable("DOTNET_ROOT") is { } root) environment["DOTNET_ROOT"] = root;

            var execution = await SandboxedProcess.RunAsync(
                DotnetHost(),
                ["exec", dll],
                directory.FullName,
                environment,
                new SandboxedProcess.Limits(
                    TimeSpan.FromSeconds(_options.RunTimeoutSeconds),
                    _options.MaxOutputBytes,
                    CpuSeconds: _options.RunTimeoutSeconds + 1),
                _options.UseUlimit,
                cancellationToken);

            return new RunResult("csharp", Toolchain, mode, compile, execution);
        }
        finally
        {
            TryDelete(directory);
        }
    }

    private (CSharpCompilation, (bool Success, byte[] Bytes), ImmutableArray<Diagnostic>) Compile(string code, OutputKind kind)
    {
        var trees = new[]
        {
            CSharpSyntaxTree.ParseText(code, ParseOptions, FileName, Encoding.UTF8),
            CSharpSyntaxTree.ParseText(GlobalUsings, ParseOptions, "GlobalUsings.g.cs", Encoding.UTF8),
        };
        var compilation = CSharpCompilation.Create(
            "program",
            trees,
            References.GetOrAdd(_runtimeDirectory, directory => new(() => LoadReferences(directory))).Value,
            new CSharpCompilationOptions(kind)
                .WithNullableContextOptions(NullableContextOptions.Enable)
                .WithOptimizationLevel(OptimizationLevel.Debug)
                .WithAllowUnsafe(true)
                .WithDeterministic(true));

        using var stream = new MemoryStream();
        var result = compilation.Emit(stream);
        var diagnostics = result.Diagnostics
            .Where(d => d.Severity is DiagnosticSeverity.Error or DiagnosticSeverity.Warning)
            .Where(d => d.Location.SourceTree?.FilePath != "GlobalUsings.g.cs")
            .OrderBy(d => d.Location.SourceSpan.Start)
            .ToImmutableArray();
        return (compilation, (result.Success, stream.ToArray()), diagnostics);
    }

    /// <summary>MSBuild-style: Program.cs(3,17): error CS0103: The name 'x' does not exist in the current context</summary>
    private static string FormatDiagnostics(ImmutableArray<Diagnostic> diagnostics)
    {
        var builder = new StringBuilder();
        foreach (var d in diagnostics)
        {
            var position = d.Location.GetLineSpan().StartLinePosition;
            var severity = d.Severity == DiagnosticSeverity.Error ? "error" : "warning";
            builder.Append($"{FileName}({position.Line + 1},{position.Character + 1}): {severity} {d.Id}: {d.GetMessage()}\n");
        }
        return builder.ToString();
    }

    private static ImmutableArray<MetadataReference> LoadReferences(string runtimeDirectory)
    {
        // Reference only the base framework the child process will run on,
        // not ASP.NET Core, which the runner host happens to have loaded.
        return Directory.EnumerateFiles(runtimeDirectory, "*.dll")
            .Where(IsManagedAssembly)
            .Select(path => (MetadataReference)MetadataReference.CreateFromFile(path))
            .ToImmutableArray();
    }

    private static bool IsManagedAssembly(string path)
    {
        try
        {
            System.Reflection.AssemblyName.GetAssemblyName(path);
            return true;
        }
        catch (BadImageFormatException)
        {
            return false;
        }
    }

    private static string RuntimeConfig() =>
        JsonSerializer.Serialize(new
        {
            runtimeOptions = new
            {
                tfm = $"net{Environment.Version.Major}.{Environment.Version.Minor}",
                framework = new { name = "Microsoft.NETCore.App", version = Environment.Version.ToString() },
            },
        });

    /// <summary>The `dotnet` host that owns the running runtime: &lt;root&gt;/shared/Microsoft.NETCore.App/&lt;version&gt;/</summary>
    private string DotnetHost()
    {
        var root = Path.GetFullPath(Path.Combine(_runtimeDirectory, "..", "..", ".."));
        var host = Path.Combine(root, HostFileName);
        return File.Exists(host) ? host : "dotnet";
    }

    [ExcludeFromCodeCoverage(Justification = "The Windows branch can't run on the Linux/macOS machines the tests run on.")]
    private static string HostFileName => OperatingSystem.IsWindows() ? "dotnet.exe" : "dotnet";

    private static void TryDelete(DirectoryInfo directory)
    {
        try
        {
            directory.Delete(recursive: true);
        }
        catch (IOException)
        {
            // A killed process may still hold a handle for a moment; the OS cleans temp.
        }
    }
}
