using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;

namespace Unmanaged.Runner.Tests.Support;

/// <summary>A fact that only runs on Linux, where the runner is deployed (setsid, process groups, /proc).</summary>
public sealed class LinuxFactAttribute : FactAttribute
{
    public LinuxFactAttribute()
    {
        if (!OperatingSystem.IsLinux()) Skip = "Linux only";
    }
}

/// <summary>
/// A Linux fact that also needs /usr/bin/setsid. The CI coverage run removes it in
/// one pass to exercise the fallback, and these tests describe the setsid path.
/// </summary>
public sealed class LinuxSetsidFactAttribute : FactAttribute
{
    public LinuxSetsidFactAttribute()
    {
        if (!OperatingSystem.IsLinux()) Skip = "Linux only";
        else if (!File.Exists("/usr/bin/setsid")) Skip = "needs /usr/bin/setsid";
    }
}

/// <summary>A fact for behaviour that relies on file permissions, which root ignores.</summary>
public sealed class NonRootFactAttribute : FactAttribute
{
    public NonRootFactAttribute()
    {
        if (TestEnvironment.IsRoot) Skip = "file permissions don't apply to root";
    }
}

public static class TestEnvironment
{
    [DllImport("libc")]
    private static extern uint geteuid();

    public static bool IsRoot => !OperatingSystem.IsWindows() && geteuid() == 0;

    [DllImport("libc", SetLastError = true)]
    private static extern int kill(int pid, int signal);

    public static void SendSigterm(int pid) => Assert.Equal(0, kill(pid, 15));

    /// <summary>The `dotnet` host that runs the tests.</summary>
    public static string DotnetHost =>
        Path.GetFullPath(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(), "..", "..", "..", "dotnet"));
}

/// <summary>A scratch directory that is removed (even if a test made parts of it read-only).</summary>
public sealed class TempDirectory : IDisposable
{
    public string Path { get; } = Directory.CreateTempSubdirectory("unmanaged-test-").FullName;

    public string Combine(params string[] parts) => System.IO.Path.Combine([Path, .. parts]);

    /// <summary>Writes an executable shell script.</summary>
    public string WriteScript(string relativePath, string body)
    {
        var path = Combine(relativePath);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
        File.WriteAllText(path, "#!/bin/sh\n" + body + "\n");
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        return path;
    }

    public static void ForceDelete(string path)
    {
        if (!Directory.Exists(path)) return;
        foreach (var directory in Directory.EnumerateDirectories(path, "*", SearchOption.AllDirectories).Prepend(path))
        {
            File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
        Directory.Delete(path, recursive: true);
    }

    public void Dispose() => ForceDelete(Path);
}

/// <summary>
/// Stands in for rustc. `-vV` prints <c>versionOutput</c>; any other invocation
/// sources src/main.rs as a shell script with rustc's arguments, so each test's
/// "Rust code" decides what the compiler does (fail, hang, emit a `main` binary).
/// </summary>
public static class FakeRustc
{
    public const string Version = "rustc 1.97.1-fake (0123abcd 2026-01-01)";

    public static string DefaultVersionOutput => $"{Version}\nbinary: rustc\ncommit-hash: 0123abcd\nhost: fake\n";

    /// <param name="callsFile">If set, every `-vV` invocation appends a byte to this file.</param>
    public static string Create(TempDirectory directory, string? versionOutput = null, int versionExitCode = 0, string relativePath = "rustc", string callsFile = "/dev/null")
    {
        var lines = string.Join(' ', (versionOutput ?? DefaultVersionOutput).Split('\n').Select(line => $"'{line}'"));
        return directory.WriteScript(relativePath, $"""
            if [ "$1" = "-vV" ]; then
              printf x >> '{callsFile}'
              printf '%s\n' {lines}
              exit {versionExitCode}
            fi
            . ./src/main.rs
            """);
    }

    /// <summary>"Rust code" that makes the fake compiler emit a `main` shell program.</summary>
    public static string Emitting(string program) => $"""
        cat > main <<'PROGRAM'
        #!/bin/sh
        {program}
        PROGRAM
        chmod +x main
        """;
}

public sealed class ListLogger<T> : ILogger<T>
{
    public List<string> Messages { get; } = [];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        lock (Messages) Messages.Add($"{logLevel}: {formatter(state, exception)}");
    }
}
