using System.Text.Json;
using System.Text.Json.Nodes;
using MQTTnet;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>
/// Subscribes to uplink messages of a LoRaWAN device on The Things Network (TTN v3) over MQTT/TLS
/// and stores each decoded payload as <c>{ raw, timestamp }</c>.
/// </summary>
public sealed class TtnMqttConnector(SensorDetails details, ReadingSink sink, ILogger<TtnMqttConnector> logger)
    : ISensorConnector
{
    private const string Host = "eu1.cloud.thethings.network";
    private const int Port = 8883;

    private readonly string _applicationId = details.RequireString("applicationId");
    private readonly string _apiKey = details.RequireString("apiKey");
    private readonly string _clusterId = details.RequireString("clusterId");
    private readonly string _deviceId = details.RequireString("deviceId");
    private readonly CancellationTokenSource _stop = new();

    private IMqttClient? _client;
    private MqttClientOptions? _options;

    private string Username => $"{_applicationId}@{_clusterId}";
    private string Topic => $"v3/{Username}/devices/{_deviceId}/up";

    public async Task StartAsync(CancellationToken ct)
    {
        var factory = new MqttClientFactory();
        _client = factory.CreateMqttClient();
        _options = new MqttClientOptionsBuilder()
            .WithTcpServer(Host, Port)
            .WithCredentials(Username, _apiKey)
            .WithTlsOptions(o => o.UseTls())
            .WithCleanSession()
            .Build();

        _client.ApplicationMessageReceivedAsync += OnMessageAsync;
        await ConnectAndSubscribeAsync(ct);
        _client.DisconnectedAsync += OnDisconnectedAsync;
    }

    private async Task ConnectAndSubscribeAsync(CancellationToken ct)
    {
        await _client!.ConnectAsync(_options!, ct);
        await _client.SubscribeAsync(new MqttClientSubscribeOptionsBuilder().WithTopicFilter(Topic).Build(), ct);
        logger.LogInformation("Subscribed to TTN topic {Topic}", Topic);
    }

    private async Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs e)
    {
        while (!_stop.IsCancellationRequested)
        {
            logger.LogWarning("TTN MQTT disconnected ({Reason}), reconnecting in 5 s", e.Reason);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), _stop.Token);
                await ConnectAndSubscribeAsync(_stop.Token);
                return;
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning("TTN reconnect failed: {Message}", ex.Message);
            }
        }
    }

    private async Task OnMessageAsync(MqttApplicationMessageReceivedEventArgs e)
    {
        try
        {
            var payload = JsonNode.Parse(e.ApplicationMessage.ConvertPayloadToString());
            var decoded = payload?["uplink_message"]?["decoded_payload"];
            if (decoded is null)
            {
                logger.LogWarning("TTN message without decoded_payload");
                return;
            }

            var receivedAt = payload?["received_at"]?.GetValue<string>();
            var timestamp = DateTimeOffset.TryParse(receivedAt, out var t) ? t.ToUnixTimeMilliseconds() : Readings.Now();

            await sink(new JsonObject
            {
                ["raw"] = decoded.DeepClone(),
                ["timestamp"] = timestamp,
            });
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            logger.LogWarning("Invalid TTN message: {Message}", ex.Message);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        if (_client is not null)
        {
            _client.DisconnectedAsync -= OnDisconnectedAsync;
            if (_client.IsConnected)
            {
                await _client.DisconnectAsync();
            }
            _client.Dispose();
        }
        _stop.Dispose();
    }
}
