using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace Unmanaged.Runner.Execution;

/// <summary>
/// Compiles a single-file Rust program with rustc (no Cargo, no crates) and
/// runs it. Mirrors the site's content checker, so output matches what the
/// lessons show.
/// </summary>
public sealed partial class RustExecutor
{
    private readonly RunnerOptions _options;
    private readonly ILogger<RustExecutor> _logger;
    private readonly Func<string, string?> _getEnvironmentVariable;
    private readonly string _userProfile;
    private (string Version, string CommitHash)? _toolchain;

    public RustExecutor(IOptions<RunnerOptions> options, ILogger<RustExecutor> logger)
        : this(options, logger, Environment.GetEnvironmentVariable, Environment.GetFolderPath(Environment.SpecialFolder.UserProfile))
    {
    }

    /// <param name="options">Runner limits and the rustc location.</param>
    /// <param name="logger">Logs when rustc is unavailable.</param>
    /// <param name="getEnvironmentVariable">Reads the runner's own environment (PATH, rustup and cargo locations).</param>
    /// <param name="userProfile">The runner user's real home directory, where rustup installs by default.</param>
    internal RustExecutor(IOptions<RunnerOptions> options, ILogger<RustExecutor> logger, Func<string, string?> getEnvironmentVariable, string userProfile)
    {
        _options = options.Value;
        _logger = logger;
        _getEnvironmentVariable = getEnvironmentVariable;
        _userProfile = userProfile;
    }

    public async Task<string?> VersionAsync(CancellationToken cancellationToken)
    {
        if (_toolchain is { } cached) return cached.Version;
        try
        {
            var result = await SandboxedProcess.RunAsync(
                RustcPath(), ["-vV"], Path.GetTempPath(), BaseEnvironment(Path.GetTempPath()),
                new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 8192), useUlimit: false, cancellationToken);
            if (result.ExitCode != 0) return null;
            var version = result.Stdout.Split('\n')[0].Trim();
            var hash = CommitHashRegex().Match(result.Stdout);
            _toolchain = (version, hash.Success ? hash.Groups[1].Value : "unknown");
            return version;
        }
        catch (System.ComponentModel.Win32Exception exception)
        {
            _logger.LogWarning("rustc not available at '{Rustc}': {Message}. Rust support disabled.", _options.Rustc, exception.Message);
            return null;
        }
    }

    public async Task<RunResult> RunAsync(string code, bool execute, CancellationToken cancellationToken)
    {
        var version = await VersionAsync(cancellationToken) ?? throw new InvalidOperationException("rustc is not available");
        var directory = Directory.CreateTempSubdirectory("unmanaged-rs-");
        try
        {
            Directory.CreateDirectory(Path.Combine(directory.FullName, "src"));
            await File.WriteAllTextAsync(Path.Combine(directory.FullName, "src", "main.rs"), code + "\n", cancellationToken);

            var environment = BaseEnvironment(directory.FullName);
            var stopwatch = Stopwatch.StartNew();
            var compile = await SandboxedProcess.RunAsync(
                RustcPath(),
                ["--edition", _options.RustEdition, "--crate-type", "bin", "--crate-name", "main", "--color", "never",
                 "-C", "debuginfo=0", execute ? "--emit=link" : "--emit=metadata", "-o", "main", "src/main.rs"],
                directory.FullName,
                environment,
                new SandboxedProcess.Limits(
                    TimeSpan.FromSeconds(_options.CompileTimeoutSeconds),
                    _options.MaxOutputBytes,
                    CpuSeconds: _options.CompileTimeoutSeconds,
                    VirtualMemoryKb: 2 * 1024 * 1024,
                    MaxFileKb: 256 * 1024),
                _options.UseUlimit,
                cancellationToken);
            stopwatch.Stop();

            var compileOutput = compile.TimedOut ? "rustc timed out" : PortablePaths(compile.Stderr);
            var compiled = !compile.TimedOut && compile.ExitCode == 0;
            var compileResult = new CompileResult(compiled, compileOutput, stopwatch.ElapsedMilliseconds);
            if (!compiled || !execute)
            {
                return new RunResult("rust", version, execute ? "run" : "compile-only", compileResult, null);
            }

            var execution = await SandboxedProcess.RunAsync(
                Path.Combine(directory.FullName, "main"),
                [],
                directory.FullName,
                environment,
                new SandboxedProcess.Limits(
                    TimeSpan.FromSeconds(_options.RunTimeoutSeconds),
                    _options.MaxOutputBytes,
                    CpuSeconds: _options.RunTimeoutSeconds + 1,
                    VirtualMemoryKb: _options.ProgramAddressSpaceMb * 1024),
                _options.UseUlimit,
                cancellationToken);

            return new RunResult("rust", version, "run", compileResult, execution with { Stderr = StripThreadIds(execution.Stderr) });
        }
        finally
        {
            try
            {
                directory.Delete(recursive: true);
            }
            catch (IOException)
            {
                // Best effort; temp is cleaned by the OS or container restart.
            }
        }
    }

    private Dictionary<string, string> BaseEnvironment(string home)
    {
        var environment = new Dictionary<string, string>
        {
            ["PATH"] = _getEnvironmentVariable("PATH") ?? "/usr/local/bin:/usr/bin:/bin",
            ["HOME"] = home,
            ["RUST_BACKTRACE"] = "0",
            // glibc reserves a large arena per thread; two arenas keep threaded
            // programs well inside the address-space limit.
            ["MALLOC_ARENA_MAX"] = "2",
        };
        foreach (var key in new[] { "RUSTUP_HOME", "CARGO_HOME", "RUSTUP_TOOLCHAIN" })
        {
            if (_getEnvironmentVariable(key) is { } value) environment[key] = value;
        }

        // HOME is replaced with a scratch directory, so a rustup proxy would no
        // longer find its toolchains. Point it at the real locations explicitly.
        if (!environment.ContainsKey("RUSTUP_HOME") && Directory.Exists(Path.Combine(_userProfile, ".rustup")))
        {
            environment["RUSTUP_HOME"] = Path.Combine(_userProfile, ".rustup");
        }
        if (!environment.ContainsKey("CARGO_HOME") && Directory.Exists(Path.Combine(_userProfile, ".cargo")))
        {
            environment["CARGO_HOME"] = Path.Combine(_userProfile, ".cargo");
        }
        return environment;
    }

    /// <summary>The configured rustc, falling back to ~/.cargo/bin/rustc for local development.</summary>
    internal string RustcPath()
    {
        if (_options.Rustc != "rustc" || PathContains("rustc")) return _options.Rustc;
        var cargoBin = Path.Combine(_userProfile, ".cargo", "bin", "rustc");
        return File.Exists(cargoBin) ? cargoBin : _options.Rustc;
    }

    private bool PathContains(string program) =>
        (_getEnvironmentVariable("PATH") ?? "")
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Any(dir => File.Exists(Path.Combine(dir, program)));

    /// <summary>Same normalisation as scripts/check-content.ts: local std source paths become /rustc/&lt;commit&gt;/.</summary>
    private string PortablePaths(string text) =>
        RustSrcRegex().Replace(text, $"/rustc/{_toolchain!.Value.CommitHash}/");

    private static string StripThreadIds(string text) => ThreadIdRegex().Replace(text, "thread '$1' panicked");

    [GeneratedRegex(@"commit-hash: (\w+)")]
    private static partial Regex CommitHashRegex();

    [GeneratedRegex(@"(?:/[^\s:]+)?/\.rustup/toolchains/[^/\s]+/lib/rustlib/src/rust/")]
    private static partial Regex RustSrcRegex();

    [GeneratedRegex(@"thread '([^']*)' \(\d+\) panicked")]
    private static partial Regex ThreadIdRegex();
}
