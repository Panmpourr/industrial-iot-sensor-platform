using IIoT.Api.Auth;
using IIoT.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace IIoT.Api.Hubs;

/// <summary>
/// Real-time channel for sensor readings. A client subscribes to the sensors it is displaying and
/// receives a <c>reading(sensorId, reading)</c> message as soon as each new value is stored.
/// </summary>
[Authorize]
public sealed class SensorHub(SensorRepository sensors) : Hub
{
    public const string Path = "/hubs/sensors";
    public const string ReadingMethod = "reading";

    public static string GroupFor(Guid sensorId) => $"sensor:{sensorId}";

    public async Task Subscribe(string sensorId)
    {
        var userId = Context.User!.UserId()!;
        if (!Guid.TryParse(sensorId, out var id) || !await sensors.IsOwnerAsync(userId, id))
        {
            throw new HubException("Sensor not found");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupFor(id));
    }

    public async Task Unsubscribe(string sensorId)
    {
        if (Guid.TryParse(sensorId, out var id))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupFor(id));
        }
    }
}
