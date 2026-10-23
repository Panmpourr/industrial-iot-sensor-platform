using System.Text.Json;
using IIoT.Api.Auth;
using IIoT.Api.Data;

namespace IIoT.Tests;

public class RolesTests
{
    [Theory]
    [InlineData("operator", "operator", true)]
    [InlineData("operator", "engineer", false)]
    [InlineData("engineer", "operator", true)]
    [InlineData("engineer", "admin", false)]
    [InlineData("admin", "engineer", true)]
    [InlineData("admin", "admin", true)]
    public void Each_role_includes_the_rights_of_the_lower_ones(string role, string required, bool expected)
    {
        Assert.Equal(expected, Roles.AtLeast(role, required));
    }

    [Theory]
    [InlineData("operator", true)]
    [InlineData("admin", true)]
    [InlineData("Admin", false)]
    [InlineData("root", false)]
    [InlineData(null, false)]
    public void Only_known_roles_are_valid(string? role, bool expected)
    {
        Assert.Equal(expected, Roles.IsValid(role));
    }
}

public class AuditDiffTests
{
    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    private static List<string> Describe(string before, string after) =>
        AuditDiff.Changes(Json(before), Json(after))
            .Select(c => $"{c!["field"]}: {c["from"]?.ToString() ?? "-"} -> {c["to"]?.ToString() ?? "-"}")
            .ToList();

    [Fact]
    public void Lists_changed_nested_limits_field_by_field()
    {
        var changes = Describe(
            """{ "nodeId": "ns=2;i=2", "threshold": { "warning": 70, "critical": 90 } }""",
            """{ "nodeId": "ns=2;i=2", "threshold": { "warning": 70, "critical": 95, "deadband": 2 } }""");

        Assert.Equal(["threshold.critical: 90 -> 95", "threshold.deadband: - -> 2"], changes);
    }

    [Fact]
    public void Numbers_sent_as_text_and_empty_values_are_not_changes()
    {
        var changes = Describe(
            """{ "port": "502", "location": "", "threshold": { "warning": 70 } }""",
            """{ "port": 502, "threshold": { "warning": "70" } }""");

        Assert.Empty(changes);
    }

    [Fact]
    public void Never_writes_secret_values()
    {
        var changes = Describe("""{ "apiKey": "old-secret" }""", """{ "apiKey": "new-secret" }""");

        Assert.Equal(["apiKey: ••• -> ••• (changed)"], changes);
    }

    [Fact]
    public void Lists_removed_settings()
    {
        Assert.Equal(["location: Thessaloniki -> -"], Describe("""{ "location": "Thessaloniki" }""", "{}"));
    }
}
