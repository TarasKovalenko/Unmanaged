using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Unmanaged.Runner.Tests.Support;

namespace Unmanaged.Runner.Tests;

public sealed class ApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly TempDirectory _directory = new();

    public void Dispose() => _directory.Dispose();

    /// <summary>A runner with test settings on top of appsettings.json. Rust is unavailable unless a rustc is given.</summary>
    private WebApplicationFactory<Program> Runner(params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Runner:Rustc", _directory.Combine("missing", "rustc"));
            builder.UseSetting("Runner:RequestsPerMinute", "1000");
            foreach (var (key, value) in settings) builder.UseSetting($"Runner:{key}", value);
        });

    private static StringContent Json(string json) => new(json, System.Text.Encoding.UTF8, "application/json");

    [Fact]
    public async Task Health_answers_ok()
    {
        var response = await Runner().CreateClient().GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Info_lists_csharp_and_the_configured_limits_but_not_rust_without_rustc()
    {
        var client = Runner(("MaxCodeBytes", "1000"), ("CompileTimeoutSeconds", "7"), ("RunTimeoutSeconds", "3"), ("MaxOutputBytes", "2000")).CreateClient();

        var info = await client.GetFromJsonAsync<RunnerInfo>("/info");

        Assert.NotNull(info);
        Assert.Equal(["csharp"], info.Languages.Keys);
        Assert.Equal(Execution.CSharpExecutor.Toolchain, info.Languages["csharp"].Version);
        Assert.Equal(new RunnerLimits(1000, 7, 3, 2000), info.Limits);
    }

    [Fact]
    public async Task Info_serialises_camel_case()
    {
        var json = await Runner().CreateClient().GetStringAsync("/info");

        Assert.Contains("\"languages\":{\"csharp\":{\"version\":", json);
        Assert.Contains("\"maxCodeBytes\":65536", json);
    }

    [Fact]
    public async Task Info_lists_rust_when_rustc_is_available()
    {
        var client = Runner(("Rustc", FakeRustc.Create(_directory))).CreateClient();

        var info = await client.GetFromJsonAsync<RunnerInfo>("/info");

        Assert.Equal(FakeRustc.Version, info!.Languages["rust"].Version);
        Assert.Contains("csharp", info.Languages.Keys);
    }

    [Theory]
    [InlineData("python", "print(1)", "language must be 'csharp' or 'rust'")]
    [InlineData("csharp", "", "code is empty")]
    [InlineData("csharp", "   \n\t", "code is empty")]
    [InlineData("rust", "fn main() {}", "rust is not available on this runner")]
    public async Task Invalid_requests_are_rejected(string language, string code, string error)
    {
        var response = await Runner().CreateClient().PostAsJsonAsync("/run", new { language, code });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await response.Content.ReadFromJsonAsync<string>());
    }

    [Fact]
    public async Task Oversized_code_is_rejected_counting_utf8_bytes()
    {
        var client = Runner(("MaxCodeBytes", "10")).CreateClient();

        // 4 characters, 12 bytes.
        var response = await client.PostAsJsonAsync("/run", new { language = "csharp", code = "€€€€" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("code is larger than 10 bytes", await response.Content.ReadFromJsonAsync<string>());
    }

    [Fact]
    public async Task Runs_csharp_end_to_end()
    {
        var response = await Runner().CreateClient().PostAsJsonAsync("/run", new { language = "csharp", code = "Console.Write(\"hello\");" });
        var result = await response.Content.ReadFromJsonAsync<RunResult>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("csharp", result!.Language);
        Assert.Equal("hello", result.Execution!.Stdout);
    }

    [Fact]
    public async Task Runs_rust_end_to_end()
    {
        var client = Runner(("Rustc", FakeRustc.Create(_directory))).CreateClient();

        var response = await client.PostAsJsonAsync("/run", new { language = "rust", code = FakeRustc.Emitting("echo 4") });
        var result = await response.Content.ReadFromJsonAsync<RunResult>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("rust", result!.Language);
        Assert.Equal("run", result.Mode);
        Assert.Equal("4\n", result.Execution!.Stdout);
    }

    [Fact]
    public async Task Requests_wait_for_a_free_slot_and_get_503_when_none_frees_up_in_time()
    {
        using var runner = Runner(("MaxConcurrency", "1"), ("QueueTimeoutSeconds", "0"));
        var client = runner.CreateClient();
        var gate = runner.Services.GetRequiredService<SemaphoreSlim>();
        var request = new { language = "csharp", code = "Console.Write(1);" };

        Assert.True(await gate.WaitAsync(0), "the only slot is free before any run");
        var busy = await client.PostAsJsonAsync("/run", request);
        gate.Release();
        var free = await client.PostAsJsonAsync("/run", request);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, busy.StatusCode);
        Assert.Equal(HttpStatusCode.OK, free.StatusCode);
        Assert.Equal(1, gate.CurrentCount);
    }

    [Fact]
    public async Task Runs_are_rate_limited_per_client()
    {
        var client = Runner(("RequestsPerMinute", "2")).CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++) statuses.Add((await client.PostAsync("/run", Json("{\"language\":\"python\",\"code\":\"x\"}"))).StatusCode);
        var health = await client.GetAsync("/health");

        Assert.Equal([HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, HttpStatusCode.TooManyRequests], statuses);
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
    }

    [Fact]
    public async Task Forwarded_client_addresses_are_ignored_by_default_so_they_cannot_dodge_the_rate_limit()
    {
        var client = Runner(("RequestsPerMinute", "1")).CreateClient();

        var first = await PostFrom(client, "203.0.113.1");
        var second = await PostFrom(client, "203.0.113.2");

        Assert.Equal(HttpStatusCode.BadRequest, first);
        Assert.Equal(HttpStatusCode.TooManyRequests, second);
    }

    [Fact]
    public async Task Forwarded_client_addresses_are_rate_limited_separately_when_the_proxy_is_trusted()
    {
        var client = Runner(("RequestsPerMinute", "1"), ("TrustForwardedHeaders", "true")).CreateClient();

        var first = await PostFrom(client, "203.0.113.1");
        var other = await PostFrom(client, "203.0.113.2");
        var again = await PostFrom(client, "203.0.113.1");

        Assert.Equal(HttpStatusCode.BadRequest, first);
        Assert.Equal(HttpStatusCode.BadRequest, other);
        Assert.Equal(HttpStatusCode.TooManyRequests, again);
    }

    [Fact]
    public async Task Cors_allows_only_the_configured_origins()
    {
        var client = Runner(("AllowedOrigins:0", "https://unmanaged.example"), ("AllowedOrigins:1", "https://other.example")).CreateClient();

        var allowed = await GetWithOrigin(client, "https://unmanaged.example");
        var denied = await GetWithOrigin(client, "http://localhost:5173");

        Assert.Equal(["https://unmanaged.example"], allowed.Headers.GetValues("Access-Control-Allow-Origin"));
        Assert.False(denied.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.Equal(HttpStatusCode.OK, denied.StatusCode);
    }

    [Fact]
    public async Task Cors_allows_the_development_origins_from_appsettings_by_default()
    {
        var client = Runner().CreateClient();

        foreach (var origin in new[] { "http://localhost:5173", "http://localhost:4173" })
        {
            var response = await GetWithOrigin(client, origin);
            Assert.Equal([origin], response.Headers.GetValues("Access-Control-Allow-Origin"));
        }
    }

    [Fact]
    public async Task Cors_preflight_allows_only_get_and_post_with_a_content_type_header()
    {
        var client = Runner(("AllowedOrigins:0", "https://unmanaged.example")).CreateClient();

        // The browser enforces the answer, so the policy is the same whatever was asked for.
        foreach (var (method, header) in new[] { ("POST", "content-type"), ("DELETE", "authorization") })
        {
            var response = await Preflight(client, method, header);

            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Equal("GET,POST", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Methods")));
            Assert.Equal("content-type", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Headers")));
        }
    }

    private static async Task<HttpStatusCode> PostFrom(HttpClient client, string address)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/run") { Content = Json("{\"language\":\"python\",\"code\":\"x\"}") };
        request.Headers.Add("X-Forwarded-For", address);
        return (await client.SendAsync(request)).StatusCode;
    }

    private static async Task<HttpResponseMessage> GetWithOrigin(HttpClient client, string origin)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", origin);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> Preflight(HttpClient client, string method, string header)
    {
        using var request = new HttpRequestMessage(HttpMethod.Options, "/run");
        request.Headers.Add("Origin", "https://unmanaged.example");
        request.Headers.Add("Access-Control-Request-Method", method);
        request.Headers.Add("Access-Control-Request-Headers", header);
        return await client.SendAsync(request);
    }
}
