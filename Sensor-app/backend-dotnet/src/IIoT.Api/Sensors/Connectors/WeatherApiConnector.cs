using System.Text.Json;
using System.Text.Json.Nodes;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>Polls weatherapi.com every 5 seconds for temperature and humidity.</summary>
public sealed class WeatherApiConnector(
    SensorDetails details,
    ReadingSink sink,
    HttpClient http,
    ILogger<WeatherApiConnector> logger)
    : PollingConnector(TimeSpan.FromSeconds(5), logger)
{
    private readonly string _apiKey = details.RequireString("apiKey");
    private readonly string _location = details.RequireString("location");

    protected override async Task PollAsync(CancellationToken ct)
    {
        var url = "https://api.weatherapi.com/v1/current.json" +
                  $"?key={Uri.EscapeDataString(_apiKey)}&q={Uri.EscapeDataString(_location)}&aqi=no";

        using var response = await http.GetAsync(url, ct);
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;

        if (root.TryGetProperty("error", out var error))
        {
            Logger.LogWarning("Weather API error: {Message}", error.GetProperty("message").GetString());
            return;
        }

        var current = root.GetProperty("current");
        var temp = current.GetProperty("temp_c").GetDouble();
        var humidity = current.GetProperty("humidity").GetDouble();
        var threshold = details.GetObject("threshold");

        var reading = new JsonObject
        {
            ["temp"] = temp,
            ["humidity"] = humidity,
            ["timestamp"] = Readings.Now(),
        };
        if (ThresholdEvaluator.Evaluate(temp, threshold) is { } tempStatus)
        {
            reading["tempStatus"] = tempStatus;
        }
        if (ThresholdEvaluator.Evaluate(humidity, threshold) is { } humidityStatus)
        {
            reading["humidityStatus"] = humidityStatus;
        }

        await sink(reading);
    }
}
