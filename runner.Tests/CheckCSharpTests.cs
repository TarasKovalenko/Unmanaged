using System.Text;
using System.Text.Json;

namespace Unmanaged.Runner.Tests;

public sealed class CheckCSharpTests
{
    private static async Task<(int ExitCode, JsonElement Results)> Check(string json)
    {
        using var input = new MemoryStream(Encoding.UTF8.GetBytes(json));
        using var output = new MemoryStream();

        var exitCode = await CheckCSharp.RunAsync(input, output);

        Assert.True(input.CanRead && output.CanRead, "the caller's streams are left open");
        return (exitCode, JsonDocument.Parse(output.ToArray()).RootElement);
    }

    [Fact]
    public async Task Each_unit_is_run_compiled_or_reported_as_failing_in_input_order()
    {
        var (exitCode, results) = await Check("""
            [
              { "id": "program", "code": "Console.Write(\"hi\"); Console.Error.Write(\"warn\"); return 2;", "run": true },
              { "id": "excerpt", "code": "public sealed record Money(decimal Amount);", "run": true },
              { "id": "broken", "code": "int x = \"a\";", "run": true },
              { "id": "not-run", "code": "Console.Write(\"hi\");", "run": false }
            ]
            """);

        Assert.Equal(0, exitCode);
        Assert.Equal(4, results.GetArrayLength());

        var program = results[0];
        Assert.Equal("program", program.GetProperty("id").GetString());
        Assert.Equal("run", program.GetProperty("mode").GetString());
        Assert.True(program.GetProperty("compiled").GetBoolean());
        Assert.Equal("", program.GetProperty("diagnostics").GetString());
        Assert.Equal("hi", program.GetProperty("stdout").GetString());
        Assert.Equal("warn", program.GetProperty("stderr").GetString());
        Assert.Equal(2, program.GetProperty("exitCode").GetInt32());
        Assert.False(program.GetProperty("timedOut").GetBoolean());

        var excerpt = results[1];
        Assert.Equal("excerpt", excerpt.GetProperty("id").GetString());
        Assert.Equal("compile-only", excerpt.GetProperty("mode").GetString());
        Assert.True(excerpt.GetProperty("compiled").GetBoolean());
        Assert.Equal(JsonValueKind.Null, excerpt.GetProperty("stdout").ValueKind);
        Assert.Equal(JsonValueKind.Null, excerpt.GetProperty("stderr").ValueKind);
        Assert.Equal(JsonValueKind.Null, excerpt.GetProperty("exitCode").ValueKind);
        Assert.False(excerpt.GetProperty("timedOut").GetBoolean());

        var broken = results[2];
        Assert.Equal("broken", broken.GetProperty("id").GetString());
        Assert.False(broken.GetProperty("compiled").GetBoolean());
        Assert.StartsWith("Program.cs(1,9): error CS0029", broken.GetProperty("diagnostics").GetString());
        Assert.Equal(JsonValueKind.Null, broken.GetProperty("exitCode").ValueKind);

        var notRun = results[3];
        Assert.Equal("run", notRun.GetProperty("mode").GetString());
        Assert.True(notRun.GetProperty("compiled").GetBoolean());
        Assert.Equal(JsonValueKind.Null, notRun.GetProperty("stdout").ValueKind);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("null")]
    public async Task No_units_give_an_empty_result(string json)
    {
        var (exitCode, results) = await Check(json);

        Assert.Equal(0, exitCode);
        Assert.Equal(JsonValueKind.Array, results.ValueKind);
        Assert.Equal(0, results.GetArrayLength());
    }
}
