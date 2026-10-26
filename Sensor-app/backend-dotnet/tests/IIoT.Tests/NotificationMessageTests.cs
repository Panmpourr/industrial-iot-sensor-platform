using IIoT.Api.Data;
using IIoT.Api.Notifications;

namespace IIoT.Tests;

public class NotificationMessageTests
{
    private static AlarmContext Alarm(string condition = "HIHI", string priority = "critical", double? value = 95.25, double? limit = 90,
        string sensor = "Oven temperature", string? unit = "°C") =>
        new(Guid.NewGuid(), Guid.NewGuid(), condition, priority, limit, value, DateTime.UtcNow, null, null, null,
            Guid.NewGuid(), sensor, null, unit);

    [Fact]
    public void Describes_a_limit_alarm()
    {
        var text = NotificationMessages.Alarm(Alarm(), "Hall A / Oven 1", delayMinutes: 0);

        Assert.Equal("🔴 <b>CRITICAL</b> · High-high\n<b>Oven temperature</b>\nHall A / Oven 1\nValue 95.25 °C (above 90 °C)", text);
    }

    [Fact]
    public void Describes_a_lost_connection_and_an_escalation()
    {
        var text = NotificationMessages.Alarm(Alarm("COMM", "warning", null, null), null, delayMinutes: 10);

        Assert.Equal("🟠 <b>WARNING</b> · Communication lost\n<b>Oven temperature</b>\nNo data received\n\n⏰ Not acknowledged for 10 min", text);
    }

    [Fact]
    public void Low_alarms_say_below()
    {
        Assert.Contains("Value 2 bar (below 3 bar)", NotificationMessages.Alarm(Alarm("LO", "warning", 2, 3, unit: "bar"), null, 0));
    }

    [Fact]
    public void Escapes_names_from_the_database()
    {
        var text = NotificationMessages.Alarm(Alarm(sensor: "<b>Fake</b> & co"), "Hall <A>", 0);

        Assert.Contains("<b>&lt;b&gt;Fake&lt;/b&gt; &amp; co</b>", text);
        Assert.Contains("Hall &lt;A&gt;", text);
        Assert.Contains("✅ Acknowledged by <b>&lt;x&gt;</b>", NotificationMessages.Acknowledged(text, "<x>"));
    }

    [Fact]
    public void Acknowledge_button_round_trips_the_alarm_id()
    {
        var alarmId = Guid.NewGuid();
        var buttons = NotificationMessages.Buttons(alarmId, Guid.NewGuid(), appUrl: null);

        Assert.Single(buttons);
        Assert.Equal(alarmId, NotificationMessages.ParseAck(buttons[0].CallbackData));
        Assert.Null(NotificationMessages.ParseAck("ack:not-a-guid"));
        Assert.Null(NotificationMessages.ParseAck(null));
    }

    [Fact]
    public void Adds_an_open_button_when_the_address_is_known()
    {
        var sensorId = Guid.NewGuid();

        var buttons = NotificationMessages.Buttons(Guid.NewGuid(), sensorId, "https://plant.example.com");

        Assert.Equal($"https://plant.example.com/sensors/{sensorId}", buttons[1].Url);
    }

    [Fact]
    public void Location_walks_up_the_tree()
    {
        var hall = new AssetRecord(Guid.NewGuid(), null, "Hall A", "area");
        var oven = new AssetRecord(Guid.NewGuid(), hall.Id, "Oven 1", "equipment");

        Assert.Equal("Hall A / Oven 1", NotificationMessages.Location([hall, oven], oven.Id));
        Assert.Null(NotificationMessages.Location([hall, oven], null));
    }
}
