using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Unmanaged.Runner.Execution;

/// <summary>
/// Runs a process with a wall-clock timeout, capped output, a scrubbed
/// environment and (on Linux) ulimits. This is defence in depth, not the
/// sandbox: the deployment is expected to isolate the runner container itself
/// (no network egress, read-only root, memory/pid limits; see docker-compose.yml).
/// </summary>
public static class SandboxedProcess
{
    private const string Setsid = "/usr/bin/setsid";
    private const int SigKill = 9;

    [DllImport("libc", SetLastError = true)]
    private static extern int kill(int pid, int signal);

    public sealed record Limits(
        TimeSpan Timeout,
        int MaxOutputBytes,
        int? CpuSeconds = null,
        int? VirtualMemoryKb = null,
        int? MaxFileKb = 10 * 1024,
        // ulimit -u counts every process and thread owned by the user, including the
        // runner itself, so a per-program value makes ordinary threaded programs fail
        // under load. The executors leave it unset and rely on the container pids limit,
        // the per-run process-group kill and the timeout to contain fork bombs.
        int? MaxProcesses = null);

    public static async Task<ExecutionResult> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        string workingDirectory,
        IReadOnlyDictionary<string, string> environment,
        Limits limits,
        bool useUlimit,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        if (useUlimit)
        {
            // sh -c 'ulimit ...; exec "$0" "$@"' program args...
            // /bin/sh may be dash, which spells the process limit -p rather than -u.
            // Errors are silenced so they never leak into the program's stderr; the
            // container's own limits (pids, memory, CPU) still apply if one is unsupported.
            var ulimits = new StringBuilder();
            if (limits.CpuSeconds is { } cpu) ulimits.Append($"ulimit -t {cpu} 2>/dev/null; ");
            if (limits.VirtualMemoryKb is { } vm) ulimits.Append($"ulimit -v {vm} 2>/dev/null; ");
            // POSIX shells (dash, the Linux /bin/sh) count ulimit -f in 512-byte blocks.
            if (limits.MaxFileKb is { } fsize) ulimits.Append($"ulimit -f {fsize * 2} 2>/dev/null; ");
            if (limits.MaxProcesses is { } nproc) ulimits.Append($"{{ ulimit -u {nproc} || ulimit -p {nproc}; }} 2>/dev/null; ");
            // Run in a fresh session so every descendant shares one process group,
            // including children that outlive (or are orphaned by) the program.
            if (File.Exists(Setsid))
            {
                startInfo.FileName = Setsid;
                startInfo.ArgumentList.Add("/bin/sh");
            }
            else
            {
                startInfo.FileName = "/bin/sh";
            }
            startInfo.ArgumentList.Add("-c");
            startInfo.ArgumentList.Add($"{ulimits}exec \"$0\" \"$@\"");
            startInfo.ArgumentList.Add(fileName);
        }
        else
        {
            startInfo.FileName = fileName;
        }

        foreach (var argument in arguments) startInfo.ArgumentList.Add(argument);

        startInfo.Environment.Clear();
        foreach (var (key, value) in environment) startInfo.Environment[key] = value;

        var stopwatch = Stopwatch.StartNew();
        using var process = new Process { StartInfo = startInfo };
        process.Start();
        process.StandardInput.Close();

        var stdout = new CappedBuffer(limits.MaxOutputBytes);
        var stderr = new CappedBuffer(limits.MaxOutputBytes);
        var stdoutTask = PumpAsync(process.StandardOutput, stdout);
        var stderrTask = PumpAsync(process.StandardError, stderr);

        var processGroup = useUlimit && File.Exists(Setsid) ? process.Id : (int?)null;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(limits.Timeout);
        var timedOut = false;
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            timedOut = !cancellationToken.IsCancellationRequested;
            // A no-op if the process already exited between the timeout and the kill.
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync(CancellationToken.None);
        }

        // Background children (e.g. a spawned process loop) would otherwise keep
        // running and hold the output pipes open. Kill the whole group.
        if (processGroup is { } pgid) kill(-pgid, SigKill);

        // Pipes close once every holder is dead; don't let a stray holder stall the request.
        await Task.WhenAny(Task.WhenAll(stdoutTask, stderrTask), Task.Delay(TimeSpan.FromSeconds(2), CancellationToken.None));
        stopwatch.Stop();

        return new ExecutionResult(
            timedOut ? null : process.ExitCode,
            stdout.ToString(),
            stderr.ToString(),
            timedOut,
            stdout.Truncated || stderr.Truncated,
            stopwatch.ElapsedMilliseconds);
    }

    internal static async Task PumpAsync(TextReader reader, CappedBuffer buffer)
    {
        var chunk = new char[4096];
        try
        {
            int read;
            while ((read = await reader.ReadAsync(chunk)) > 0)
            {
                // Keep draining after the cap so the child never blocks on a full pipe.
                buffer.Append(chunk.AsSpan(0, read));
            }
        }
        catch (Exception e) when (e is ObjectDisposedException or IOException)
        {
            // The request finished while an orphaned holder kept the pipe open.
        }
    }

    internal sealed class CappedBuffer(int maxChars)
    {
        private readonly StringBuilder _builder = new();

        public bool Truncated { get; private set; }

        public void Append(ReadOnlySpan<char> text)
        {
            var room = maxChars - _builder.Length;
            if (room <= 0)
            {
                Truncated = true;
                return;
            }
            if (text.Length > room)
            {
                _builder.Append(text[..room]);
                Truncated = true;
                return;
            }
            _builder.Append(text);
        }

        public override string ToString() =>
            Truncated ? _builder.ToString() + "\n… output truncated" : _builder.ToString();
    }
}
