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
