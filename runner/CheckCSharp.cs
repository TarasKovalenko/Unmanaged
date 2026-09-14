using System.Text.Json;
using Microsoft.Extensions.Options;
using Unmanaged.Runner.Execution;

namespace Unmanaged.Runner;

/// <summary>
/// Batch mode used by scripts/check-content.ts. Reads [{ id, code, run }] from
/// stdin and writes [{ id, mode, compiled, diagnostics, stdout, stderr, exitCode, timedOut }]
/// to stdout, using exactly the same compiler setup as the HTTP API.
/// </summary>
public static class CheckCSharp
{
    private sealed record Unit(string Id, string Code, bool Run);

    private sealed record UnitResult(
        string Id,
        string Mode,
        bool Compiled,
        string Diagnostics,
        string? Stdout,
        string? Stderr,
        int? ExitCode,
        bool TimedOut);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Reads the units as JSON from <paramref name="input"/> and writes the results to <paramref name="output"/>. Neither stream is disposed.</summary>
    public static async Task<int> RunAsync(Stream input, Stream output)
    {
        var units = await JsonSerializer.DeserializeAsync<List<Unit>>(input, Json) ?? [];
        var executor = new CSharpExecutor(Options.Create(new RunnerOptions { RunTimeoutSeconds = 10 }));
        using var gate = new SemaphoreSlim(Math.Max(1, Environment.ProcessorCount - 1));

        var results = await Task.WhenAll(units.Select(async unit =>
        {
            await gate.WaitAsync();
            try
            {
                var r = await executor.RunAsync(unit.Code, unit.Run, CancellationToken.None);
                return new UnitResult(
                    unit.Id,
                    r.Mode,
                    r.Compile.Success,
                    r.Compile.Output,
                    r.Execution?.Stdout,
                    r.Execution?.Stderr,
                    r.Execution?.ExitCode,
                    r.Execution?.TimedOut ?? false);
            }
            finally
            {
                gate.Release();
            }
        }));

        await JsonSerializer.SerializeAsync(output, results, Json);
        return 0;
    }
}
