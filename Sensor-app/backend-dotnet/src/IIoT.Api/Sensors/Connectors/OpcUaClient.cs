using Opc.Ua;
using Opc.Ua.Client;

namespace IIoT.Api.Sensors.Connectors;

/// <summary>Shared OPC UA client configuration and session helpers.</summary>
public sealed class OpcUaClient
{
    private const int OperationTimeoutMs = 15_000;
    private readonly ITelemetryContext _telemetry;
    private readonly Lazy<Task<ApplicationConfiguration>> _configuration;

    public OpcUaClient(ILoggerFactory loggerFactory)
    {
        _telemetry = new OpcUaTelemetry(loggerFactory);
        _configuration = new(CreateConfigurationAsync);
    }

    public Task<ApplicationConfiguration> GetConfigurationAsync() => _configuration.Value;

    /// <summary>Opens an anonymous, unsecured session (security mode None) to <paramref name="endpointUrl"/>.</summary>
    public async Task<Opc.Ua.Client.ISession> OpenSessionAsync(string endpointUrl, string sessionName, CancellationToken ct)
    {
        var config = await GetConfigurationAsync();
        var endpointDescription = await CoreClientUtils.SelectEndpointAsync(
            config, endpointUrl, useSecurity: false, OperationTimeoutMs, _telemetry, ct);
        var endpoint = new ConfiguredEndpoint(null, endpointDescription, EndpointConfiguration.Create(config));

        return await new DefaultSessionFactory(_telemetry).CreateAsync(
            config,
            endpoint,
            updateBeforeConnect: false,
            sessionName,
            sessionTimeout: 60_000,
            new UserIdentity(new AnonymousIdentityToken()),
            preferredLocales: null,
            ct);
    }

    /// <summary>Lists the endpoints a server offers (used by the "test connection" button).</summary>
    public async Task<EndpointDescriptionCollection> GetEndpointsAsync(string endpointUrl, CancellationToken ct)
    {
        var config = await GetConfigurationAsync();
        var endpointConfiguration = EndpointConfiguration.Create(config);
        endpointConfiguration.OperationTimeout = OperationTimeoutMs;

        using var client = await DiscoveryClient.CreateAsync(
            config, new Uri(endpointUrl), endpointConfiguration, ct: ct);
        return await client.GetEndpointsAsync(null, ct);
    }

    private async Task<ApplicationConfiguration> CreateConfigurationAsync()
    {
        var pkiRoot = Path.Combine(AppContext.BaseDirectory, "pki");
        var config = new ApplicationConfiguration(_telemetry)
        {
            ApplicationName = "IIoT Sensor Platform",
            ApplicationUri = $"urn:{System.Net.Dns.GetHostName()}:IIoTSensorPlatform",
            ApplicationType = ApplicationType.Client,
            SecurityConfiguration = new SecurityConfiguration
            {
                ApplicationCertificate = new CertificateIdentifier
                {
                    StoreType = CertificateStoreType.Directory,
                    StorePath = Path.Combine(pkiRoot, "own"),
                    SubjectName = "CN=IIoT Sensor Platform",
                },
                TrustedPeerCertificates = new CertificateTrustList { StorePath = Path.Combine(pkiRoot, "trusted") },
                TrustedIssuerCertificates = new CertificateTrustList { StorePath = Path.Combine(pkiRoot, "issuers") },
                RejectedCertificateStore = new CertificateTrustList { StorePath = Path.Combine(pkiRoot, "rejected") },
                // Lab/demo setting: servers are reached without security, so their certificates are not validated.
                AutoAcceptUntrustedCertificates = true,
            },
            TransportQuotas = new TransportQuotas { OperationTimeout = OperationTimeoutMs },
            ClientConfiguration = new ClientConfiguration { DefaultSessionTimeout = 60_000 },
        };

        await config.ValidateAsync(ApplicationType.Client);
        return config;
    }
}
