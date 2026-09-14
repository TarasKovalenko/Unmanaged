using Unmanaged.Runner.Execution;
using Unmanaged.Runner.Tests.Support;

namespace Unmanaged.Runner.Tests;

public sealed class SandboxedProcessTests
{
    private static readonly Dictionary<string, string> Path = new() { ["PATH"] = "/usr/bin:/bin" };

    private static Task<ExecutionResult> Shell(
        string script,
        SandboxedProcess.Limits? limits = null,
        bool useUlimit = false,
        IReadOnlyDictionary<string, string>? environment = null,
        CancellationToken cancellationToken = default) =>
        SandboxedProcess.RunAsync(
            "/bin/sh",
            ["-c", script],
            System.IO.Path.GetTempPath(),
            environment ?? Path,
            limits ?? new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 1024),
            useUlimit,
            cancellationToken);

    [Fact]
    public async Task Captures_stdout_stderr_and_exit_code_with_only_the_given_environment()
    {
        var result = await Shell(
            "echo \"$GREETING\"; echo \"home=${HOME-unset}\"; echo oops >&2; exit 3",
            environment: new Dictionary<string, string> { ["GREETING"] = "hello" });

        Assert.Equal("hello\nhome=unset\n", result.Stdout);
        Assert.Equal("oops\n", result.Stderr);
        Assert.Equal(3, result.ExitCode);
        Assert.False(result.TimedOut);
        Assert.False(result.Truncated);
    }

    [Fact]
    public async Task Runs_in_the_given_working_directory_with_stdin_closed()
    {
        using var directory = new TempDirectory();

        var result = await SandboxedProcess.RunAsync(
            "/bin/sh", ["-c", "pwd; cat; echo done"], directory.Path, Path,
            new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 1024), useUlimit: false, CancellationToken.None);

        Assert.EndsWith($"/{System.IO.Path.GetFileName(directory.Path)}\ndone\n", result.Stdout);
    }

    [Fact]
    public async Task A_process_that_outlives_the_timeout_is_killed_and_reported_as_timed_out()
    {
        var result = await Shell("echo started; exec sleep 30", new SandboxedProcess.Limits(TimeSpan.FromMilliseconds(200), 1024));

        Assert.True(result.TimedOut);
        Assert.Null(result.ExitCode);
        Assert.Equal("started\n", result.Stdout);
        Assert.InRange(result.DurationMs, 150, 5000);
    }

    [Fact]
    public async Task Cancellation_by_the_caller_kills_the_process_but_is_not_a_timeout()
    {
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();

        var result = await Shell("exec sleep 30", cancellationToken: cancellation.Token);

        Assert.False(result.TimedOut);
        Assert.NotNull(result.ExitCode);
        Assert.NotEqual(0, result.ExitCode);
        Assert.InRange(result.DurationMs, 0, 5000);
    }

    [Fact]
    public async Task Stdout_beyond_the_cap_is_dropped_and_marked_truncated_while_the_pipe_keeps_draining()
    {
        // 100 KB is far more than a pipe buffer: the child only finishes if the runner keeps reading.
        var result = await Shell("head -c 100000 /dev/zero | tr '\\0' a; echo finished >&2", new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 10));

        Assert.True(result.Truncated);
        Assert.Equal("aaaaaaaaaa\n… output truncated", result.Stdout);
        Assert.Equal("finished\n", result.Stderr);
        Assert.Equal(0, result.ExitCode);
    }

    [Fact]
    public async Task Stderr_beyond_the_cap_is_truncated_independently_of_stdout()
    {
        var result = await Shell("echo ok; head -c 5000 /dev/zero | tr '\\0' e >&2", new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 4));

        Assert.True(result.Truncated);
        Assert.Equal("ok\n", result.Stdout);
        Assert.Equal("eeee\n… output truncated", result.Stderr);
    }

    [Fact]
    public async Task Output_exactly_at_the_cap_is_not_truncated()
    {
        var result = await Shell("printf 12345", new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 5));

        Assert.False(result.Truncated);
        Assert.Equal("12345", result.Stdout);
    }

    [Fact]
    public async Task Ulimits_are_applied_to_the_program_when_enabled()
    {
        var result = await Shell(
            "ulimit -t",
            new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 1024, CpuSeconds: 7, VirtualMemoryKb: 4 * 1024 * 1024, MaxFileKb: 1024, MaxProcesses: 512),
            useUlimit: true);

        Assert.Equal(0, result.ExitCode);
        Assert.Equal("7\n", result.Stdout);
        Assert.Equal("", result.Stderr);
    }

    [Fact]
    public async Task Without_limits_ulimit_mode_still_runs_the_program_with_its_arguments()
    {
        var result = await SandboxedProcess.RunAsync(
            "/bin/sh", ["-c", "printf '%s|' \"$0\" \"$@\"", "zero", "a b", "c"], System.IO.Path.GetTempPath(), Path,
            new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 1024, MaxFileKb: null),
            useUlimit: true, CancellationToken.None);

        Assert.Equal("zero|a b|c|", result.Stdout);
        Assert.Equal(0, result.ExitCode);
    }

    [Fact]
    public async Task Without_ulimit_mode_the_default_file_size_limit_is_not_applied()
    {
        var result = await Shell("ulimit -f", new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 1024, MaxFileKb: 1));

        Assert.Equal("unlimited\n", result.Stdout);
    }

    [LinuxFact]
    public async Task On_linux_every_limit_is_set_in_the_units_its_name_says()
    {
        var result = await Shell(
            "cat /proc/self/limits",
            new SandboxedProcess.Limits(TimeSpan.FromSeconds(10), 8192, CpuSeconds: 7, VirtualMemoryKb: 1024 * 1024, MaxFileKb: 1024, MaxProcesses: 300),
            useUlimit: true);

        var limits = result.Stdout.Split('\n');
        Assert.Contains(limits, l => l.StartsWith("Max cpu time") && l.Contains(" 7 "));
        Assert.Contains(limits, l => l.StartsWith("Max address space") && l.Contains($" {1024L * 1024 * 1024} "));
        Assert.Contains(limits, l => l.StartsWith("Max file size") && l.Contains($" {1024 * 1024} "));
        Assert.Contains(limits, l => l.StartsWith("Max processes") && l.Contains(" 300 "));
    }

    [LinuxSetsidFact]
    public async Task On_linux_the_program_runs_in_its_own_session()
    {
        var result = await Shell("echo $$; cat /proc/$$/stat", useUlimit: true);
        var lines = result.Stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var fields = lines[1][(lines[1].LastIndexOf(')') + 2)..].Split(' ');

        // Process group and session id == its own pid: setsid made it the leader of both,
        // so the runner can kill every descendant with one kill(-pgid).
        Assert.Equal(lines[0], fields[2]);
        Assert.Equal(lines[0], fields[3]);
    }

    [LinuxSetsidFact]
    public async Task On_linux_background_children_are_killed_when_the_program_exits()
    {
        // Fork-bomb regression: a program that leaves children behind must not keep them
        // running, nor hold the request open until the pipe-drain grace period.
        var result = await Shell("sleep 60 & echo $!; sleep 60 & echo $!", useUlimit: true);
        var children = result.Stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray();

        Assert.Equal(2, children.Length);
        Assert.InRange(result.DurationMs, 0, 1500);
        foreach (var pid in children) Assert.False(IsAlive(pid), $"child {pid} is still running");
    }

    [LinuxFact]
    public async Task On_linux_background_children_are_killed_when_the_program_times_out()
    {
        var result = await Shell("sleep 60 & echo $!; exec sleep 60", new SandboxedProcess.Limits(TimeSpan.FromMilliseconds(200), 1024), useUlimit: true);
        var child = int.Parse(result.Stdout.Trim());

        Assert.True(result.TimedOut);
        Assert.InRange(result.DurationMs, 150, 1700);
        Assert.False(IsAlive(child), $"child {child} is still running");
    }

    [Fact]
    public async Task Pumping_stops_quietly_when_the_pipe_is_closed_underneath_it()
    {
        foreach (var exception in new Exception[] { new IOException("broken pipe"), new ObjectDisposedException("pipe") })
        {
            var buffer = new SandboxedProcess.CappedBuffer(100);

            await SandboxedProcess.PumpAsync(new FailingReader("partial", exception), buffer);

            Assert.Equal("partial", buffer.ToString());
            Assert.False(buffer.Truncated);
        }
    }

    [Fact]
    public async Task Pumping_does_not_swallow_unexpected_errors()
    {
        var buffer = new SandboxedProcess.CappedBuffer(100);

        await Assert.ThrowsAsync<InvalidOperationException>(() => SandboxedProcess.PumpAsync(new FailingReader("x", new InvalidOperationException()), buffer));
    }

    private static bool IsAlive(int pid)
    {
        // A killed child may linger as a zombie until something reaps it; that is dead too.
        var stat = $"/proc/{pid}/stat";
        if (!File.Exists(stat)) return false;
        try
        {
            var text = File.ReadAllText(stat);
            var state = text[(text.LastIndexOf(')') + 2)..][0];
            return state is not ('Z' or 'X');
        }
        catch (IOException)
        {
            return false;
        }
    }

    private sealed class FailingReader(string data, Exception exception) : TextReader
    {
        private bool _served;

        public override ValueTask<int> ReadAsync(Memory<char> buffer, CancellationToken cancellationToken = default)
        {
            if (_served) return ValueTask.FromException<int>(exception);
            _served = true;
            data.AsSpan().CopyTo(buffer.Span);
            return ValueTask.FromResult(data.Length);
        }
    }
}
