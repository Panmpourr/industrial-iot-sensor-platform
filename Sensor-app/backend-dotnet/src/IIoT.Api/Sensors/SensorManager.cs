using System.Collections.Concurrent;
using IIoT.Api.Data;

namespace IIoT.Api.Sensors;

/// <summary>
/// Owns the live connectors of all sensors. On startup it reconnects every sensor stored in the
/// database, so data collection survives a backend restart.
/// </summary>
public sealed class SensorManager(
    SensorRepository sensors,
    SensorConnectorFactory factory,
    ILogger<SensorManager> logger)
    : IHostedService, IAsyncDisposable
{
    private readonly ConcurrentDictionary<Guid, ISensorConnector> _active = new();
    private readonly CancellationTokenSource _shutdown = new();

    /// <summary>Starts collecting data for <paramref name="sensor"/>. Throws if it cannot be started.</summary>
    public async Task StartSensorAsync(SensorRecord sensor, CancellationToken ct)
    {
        var connector = factory.Create(sensor, reading => sensors.InsertReadingAsync(sensor.Id, reading));
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
        logger.LogInformation("Started {Type} sensor {SensorId}", sensor.Type, sensor.Id);
    }

    public async Task StopSensorAsync(Guid sensorId)
    {
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
