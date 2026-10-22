using WutheringWavesBox.Helper;
using Xunit;

namespace WutheringWavesBox.Helper.Tests;

public sealed class GameProcessServiceTests
{
    [Theory]
    [InlineData("default", "fullscreen", 1920, 1080, "-ResX=1920 -ResY=1080 -fullscreen")]
    [InlineData("dx11", "borderless", 2560, 1440, "-dx11 -ResX=2560 -ResY=1440 -windowed -borderless")]
    [InlineData("dx12", "windowed", 1280, 720, "-dx12 -ResX=1280 -ResY=720 -windowed")]
    public void BuildsValidatedDisplayArguments(
        string renderMode,
        string displayMode,
        int width,
        int height,
        string expected)
    {
        Assert.Equal(expected, GameProcessService.BuildArguments(renderMode, displayMode, width, height));
    }

    [Theory]
    [InlineData("default", "fullscreen", 1920, 1080, "-nologo -nosplash", "-ResX=1920 -ResY=1080 -fullscreen -nologo -nosplash")]
    [InlineData("dx11", null, null, null, "-windowed", "-dx11 -windowed")]
    [InlineData("dx12", "windowed", 1280, 720, "   ", "-dx12 -ResX=1280 -ResY=720 -windowed")]
    [InlineData("default", null, null, null, null, "")]
    public void AppendsCustomArgumentsAfterValidatedDisplayArguments(
        string renderMode,
        string? displayMode,
        int? width,
        int? height,
        string? customArguments,
        string expected)
    {
        Assert.Equal(
            expected,
            GameProcessService.BuildArguments(renderMode, displayMode, width, height, customArguments));
    }
}
