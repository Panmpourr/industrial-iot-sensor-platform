using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using IIoT.Api.Data;
using IIoT.Api.Hubs;
using IIoT.Api.Notifications;
using IIoT.Api.Sensors;
using Microsoft.AspNetCore.SignalR;

namespace IIoT.Api.Alarms;

/// <summary>An alarm as sent to the dashboard (times in Unix milliseconds).</summary>
public sealed record AlarmView(
    Guid Id, Guid SensorId, string Condition, string Priority, double? Limit, double? Value,
    long RaisedAt, long? ClearedAt, long? AckedAt, string? AckedBy, string State)
{
    public static AlarmView From(AlarmRecord a) => new(
        a.Id, a.SensorId, a.Condition, a.Priority, a.LimitValue, a.Value,
        Ms(a.RaisedAt), a.ClearedAt is { } c ? Ms(c) : null, a.AckedAt is { } k ? Ms(k) : null, a.AckedBy, a.State);

    private static long Ms(DateTime utc) => new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
}

/// <summary>
/// Raises and clears alarms for every running sensor: limit alarms (HIHI / HI / LO / LOLO) from
/// each reading, and a communication alarm (COMM) when a sensor stops reporting. Every change is
/// stored in the alarm journal and pushed to the dashboards through <see cref="SensorHub"/>, and
/// handed to the notification service (Telegram).
/// </summary>
public sealed class AlarmService(
    AlarmRepository alarms, IHubContext<SensorHub> hub, NotificationSignals notifications, ILogger<AlarmService> logger)
    : BackgroundService
{
    private static readonly TimeSpan CommCheckInterval = TimeSpan.FromSeconds(5);

    private sealed class SensorAlarms(SensorRecord sensor)
    {
        public SensorRecord Sensor { get; set; } = sensor;
        public SemaphoreSlim Lock { get; } = new(1, 1);
        public Dictionary<string, AlarmState> States { get; } = [];
        public DateTimeOffset LastReading { get; set; } = DateTimeOffset.UtcNow;
    }

    private readonly ConcurrentDictionary<Guid, SensorAlarms> _sensors = new();
    private Task<HashSet<(Guid, string)>>? _restored;

    /// <summary>Starts (or, after a settings change, updates) alarm monitoring of a sensor.</summary>
    public void Track(SensorRecord sensor)
    {
        var entry = _sensors.GetOrAdd(sensor.Id, _ => new SensorAlarms(sensor));
        entry.Sensor = sensor;
    }

    /// <summary>The sensor was deleted; its alarms are removed by the database (ON DELETE CASCADE).</summary>
    public void Untrack(Guid sensorId) => _sensors.TryRemove(sensorId, out _);

    public async Task OnReadingAsync(Guid sensorId, JsonObject reading)
    {
        if (!_sensors.TryGetValue(sensorId, out var entry))
        {
            return;
        }

        try
        {
            var active = await RestoredAsync();
            await entry.Lock.WaitAsync();
            try
            {
                var now = DateTimeOffset.UtcNow;
                entry.LastReading = now;
                if (State(entry, AlarmConditions.Comm, active).Active)
                {
                    await ChangeAsync(entry, AlarmConditions.Comm, AlarmTransition.Clear, null, null, null);
                }

                if (Readings.PrimaryValue(reading) is { } value)
                {
                    await EvaluateLimitsAsync(entry, value, now, active);
                }
            }
            finally
            {
                entry.Lock.Release();
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Alarm evaluation failed for sensor {SensorId}", sensorId);
        }
    }

    public async Task<IReadOnlyList<AlarmView>> AcknowledgeAsync(Guid siteId, string userId, Guid[] alarmIds)
    {
        var changed = await alarms.AcknowledgeAsync(siteId, userId, alarmIds);
        foreach (var alarm in changed)
        {
            await PublishAsync(alarm);
        }
        notifications.AlarmsAcknowledged(changed.Select(a => a.Id));
        return changed.Select(AlarmView.From).ToList();
    }

    private async Task EvaluateLimitsAsync(SensorAlarms entry, double value, DateTimeOffset now, HashSet<(Guid, string)> active)
    {
        var limits = AlarmLimits.From(new SensorDetails(entry.Sensor.Details).GetObject("threshold"));
        var configured = limits?.All().ToDictionary(l => l.Condition) ?? [];

        foreach (var condition in AlarmConditions.Limits)
        {
            var state = State(entry, condition, active);
            if (!configured.TryGetValue(condition, out var limit))
            {
                // The limit was removed in the sensor settings
                if (state.Active)
                {
                    await ChangeAsync(entry, condition, AlarmTransition.Clear, null, null, null);
                }
                continue;
            }

            var transition = state.Update(limit, value, limits!.Deadband, limits.OnDelay, now);
            if (transition != AlarmTransition.None)
            {
                await ChangeAsync(entry, condition, transition, limit.Priority, limit.Value, value);
            }
        }
    }

    /// <summary>Stores a raise / clear and publishes it. On a database error the state is rolled back so the next reading retries.</summary>
    private async Task ChangeAsync(SensorAlarms entry, string condition, AlarmTransition transition, string? priority, double? limit, double? value)
    {
        var state = entry.States[condition];
        try
        {
            var alarm = transition == AlarmTransition.Raise
                ? await alarms.RaiseAsync(entry.Sensor.Id, condition, priority!, limit, value)
                : await alarms.ClearAsync(entry.Sensor.Id, condition);
            state.Set(transition == AlarmTransition.Raise);
            if (alarm is not null)
            {
                await PublishAsync(alarm);
            }
            if (transition == AlarmTransition.Raise)
            {
                notifications.AlarmRaised();
            }
        }
        catch
        {
            state.Set(transition != AlarmTransition.Raise);
            throw;
        }
    }

    private Task PublishAsync(AlarmRecord alarm) =>
        hub.Clients.Group(SensorHub.GroupFor(alarm.SensorId)).SendAsync(SensorHub.AlarmMethod, AlarmView.From(alarm));

    /// <summary>The state of one condition, starting as active if the journal has an open alarm for it.</summary>
    private static AlarmState State(SensorAlarms entry, string condition, HashSet<(Guid, string)> active)
    {
        if (!entry.States.TryGetValue(condition, out var state))
        {
            state = new AlarmState(active.Contains((entry.Sensor.Id, condition)));
            entry.States[condition] = state;
        }
        return state;
    }

    /// <summary>Conditions that were active when the backend stopped, loaded once (again after a failure).</summary>
    private Task<HashSet<(Guid, string)>> RestoredAsync()
    {
        var task = _restored;
        if (task is null || task.IsFaulted)
        {
            _restored = task = LoadActiveAsync();
        }
        return task;
    }

    private async Task<HashSet<(Guid, string)>> LoadActiveAsync() =>
        (await alarms.GetActiveAsync()).Select(a => (a.SensorId, a.Condition)).ToHashSet();

    /// <summary>Raises COMM for sensors that have been silent too long.</summary>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CommCheckInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var entry in _sensors.Values)
            {
                try
                {
                    await CheckCommunicationAsync(entry);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Communication check failed for sensor {SensorId}", entry.Sensor.Id);
                }
            }
        }
    }

    private async Task CheckCommunicationAsync(SensorAlarms entry)
    {
        var active = await RestoredAsync();
        await entry.Lock.WaitAsync();
        try
        {
            var silentFor = DateTimeOffset.UtcNow - entry.LastReading;
            if (silentFor > SensorTypes.MaxSilence(entry.Sensor.Type) && !State(entry, AlarmConditions.Comm, active).Active)
            {
                await ChangeAsync(entry, AlarmConditions.Comm, AlarmTransition.Raise, ThresholdEvaluator.Warning, null, null);
            }
        }
        finally
        {
            entry.Lock.Release();
        }
    }
}
