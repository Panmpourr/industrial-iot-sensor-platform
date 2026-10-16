using IIoT.Api.Auth;
using Microsoft.IdentityModel.JsonWebTokens;

namespace IIoT.Tests;

public class JwtTokenServiceTests
{
    private static readonly string Secret = new('k', 32);

    [Fact]
    public async Task Token_validates_and_carries_the_user_id()
    {
        var key = JwtTokenService.CreateKey(Secret);
        var token = new JwtTokenService(key).CreateToken("alice");

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, JwtTokenService.ValidationParameters(key));

        Assert.True(result.IsValid);
        Assert.Equal("alice", result.ClaimsIdentity.Name);
    }

    [Fact]
    public async Task Token_signed_with_another_key_is_rejected()
    {
        var token = new JwtTokenService(JwtTokenService.CreateKey(new string('x', 32))).CreateToken("alice");

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(
            token, JwtTokenService.ValidationParameters(JwtTokenService.CreateKey(Secret)));

        Assert.False(result.IsValid);
    }
}
