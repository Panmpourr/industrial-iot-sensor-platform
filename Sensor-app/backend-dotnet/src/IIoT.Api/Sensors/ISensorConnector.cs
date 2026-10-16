using System.Text.Json.Nodes;

namespace IIoT.Api.Sensors;

/// <summary>Persists one reading produced by a connector.</summary>
public delegate Task ReadingSink(JsonObject reading);

/// <summary>
/// A live connection to one physical or virtual sensor (Modbus, OPC UA, Serial, MQTT, REST...).
/// Disposing the connector stops it and releases its connection.
/// </summary>
public interface ISensorConnector : IAsyncDisposable
{
    /// <summary>
    /// Starts collecting readings. Throws if the initial configuration or connection is invalid;
    /// transient failures afterwards are retried by the connector itself.
    /// </summary>
    Task StartAsync(CancellationToken ct);
}
