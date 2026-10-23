using IIoT.Api.Data;
using IIoT.Api.Sensors.Connectors;

namespace IIoT.Api.Sensors;

public static class SensorTypes
{
    public const string WeatherApi = "WeatherApi";
    public const string Ttn = "TTN";
    public const string Arduino = "Arduino";
    public const string Modbus = "Plc-Modbus";
    public const string OpcUa = "Plc-Opcua";

    /// <summary>
    /// The matching type constant, or <c>null</c> for an unknown type. Returning our own constant
    /// (instead of the caller's string) keeps user input out of the database and the logs.
    /// </summary>
    public static string? Known(string? type) => type switch
    {
        WeatherApi => WeatherApi,
        Ttn => Ttn,
        Arduino => Arduino,
        Modbus => Modbus,
        OpcUa => OpcUa,
        _ => null,
    };
}

public sealed class SensorConnectorFactory(
    IHttpClientFactory httpClientFactory,
    OpcUaClient opcUa,
    ILoggerFactory loggerFactory)
{
    /// <returns>The connector, or <c>null</c> for sensor types that have no live data source.</returns>
    /// <exception cref="InvalidOperationException">The sensor's settings are incomplete or invalid.</exception>
    public ISensorConnector? Create(SensorRecord sensor, ReadingSink sink)
    {
        var details = new SensorDetails(sensor.Details);
        return sensor.Type switch
        {
            SensorTypes.WeatherApi => new WeatherApiConnector(
                details, sink, httpClientFactory.CreateClient(), loggerFactory.CreateLogger<WeatherApiConnector>()),
            SensorTypes.Ttn => new TtnMqttConnector(details, sink, loggerFactory.CreateLogger<TtnMqttConnector>()),
            SensorTypes.Arduino => new SerialConnector(details, sink, loggerFactory.CreateLogger<SerialConnector>()),
            SensorTypes.Modbus => new ModbusTcpConnector(details, sink, loggerFactory.CreateLogger<ModbusTcpConnector>()),
            SensorTypes.OpcUa => new OpcUaConnector(details, sink, opcUa, loggerFactory.CreateLogger<OpcUaConnector>()),
            _ => null,
        };
    }
}
