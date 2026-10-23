using IIoT.Api.Sensors;

namespace IIoT.Tests;

public class SensorTypesTests
{
    [Theory]
    [InlineData("WeatherApi")]
    [InlineData("TTN")]
    [InlineData("Arduino")]
    [InlineData("Plc-Modbus")]
    [InlineData("Plc-Opcua")]
    public void Accepts_every_supported_type(string type)
    {
        Assert.Equal(type, SensorTypes.Known(type));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("plc-opcua")]
    [InlineData("Plc-Opcua\nFAKE LOG LINE")]
    public void Rejects_unknown_types(string? type)
    {
        Assert.Null(SensorTypes.Known(type));
    }
}
