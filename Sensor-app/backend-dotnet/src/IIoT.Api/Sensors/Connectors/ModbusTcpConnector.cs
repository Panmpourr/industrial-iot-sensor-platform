using System.Net.Sockets;
using NModbus;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>
/// Reads one holding register from a PLC over Modbus TCP every 500 ms.
/// The TCP connection is kept open and re-established after a failure.
/// </summary>
public sealed class ModbusTcpConnector(SensorDetails details, ReadingSink sink, ILogger<ModbusTcpConnector> logger)
    : PollingConnector(TimeSpan.FromMilliseconds(500), logger)
{
    private static readonly ModbusFactory Factory = new();

    private readonly string _host = details.RequireString("ipAddress");
    private readonly int _port = details.GetInt("port") ?? 502;
    private readonly ushort _register = (ushort)(details.GetInt("registerAddress") ?? 0);
    private readonly byte _unitId = (byte)(details.GetInt("unitId") ?? 1);

    private TcpClient? _tcp;
    private IModbusMaster? _master;

    protected override async Task PollAsync(CancellationToken ct)
    {
        try
        {
            var master = await ConnectAsync(ct);
            var registers = await master.ReadHoldingRegistersAsync(_unitId, _register, 1);
            await sink(Readings.Numeric(registers[0], details));
        }
        catch
        {
            Disconnect();
            throw;
        }
    }

    private async Task<IModbusMaster> ConnectAsync(CancellationToken ct)
    {
        if (_master is not null && _tcp is { Connected: true })
        {
            return _master;
        }

        Disconnect();
        _tcp = new TcpClient { ReceiveTimeout = 2000, SendTimeout = 2000 };
        await _tcp.ConnectAsync(_host, _port, ct);
        _master = Factory.CreateMaster(_tcp);
        Logger.LogInformation("Modbus connected to {Host}:{Port}", _host, _port);
        return _master;
    }

    private void Disconnect()
    {
        _master?.Dispose();
        _tcp?.Dispose();
        _master = null;
        _tcp = null;
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        Disconnect();
    }
}
