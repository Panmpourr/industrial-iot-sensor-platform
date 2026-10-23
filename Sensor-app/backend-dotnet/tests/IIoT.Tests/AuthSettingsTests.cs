using IIoT.Api.Auth;
using Microsoft.Extensions.Configuration;

namespace IIoT.Tests;

public class AuthSettingsTests
{
    private static AuthSettings From(params (string Key, string? Value)[] values) =>
        AuthSettings.From(new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build());

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("true", true)]
    [InlineData("false", false)]
    [InlineData("False", false)]
    [InlineData("nonsense", true)]
    public void Registration_is_on_unless_turned_off(string? value, bool expected)
    {
        Assert.Equal(expected, From(("REGISTRATION_ENABLED", value)).RegistrationEnabled);
    }

    [Fact]
    public void Reads_the_first_admin_and_site_name()
    {
        var settings = From(("ADMIN_USER", " plant-admin "), ("ADMIN_PASSWORD", "secret-123"), ("SITE_NAME", "Plant 1"));

        Assert.Equal("plant-admin", settings.AdminUser);
        Assert.Equal("secret-123", settings.AdminPassword);
        Assert.Equal("Plant 1", settings.SiteName);
    }

    [Fact]
    public void Empty_values_mean_not_set()
    {
        var settings = From(("ADMIN_USER", ""), ("ADMIN_PASSWORD", ""));

        Assert.Null(settings.AdminUser);
        Assert.Null(settings.AdminPassword);
        Assert.Equal("Main site", settings.SiteName);
    }
}
