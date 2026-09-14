namespace Unmanaged.Runner;

public sealed class RunnerOptions
{
    public const string Section = "Runner";

    /// <summary>Origins allowed to call the API from a browser (the dev defaults are in appsettings.json).</summary>
    /// <remarks>
    /// Empty by default: the configuration binder appends to an array rather than
    /// replacing it, so defaults here could never be removed by configuration.
    /// </remarks>
    public string[] AllowedOrigins { get; set; } = [];

    public int MaxCodeBytes { get; set; } = 64 * 1024;

    public int CompileTimeoutSeconds { get; set; } = 20;

    public int RunTimeoutSeconds { get; set; } = 5;

    /// <summary>Combined cap for stdout and stderr, per stream.</summary>
    public int MaxOutputBytes { get; set; } = 64 * 1024;

    /// <summary>Hard memory ceiling for user programs, in megabytes.</summary>
    public int MemoryLimitMb { get; set; } = 256;

    /// <summary>
    /// Address-space ceiling (ulimit -v) for compiled Rust programs, in megabytes.
    /// Deliberately larger than <see cref="MemoryLimitMb"/>: every thread reserves
    /// virtual space for its stack and malloc arena, so a tight -v stops ordinary
    /// threaded programs from spawning (around 29 threads at 256 MB) while using
    /// little real memory. Real memory is capped by the container.
    /// </summary>
    public int ProgramAddressSpaceMb { get; set; } = 2048;

    /// <summary>Simultaneous compilations/executions. Others wait up to QueueTimeoutSeconds.</summary>
    public int MaxConcurrency { get; set; } = Math.Max(1, Environment.ProcessorCount / 2);

    public int QueueTimeoutSeconds { get; set; } = 15;

    /// <summary>Requests per client IP per minute.</summary>
    public int RequestsPerMinute { get; set; } = 30;

    /// <summary>Path to rustc. Rust support is disabled if it can't be found.</summary>
    public string Rustc { get; set; } = "rustc";

    public string RustEdition { get; set; } = "2024";

    /// <summary>
    /// Apply ulimit (CPU seconds, file size, process count) to child processes.
    /// Only takes effect on Linux, where the runner is meant to be deployed.
    /// </summary>
    public bool UseUlimit { get; set; } = OperatingSystem.IsLinux();

    /// <summary>
    /// Trust X-Forwarded-For from any proxy. Enable only when the runner is reachable
    /// solely through your reverse proxy (as in docker-compose.yml), otherwise
    /// clients can spoof their IP and dodge the rate limit.
    /// </summary>
    public bool TrustForwardedHeaders { get; set; }
}
