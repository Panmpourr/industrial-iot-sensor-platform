using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using IIoT.Api.Alarms;
using IIoT.Api.Data;
using IIoT.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace IIoT.Api.Sensors;

/// <summary>
/// Owns the live connectors of all sensors. On startup it reconnects every sensor stored in the
/// database, so data collection survives a backend restart. Every stored reading is also pushed
/// to subscribed dashboards through <see cref="SensorHub"/> and checked for alarms by <see cref="AlarmService"/>.
/// </summary>
public sealed class SensorManager(
    SensorRepository sensors,
    SensorConnectorFactory factory,
    AlarmService alarms,
    IHubContext<SensorHub> hub,
    ILogger<SensorManager> logger)
    : IHostedService, IAsyncDisposable
{
    private readonly ConcurrentDictionary<Guid, ISensorConnector> _active = new();
    private readonly CancellationTokenSource _shutdown = new();

    /// <summary>Starts collecting data for <paramref name="sensor"/>. Throws if it cannot be started.</summary>
    public async Task StartSensorAsync(SensorRecord sensor, CancellationToken ct)
    {
        var connector = factory.Create(sensor, reading => StoreAndPublishAsync(sensor.Id, reading));
        if (connector is null)
        {
            logger.LogWarning("Unhandled sensor type: {Type}", sensor.Type);
            return;
        }

        try
        {
            await connector.StartAsync(ct);
        }
        catch
        {
            await connector.DisposeAsync();
            throw;
        }

        if (_active.TryRemove(sensor.Id, out var previous))
        {
            await previous.DisposeAsync();
        }
        _active[sensor.Id] = connector;
        alarms.Track(sensor);
        logger.LogInformation("Started {Type} sensor {SensorId}", sensor.Type, sensor.Id);
    }

    private async Task StoreAndPublishAsync(Guid sensorId, JsonObject reading)
    {
        await sensors.InsertReadingAsync(sensorId, reading);
        await hub.Clients.Group(SensorHub.GroupFor(sensorId))
            .SendAsync(SensorHub.ReadingMethod, sensorId.ToString(), reading);
        await alarms.OnReadingAsync(sensorId, reading);
    }

    public async Task StopSensorAsync(Guid sensorId)
    {
        alarms.Untrack(sensorId);
        if (_active.TryRemove(sensorId, out var connector))
        {
            await connector.DisposeAsync();
            logger.LogInformation("Stopped sensor {SensorId}", sensorId);
        }
    }

    Task IHostedService.StartAsync(CancellationToken cancellationToken)
    {
        // Reconnect in the background so a slow or unreachable device never delays API startup.
        _ = Task.Run(() => RestoreSensorsAsync(_shutdown.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    private async Task RestoreSensorsAsync(CancellationToken ct)
    {
        IReadOnlyList<SensorRecord> all;
        try
        {
            all = await sensors.GetAllAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not load sensors from the database");
            return;
        }

        logger.LogInformation("Restoring {Count} sensor(s)", all.Count);
        foreach (var sensor in all)
        {
            try
            {
                await StartSensorAsync(sensor, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning("Could not start {Type} sensor {SensorId}: {Message}", sensor.Type, sensor.Id, ex.Message);
            }
        }
    }

    async Task IHostedService.StopAsync(CancellationToken cancellationToken)
    {
        await _shutdown.CancelAsync();
        foreach (var id in _active.Keys)
        {
            await StopSensorAsync(id);
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var id in _active.Keys)
        {
            await StopSensorAsync(id);
        }
        _shutdown.Dispose();
    }
}
