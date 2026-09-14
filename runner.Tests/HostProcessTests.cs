using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Unmanaged.Runner.Tests.Support;

namespace Unmanaged.Runner.Tests;

/// <summary>The runner as a real process: the check-csharp CLI and the Kestrel server.</summary>
public sealed partial class HostProcessTests
{
    private static readonly string RunnerDll = typeof(Program).Assembly.Location;

    private static ProcessStartInfo Runner(params string[] arguments)
    {
        var startInfo = new ProcessStartInfo(TestEnvironment.DotnetHost)
        {
            WorkingDirectory = Path.GetDirectoryName(RunnerDll)!,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add("exec");
        startInfo.ArgumentList.Add(RunnerDll);
        foreach (var argument in arguments) startInfo.ArgumentList.Add(argument);
        startInfo.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        return startInfo;
    }

    [Fact]
    public async Task Check_csharp_reads_units_from_stdin_and_writes_results_to_stdout()
    {
        using var process = Process.Start(Runner("check-csharp"))!;
        await process.StandardInput.WriteAsync("""[{ "id": "a", "code": "Console.Write(40 + 2);", "run": true }]""");
        process.StandardInput.Close();

        var stdout = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        Assert.Equal(0, process.ExitCode);
        var result = Assert.Single(JsonDocument.Parse(stdout).RootElement.EnumerateArray());
        Assert.Equal("a", result.GetProperty("id").GetString());
        Assert.Equal("42", result.GetProperty("stdout").GetString());
    }

    [Fact]
    public async Task The_server_listens_enforces_the_body_size_limit_and_shuts_down_cleanly()
    {
        var startInfo = Runner("--urls", "http://127.0.0.1:0");
        startInfo.Environment["Runner__MaxCodeBytes"] = "100";
        startInfo.Environment["Runner__Rustc"] = "/nonexistent/rustc";
        using var process = Process.Start(startInfo)!;
        try
        {
            var address = await ListeningAddress(process);
            using var client = new HttpClient { BaseAddress = new Uri(address) };

            var health = await client.GetStringAsync("/health");
            var tooLarge = await client.PostAsync("/run", new StringContent(new string(' ', 300), System.Text.Encoding.UTF8, "application/json"));
            var withinLimit = await client.PostAsJsonAsync("/run", new { language = "csharp", code = new string('x', 150) });

            Assert.Equal("ok", health);
            // The body may be at most twice MaxCodeBytes (JSON escaping), enforced by Kestrel.
            Assert.Equal(HttpStatusCode.RequestEntityTooLarge, tooLarge.StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, withinLimit.StatusCode);
        }
        finally
        {
            if (!process.HasExited) TestEnvironment.SendSigterm(process.Id);
        }

        using var exit = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(exit.Token);
        Assert.Equal(0, process.ExitCode);
    }

    private static async Task<string> ListeningAddress(Process process)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        while (await process.StandardOutput.ReadLineAsync(timeout.Token) is { } line)
        {
            if (ListeningRegex().Match(line) is { Success: true } match)
            {
                // Keep draining the log so the server never blocks on a full pipe.
                _ = process.StandardOutput.ReadToEndAsync();
                _ = process.StandardError.ReadToEndAsync();
                return match.Groups[1].Value;
            }
        }
        throw new InvalidOperationException($"the runner exited before listening: {await process.StandardError.ReadToEndAsync()}");
    }

    [GeneratedRegex(@"Now listening on: (http://\S+)")]
    private static partial Regex ListeningRegex();
}
