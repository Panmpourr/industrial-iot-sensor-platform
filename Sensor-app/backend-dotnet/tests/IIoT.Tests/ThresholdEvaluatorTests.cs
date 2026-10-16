using System.Text.Json;
using IIoT.Api.Sensors;

namespace IIoT.Tests;

public class ThresholdEvaluatorTests
{
    private static JsonElement Threshold(string json) => JsonDocument.Parse(json).RootElement;

    [Theory]
    [InlineData(10, "normal")]
    [InlineData(70, "normal")]
    [InlineData(70.1, "warning")]
    [InlineData(90, "warning")]
    [InlineData(95, "critical")]
    public void Classifies_value_against_warning_and_critical(double value, string expected)
    {
        var threshold = Threshold("""{ "warning": 70, "critical": 90 }""");

        Assert.Equal(expected, ThresholdEvaluator.Evaluate(value, threshold));
    }

    [Fact]
    public void Accepts_numbers_sent_as_strings()
    {
        var threshold = Threshold("""{ "warning": "70", "critical": "90" }""");

        Assert.Equal("critical", ThresholdEvaluator.Evaluate(100, threshold));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("""{ "warning": 70 }""")]
    [InlineData("""{ "warning": null, "critical": 90 }""")]
    public void Returns_null_without_usable_threshold(string? json)
    {
        JsonElement? threshold = json is null ? null : Threshold(json);

        Assert.Null(ThresholdEvaluator.Evaluate(50, threshold));
    }
}
