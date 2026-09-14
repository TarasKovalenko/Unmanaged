using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Options;
using Unmanaged.Runner;
using Unmanaged.Runner.Execution;

// CLI mode for the content checker: compile/run C# units from stdin, JSON out.
//   dotnet run --project runner -- check-csharp < units.json
if (args.FirstOrDefault() == "check-csharp")
{
    using var stdout = Console.OpenStandardOutput();
    return await CheckCSharp.RunAsync(Console.OpenStandardInput(), stdout);
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOptions<RunnerOptions>().Bind(builder.Configuration.GetSection(RunnerOptions.Section));
builder.Services.AddSingleton<CSharpExecutor>();
builder.Services.AddSingleton<RustExecutor>();
builder.Services.AddSingleton(sp => new SemaphoreSlim(sp.GetRequiredService<IOptions<RunnerOptions>>().Value.MaxConcurrency));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

// Everything below reads RunnerOptions through IOptions, so all configuration
// sources (including ones added after this point) apply consistently.
builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>().Configure<IOptions<RunnerOptions>>((cors, runner) => cors.AddDefaultPolicy(p => p
    .WithOrigins(runner.Value.AllowedOrigins)
    .WithMethods("GET", "POST")
    .WithHeaders("content-type")));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("per-ip", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = context.RequestServices.GetRequiredService<IOptions<RunnerOptions>>().Value.RequestsPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

builder.Services.AddOptions<KestrelServerOptions>().Configure<IOptions<RunnerOptions>>((kestrel, runner) =>
    kestrel.Limits.MaxRequestBodySize = runner.Value.MaxCodeBytes * 2);

var app = builder.Build();

if (app.Services.GetRequiredService<IOptions<RunnerOptions>>().Value.TrustForwardedHeaders)
{
    var forwarded = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor };
    forwarded.KnownIPNetworks.Clear();
    forwarded.KnownProxies.Clear();
    app.UseForwardedHeaders(forwarded);
}

app.UseCors();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Text("ok"));

app.MapGet("/info", async (RustExecutor rust, IOptions<RunnerOptions> options, CancellationToken ct) =>
{
    var languages = new Dictionary<string, LanguageInfo> { ["csharp"] = new(CSharpExecutor.Toolchain) };
    if (await rust.VersionAsync(ct) is { } rustVersion) languages["rust"] = new(rustVersion);
    var o = options.Value;
    return new RunnerInfo(languages, new RunnerLimits(o.MaxCodeBytes, o.CompileTimeoutSeconds, o.RunTimeoutSeconds, o.MaxOutputBytes));
});

app.MapPost("/run", async Task<Results<Ok<RunResult>, BadRequest<string>, StatusCodeHttpResult>> (
    RunRequest request,
    CSharpExecutor csharp,
    RustExecutor rust,
    SemaphoreSlim gate,
    IOptions<RunnerOptions> options,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Code)) return TypedResults.BadRequest("code is empty");
    if (System.Text.Encoding.UTF8.GetByteCount(request.Code) > options.Value.MaxCodeBytes)
    {
        return TypedResults.BadRequest($"code is larger than {options.Value.MaxCodeBytes} bytes");
    }
    if (request.Language is not ("csharp" or "rust")) return TypedResults.BadRequest("language must be 'csharp' or 'rust'");
    if (request.Language == "rust" && await rust.VersionAsync(ct) is null) return TypedResults.BadRequest("rust is not available on this runner");

    if (!await gate.WaitAsync(TimeSpan.FromSeconds(options.Value.QueueTimeoutSeconds), ct))
    {
        return TypedResults.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
    try
    {
        var result = request.Language == "csharp"
            ? await csharp.RunAsync(request.Code, execute: true, ct)
            : await rust.RunAsync(request.Code, execute: true, ct);
        return TypedResults.Ok(result);
    }
    finally
    {
        gate.Release();
    }
}).RequireRateLimiting("per-ip");

app.Run();
return 0;

/// <summary>Exposed for WebApplicationFactory in runner.Tests.</summary>
public partial class Program;
