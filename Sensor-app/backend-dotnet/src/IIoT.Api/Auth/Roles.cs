using IIoT.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace IIoT.Api.Auth;

/// <summary>Site roles, from least to most rights. Each role can do everything the previous one can.</summary>
public static class Roles
{
    /// <summary>Views data, acknowledges alarms.</summary>
    public const string Operator = "operator";
    /// <summary>Also adds, edits and deletes sensors and their alarm limits.</summary>
    public const string Engineer = "engineer";
    /// <summary>Also manages the site's users.</summary>
    public const string Admin = "admin";

    private static readonly string[] Ordered = [Operator, Engineer, Admin];

    public static bool IsValid(string? role) => role is not null && Ordered.Contains(role);

    public static bool AtLeast(string role, string required) =>
        Array.IndexOf(Ordered, role) >= Array.IndexOf(Ordered, required);
}

/// <summary>The signed-in user's site membership, loaded from the database on every request.</summary>
public sealed record Member(string UserId, Guid SiteId, string SiteName, string Role, bool MustChangePassword);

/// <summary>
/// Loads the caller's <see cref="Member"/> and requires at least <paramref name="role"/>. The role
/// is read from the database (not from the login token), so a role change or a removed user takes
/// effect immediately. Routes with a <c>{userId}</c> segment only work for the caller's own id.
/// Until a user replaces the temporary password set by an admin, only actions marked with
/// <see cref="AllowPendingPasswordChange"/> are allowed.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class RequireRoleAttribute(string role = Roles.Operator) : Attribute, IAsyncActionFilter
{
    private const string ItemKey = nameof(Member);

    public bool AllowPendingPasswordChange { get; init; }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        if (http.Items[ItemKey] is not Member member)
        {
            var userId = http.User.UserId();
            var found = userId is null ? null : await http.RequestServices.GetRequiredService<UserRepository>().GetMemberAsync(userId);
            if (found is null)
            {
                context.Result = new UnauthorizedResult();
                return;
            }
            member = found;
            http.Items[ItemKey] = member;
        }

        if (context.RouteData.Values.TryGetValue("userId", out var routeUser) && routeUser as string != member.UserId)
        {
            context.Result = new ForbidResult();
            return;
        }
        if (member.MustChangePassword && !AllowPendingPasswordChange)
        {
            context.Result = Denied("Please change your temporary password first");
            return;
        }
        if (!Roles.AtLeast(member.Role, role))
        {
            context.Result = Denied($"This requires the {role} role");
            return;
        }

        await next();
    }

    private static ObjectResult Denied(string error) =>
        new(new { success = false, error }) { StatusCode = StatusCodes.Status403Forbidden };

    public static Member Get(HttpContext http) =>
        http.Items[ItemKey] as Member ?? throw new InvalidOperationException("Action is missing [RequireRole]");
}

public static class MemberExtensions
{
    /// <summary>The caller's membership; only available in actions with <see cref="RequireRoleAttribute"/>.</summary>
    public static Member Member(this ControllerBase controller) => RequireRoleAttribute.Get(controller.HttpContext);
}
