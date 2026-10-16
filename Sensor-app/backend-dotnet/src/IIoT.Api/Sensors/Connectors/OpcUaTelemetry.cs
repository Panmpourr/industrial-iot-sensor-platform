using System.Diagnostics;
using System.Diagnostics.Metrics;
using Opc.Ua;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>Routes OPC UA SDK logging into the ASP.NET Core logging pipeline.</summary>
public sealed class OpcUaTelemetry(ILoggerFactory loggerFactory) : ITelemetryContext
{
    private const string Name = "IIoT.OpcUa";

    public ILoggerFactory LoggerFactory => loggerFactory;

    public ActivitySource ActivitySource { get; } = new(Name);

    public Meter CreateMeter() => new(Name);
}
