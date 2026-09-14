namespace Unmanaged.Runner;

public sealed record RunRequest(string Language, string Code);

public sealed record CompileResult(bool Success, string Output, long DurationMs);

public sealed record ExecutionResult(
    int? ExitCode,
    string Stdout,
    string Stderr,
    bool TimedOut,
    bool Truncated,
    long DurationMs);

/// <summary>
/// Mode is "run" when the program had an entry point and was executed, or
/// "compile-only" when it compiled as a library (C# excerpts without Main).
/// </summary>
public sealed record RunResult(
    string Language,
    string Toolchain,
    string Mode,
    CompileResult Compile,
    ExecutionResult? Execution);

public sealed record LanguageInfo(string Version);

public sealed record RunnerInfo(IReadOnlyDictionary<string, LanguageInfo> Languages, RunnerLimits Limits);

public sealed record RunnerLimits(int MaxCodeBytes, int CompileTimeoutSeconds, int RunTimeoutSeconds, int MaxOutputBytes);
