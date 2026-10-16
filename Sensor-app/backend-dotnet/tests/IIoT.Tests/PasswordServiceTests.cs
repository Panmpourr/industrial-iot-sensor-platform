using IIoT.Api.Auth;

namespace IIoT.Tests;

public class PasswordServiceTests
{
    private readonly PasswordService _passwords = new();

    [Fact]
    public void Hash_is_not_the_plain_password_and_verifies()
    {
        var hash = _passwords.Hash("secret");

        Assert.NotEqual("secret", hash);
        Assert.Equal(PasswordCheck.Success, _passwords.Verify(hash, "secret"));
        Assert.Equal(PasswordCheck.Failed, _passwords.Verify(hash, "wrong"));
    }

    [Fact]
    public void Same_password_gets_a_different_salt_each_time()
    {
        Assert.NotEqual(_passwords.Hash("secret"), _passwords.Hash("secret"));
    }

    [Theory]
    [InlineData("pw1")]
    [InlineData("abcd")] // valid base64, must still be treated as legacy plain text
    public void Legacy_plain_text_password_is_accepted_once_and_flagged_for_rehash(string legacy)
    {
        Assert.Equal(PasswordCheck.SuccessRehashNeeded, _passwords.Verify(legacy, legacy));
        Assert.Equal(PasswordCheck.Failed, _passwords.Verify(legacy, legacy + "x"));
    }
}
