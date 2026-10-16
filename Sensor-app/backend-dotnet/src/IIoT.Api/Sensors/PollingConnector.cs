namespace IIoT.Api.Sensors;

/// <summary>Base class for connectors that read a value on a fixed interval.</summary>
public abstract class PollingConnector(TimeSpan interval, ILogger logger) : ISensorConnector
{
    private readonly CancellationTokenSource _stop = new();
    private Task? _loop;

    protected ILogger Logger => logger;

    public virtual Task StartAsync(CancellationToken ct)
    {
        _loop = Task.Run(() => RunAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    /// <summary>Reads once and stores the result. Exceptions are logged and the next poll continues.</summary>
    protected abstract Task PollAsync(CancellationToken ct);

    private async Task RunAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(interval);
        do
        {
            try
            {
                await PollAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning("{Connector} poll failed: {Message}", GetType().Name, ex.Message);
            }
        }
        while (await WaitAsync(timer, ct));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try
        {
            return await timer.WaitForNextTickAsync(ct);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    public virtual async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        if (_loop is not null)
        {
            await _loop;
        }
        _stop.Dispose();
        GC.SuppressFinalize(this);
    }
}
