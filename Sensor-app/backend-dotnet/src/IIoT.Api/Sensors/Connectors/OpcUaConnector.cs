using System.Text.Json.Nodes;
using Opc.Ua;
using Opc.Ua.Client;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>
/// Subscribes to one OPC UA node (data-change notifications, 1 s sampling) and stores every change.
/// If the server goes away the connector keeps retrying every 5 seconds.
/// </summary>
public sealed class OpcUaConnector(
    SensorDetails details,
    ReadingSink sink,
    OpcUaClient opcUa,
    ILogger<OpcUaConnector> logger)
    : ISensorConnector
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(5);

    private readonly string _endpointUrl = details.RequireString("endpointUrl");
    private readonly NodeId _nodeId = NodeId.Parse(details.RequireString("nodeId"));
    private readonly CancellationTokenSource _stop = new();
    private Task? _loop;

    public Task StartAsync(CancellationToken ct)
    {
        _loop = Task.Run(() => RunAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await RunSessionAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning("OPC UA {Endpoint}: {Message}. Retrying in {Delay}s",
                    _endpointUrl, ex.Message, RetryDelay.TotalSeconds);
            }

            try
            {
                await Task.Delay(RetryDelay, ct);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    /// <summary>Connects, subscribes, and returns when the connection is lost or the connector is stopped.</summary>
    private async Task RunSessionAsync(CancellationToken ct)
    {
        using var session = await opcUa.OpenSessionAsync(_endpointUrl, "IIoT Sensor Platform", ct);
        logger.LogInformation("OPC UA connected to {Endpoint}, monitoring {NodeId}", _endpointUrl, _nodeId);

        var connectionLost = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        session.KeepAlive += (_, e) =>
        {
            if (ServiceResult.IsBad(e.Status))
            {
                connectionLost.TrySetResult();
            }
        };

        var subscription = new Subscription(session.DefaultSubscription)
        {
            PublishingInterval = 1000,
            MaxNotificationsPerPublish = 1000,
            // Must outlive the session timeout (60 s) so the server keeps the subscription during short outages
            MinLifetimeInterval = 120_000,
        };
        var item = new MonitoredItem(subscription.DefaultItem)
        {
            StartNodeId = _nodeId,
            AttributeId = Attributes.Value,
            SamplingInterval = 1000,
            QueueSize = 10,
            DiscardOldest = true,
        };
        item.Notification += OnNotification;
        subscription.AddItem(item);
        session.AddSubscription(subscription);
        await subscription.CreateAsync(ct);

        try
        {
            await connectionLost.Task.WaitAsync(ct);
            logger.LogWarning("OPC UA connection to {Endpoint} lost", _endpointUrl);
        }
        finally
        {
            item.Notification -= OnNotification;
            try
            {
                await session.CloseAsync(CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogDebug("OPC UA close failed: {Message}", ex.Message);
            }
        }
    }

    private void OnNotification(MonitoredItem item, MonitoredItemNotificationEventArgs e)
    {
        if (e.NotificationValue is not MonitoredItemNotification { Value: { } dataValue }
            || StatusCode.IsNotGood(dataValue.StatusCode)
            || dataValue.Value is null)
        {
            logger.LogWarning("Invalid OPC UA data for {NodeId}", _nodeId);
            return;
        }

        var reading = ToReading(dataValue.Value);
        _ = StoreAsync(reading);
    }

    private JsonObject ToReading(object value) => value switch
    {
        bool b => new JsonObject { ["value"] = b, ["timestamp"] = Readings.Now() },
        IConvertible c when IsNumeric(value) => Readings.Numeric(c.ToDouble(null), details),
        _ => new JsonObject { ["value"] = value.ToString(), ["timestamp"] = Readings.Now() },
    };

    private static bool IsNumeric(object value) =>
        value is byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal;

    private async Task StoreAsync(JsonObject reading)
    {
        try
        {
            await sink(reading);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to store OPC UA reading");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        if (_loop is not null)
        {
            await _loop;
        }
        _stop.Dispose();
    }
}
