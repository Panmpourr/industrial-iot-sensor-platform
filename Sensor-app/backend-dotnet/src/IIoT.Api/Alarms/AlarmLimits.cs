using System.Text.Json;
using IIoT.Api.Sensors;

namespace IIoT.Api.Alarms;

/// <summary>Alarm conditions (ISA-18.2 style tags) and their priorities.</summary>
public static class AlarmConditions
{
    public const string HiHi = "HIHI";
    public const string Hi = "HI";
    public const string Lo = "LO";
    public const string LoLo = "LOLO";
    /// <summary>The sensor stopped reporting.</summary>
    public const string Comm = "COMM";

    public static readonly string[] Limits = [HiHi, Hi, Lo, LoLo];
}

/// <summary>One limit of a sensor, e.g. "HI: above 70".</summary>
public sealed record AlarmLimit(string Condition, string Priority, double Value, bool High)
{
    public bool Exceeded(double value) => High ? value > Value : value < Value;

    /// <summary>Back inside the limit by at least <paramref name="deadband"/>, so the alarm may clear.</summary>
    public bool Returned(double value, double deadband) => High ? value <= Value - deadband : value >= Value + deadband;
}

/// <summary>
/// The alarm settings stored in a sensor's <c>threshold</c> object:
/// <c>warning</c> / <c>critical</c> (HI / HIHI, both required), optional <c>lowWarning</c> /
/// <c>lowCritical</c> (LO / LOLO), <c>deadband</c> (same unit as the value) and <c>onDelay</c> (seconds).
/// </summary>
public sealed record AlarmLimits(double? HiHi, double? Hi, double? Lo, double? LoLo, double Deadband, TimeSpan OnDelay)
{
    /// <returns><c>null</c> when no usable limit is configured.</returns>
    public static AlarmLimits? From(JsonElement? threshold)
    {
        if (threshold is not { ValueKind: JsonValueKind.Object } t)
        {
            return null;
        }

        double? Get(string name) => t.TryGetProperty(name, out var e) ? SensorDetails.ToDouble(e) : null;

        var hi = Get("warning");
        var hiHi = Get("critical");
        if (hi is null || hiHi is null)
        {
            hi = hiHi = null;
        }
        var lo = Get("lowWarning");
        var loLo = Get("lowCritical");
        if (hi is null && lo is null && loLo is null)
        {
            return null;
        }

        return new AlarmLimits(hiHi, hi, lo, loLo,
            Math.Max(0, Get("deadband") ?? 0),
            TimeSpan.FromSeconds(Math.Max(0, Get("onDelay") ?? 0)));
    }

    public IEnumerable<AlarmLimit> All()
    {
        if (HiHi is { } hh) yield return new(AlarmConditions.HiHi, ThresholdEvaluator.Critical, hh, High: true);
        if (Hi is { } h) yield return new(AlarmConditions.Hi, ThresholdEvaluator.Warning, h, High: true);
        if (Lo is { } l) yield return new(AlarmConditions.Lo, ThresholdEvaluator.Warning, l, High: false);
        if (LoLo is { } ll) yield return new(AlarmConditions.LoLo, ThresholdEvaluator.Critical, ll, High: false);
    }
}

public enum AlarmTransition
{
    None,
    Raise,
    Clear,
}

/// <summary>
/// On-delay and deadband logic of one alarm condition of one sensor. The condition must stay
/// exceeded for the whole on-delay before the alarm is raised (filters short spikes), and the value
/// must come back past the limit by the deadband before it clears (stops the alarm from chattering
/// when the value hovers around the limit).
/// </summary>
public sealed class AlarmState(bool active = false)
{
    private DateTimeOffset? _exceededSince;

    public bool Active { get; private set; } = active;

    public AlarmTransition Update(AlarmLimit limit, double value, double deadband, TimeSpan onDelay, DateTimeOffset time)
    {
        if (Active)
        {
            if (!limit.Returned(value, deadband))
            {
                return AlarmTransition.None;
            }
            Active = false;
            return AlarmTransition.Clear;
        }

        if (!limit.Exceeded(value))
        {
            _exceededSince = null;
            return AlarmTransition.None;
        }

        _exceededSince ??= time;
        if (time - _exceededSince < onDelay)
        {
            return AlarmTransition.None;
        }
        _exceededSince = null;
        Active = true;
        return AlarmTransition.Raise;
    }

    /// <summary>Sets the state directly (limit removed, communication alarm, failed database write).</summary>
    public void Set(bool active)
    {
        Active = active;
        _exceededSince = null;
    }
}
