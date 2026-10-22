using WutheringWavesBox.Helper;
using Xunit;

namespace WutheringWavesBox.Helper.Tests;

public sealed class LaunchArgumentPolicyTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("-nologo")]
    [InlineData("-nologo -nosplash -ResX=2560 -ResY=1440")]
    [InlineData("-UserDir=D:\\Games\\WuWa")]
    public void AcceptsPlainCustomArguments(string? value)
    {
        Assert.True(LaunchArgumentPolicy.IsValid(value));
    }

    [Theory]
    [InlineData("-nologo\n-nosplash")]
    [InlineData("-nologo\t-nosplash")]
    [InlineData("-nologo\r\n-nosplash")]
    public void RejectsControlCharacters(string value)
    {
        Assert.False(LaunchArgumentPolicy.IsValid(value));
    }

    [Fact]
    public void RejectsArgumentsLongerThanTheLimit()
    {
        Assert.True(LaunchArgumentPolicy.IsValid(new string('a', LaunchArgumentPolicy.MaxLength)));
        Assert.True(LaunchArgumentPolicy.IsValid($"  {new string('a', LaunchArgumentPolicy.MaxLength)}  "));
        Assert.False(LaunchArgumentPolicy.IsValid(new string('a', LaunchArgumentPolicy.MaxLength + 1)));
    }

    [Theory]
    [InlineData(null, "")]
    [InlineData("   ", "")]
    [InlineData("  -dx12  ", "-dx12")]
    public void NormalizesByTrimmingSurroundingWhitespace(string? value, string expected)
    {
        Assert.Equal(expected, LaunchArgumentPolicy.Normalize(value));
    }
}
