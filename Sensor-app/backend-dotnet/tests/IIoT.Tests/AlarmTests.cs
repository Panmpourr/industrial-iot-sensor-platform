using System.Text.Json;
using IIoT.Api.Alarms;
using IIoT.Api.Data;

namespace IIoT.Tests;

public class AlarmLimitsTests
{
    private static AlarmLimits? Parse(string json) => AlarmLimits.From(JsonDocument.Parse(json).RootElement);

    [Fact]
    public void Reads_high_and_low_limits_deadband_and_on_delay()
    {
        var limits = Parse("""{ "warning": 70, "critical": "90", "lowWarning": 10, "lowCritical": 5, "deadband": 2, "onDelay": 3 }""")!;

        Assert.Equal(
            ["HIHI:90", "HI:70", "LO:10", "LOLO:5"],
            limits.All().Select(l => $"{l.Condition}:{l.Value}"));
        Assert.Equal(2, limits.Deadband);
        Assert.Equal(TimeSpan.FromSeconds(3), limits.OnDelay);
    }

    [Fact]
    public void High_limits_need_both_warning_and_critical()
    {
        var limits = Parse("""{ "warning": 70, "lowWarning": 10 }""")!;

        Assert.Equal(["LO"], limits.All().Select(l => l.Condition));
    }

    [Fact]
    public void Returns_null_without_any_limit()
    {
        Assert.Null(Parse("""{ "unit": "°C", "deadband": 1 }"""));
    }

    [Fact]
    public void Negative_deadband_and_on_delay_count_as_zero()
    {
        var limits = Parse("""{ "warning": 70, "critical": 90, "deadband": -1, "onDelay": -5 }""")!;

        Assert.Equal(0, limits.Deadband);
        Assert.Equal(TimeSpan.Zero, limits.OnDelay);
    }
}

public class AlarmStateTests
{
    private static readonly AlarmLimit High = new(AlarmConditions.Hi, "warning", 70, High: true);
    private static readonly AlarmLimit Low = new(AlarmConditions.Lo, "warning", 10, High: false);
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Raises_immediately_without_on_delay_and_clears_when_back_to_normal()
    {
        var state = new AlarmState();

        Assert.Equal(AlarmTransition.None, state.Update(High, 70, 0, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.Raise, state.Update(High, 71, 0, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.None, state.Update(High, 75, 0, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.Clear, state.Update(High, 70, 0, TimeSpan.Zero, T0));
        Assert.False(state.Active);
    }

    [Fact]
    public void Deadband_keeps_the_alarm_active_until_the_value_is_clearly_back()
    {
        var state = new AlarmState();
        state.Update(High, 72, 2, TimeSpan.Zero, T0);

        Assert.Equal(AlarmTransition.None, state.Update(High, 69, 2, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.Clear, state.Update(High, 68, 2, TimeSpan.Zero, T0));
    }

    [Fact]
    public void Low_limit_with_deadband()
    {
        var state = new AlarmState();

        Assert.Equal(AlarmTransition.Raise, state.Update(Low, 9, 1, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.None, state.Update(Low, 10.5, 1, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.Clear, state.Update(Low, 11, 1, TimeSpan.Zero, T0));
    }

    [Fact]
    public void On_delay_ignores_short_spikes()
    {
        var state = new AlarmState();
        var delay = TimeSpan.FromSeconds(10);

        Assert.Equal(AlarmTransition.None, state.Update(High, 80, 0, delay, T0));
        Assert.Equal(AlarmTransition.None, state.Update(High, 60, 0, delay, T0.AddSeconds(5)));
        // The spike ended, so the delay starts again
        Assert.Equal(AlarmTransition.None, state.Update(High, 80, 0, delay, T0.AddSeconds(6)));
        Assert.Equal(AlarmTransition.None, state.Update(High, 80, 0, delay, T0.AddSeconds(15)));
        Assert.Equal(AlarmTransition.Raise, state.Update(High, 80, 0, delay, T0.AddSeconds(16)));
    }

    [Fact]
    public void Restored_active_state_only_clears()
    {
        var state = new AlarmState(active: true);

        Assert.Equal(AlarmTransition.None, state.Update(High, 90, 0, TimeSpan.Zero, T0));
        Assert.Equal(AlarmTransition.Clear, state.Update(High, 50, 0, TimeSpan.Zero, T0));
    }
}

public class AlarmRecordTests
{
    private static readonly DateTime T = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(false, false, "active-unacked")]
    [InlineData(false, true, "active-acked")]
    [InlineData(true, false, "cleared-unacked")]
    [InlineData(true, true, "closed")]
    public void State_follows_isa_18_2(bool cleared, bool acked, string expected)
    {
        var alarm = new AlarmRecord(Guid.NewGuid(), Guid.NewGuid(), "HI", "warning", 70, 75, T,
            cleared ? T : null, acked ? T : null, acked ? "operator" : null);

        Assert.Equal(expected, alarm.State);
    }

    [Fact]
    public void View_uses_unix_milliseconds()
    {
        var alarm = new AlarmRecord(Guid.NewGuid(), Guid.NewGuid(), "HI", "warning", 70, 75, T, null, null, null);

        Assert.Equal(new DateTimeOffset(T).ToUnixTimeMilliseconds(), AlarmView.From(alarm).RaisedAt);
    }
}
