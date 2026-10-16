using System.Globalization;
using System.IO.Ports;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>
/// Reads integer values, one per line, from a microcontroller (e.g. Arduino soil-moisture sensor)
/// over a USB serial port at 9600 baud.
/// </summary>
public sealed class SerialConnector(SensorDetails details, ReadingSink sink, ILogger<SerialConnector> logger)
    : ISensorConnector
{
    private readonly string _portName = details.RequireString("serialPort");
    private readonly CancellationTokenSource _stop = new();
    private SerialPort? _port;
    private Task? _loop;

    public Task StartAsync(CancellationToken ct)
    {
        _port = new SerialPort(_portName, 9600) { NewLine = "\n", ReadTimeout = 1000 };
        _port.Open();
        _loop = Task.Run(() => ReadLoopAsync(_port, _stop.Token), CancellationToken.None);
        logger.LogInformation("Serial port {Port} opened", _portName);
        return Task.CompletedTask;
    }

    private async Task ReadLoopAsync(SerialPort port, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            string line;
            try
            {
                line = port.ReadLine().Trim();
            }
            catch (TimeoutException)
            {
                continue;
            }
            catch (Exception ex) when (ex is InvalidOperationException or IOException)
            {
                if (!ct.IsCancellationRequested)
                {
                    logger.LogWarning("Serial port {Port} error: {Message}", _portName, ex.Message);
                }
                return;
            }

            if (!int.TryParse(line, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value))
            {
                logger.LogWarning("Received invalid data from serial device: {Line}", line);
                continue;
            }

            try
            {
                await sink(Readings.Numeric(value, details));
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to store serial reading");
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        _port?.Close();
        if (_loop is not null)
        {
            await _loop;
        }
        _port?.Dispose();
        _stop.Dispose();
    }
}
