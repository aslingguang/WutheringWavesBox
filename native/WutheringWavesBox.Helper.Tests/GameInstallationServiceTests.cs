using WutheringWavesBox.Helper;
using Xunit;

namespace WutheringWavesBox.Helper.Tests;

public sealed class GameInstallationServiceTests : IDisposable
{
    private readonly string temporaryDirectory = Path.Combine(
        Path.GetTempPath(),
        "WutheringWavesBox.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public void ValidGlobalInstallationIsRecognized()
    {
        CreateFile("Wuthering Waves.exe");
        CreateFile(Path.Combine("Client", "Binaries", "Win64", "Client-Win64-Shipping.exe"));
        Directory.CreateDirectory(
            Path.Combine(
                temporaryDirectory,
                "Client",
                "Binaries",
                "Win64",
                "ThirdParty",
                "KrPcSdk_Global"));

        var result = GameInstallationService.ValidateInstallation(temporaryDirectory);

        Assert.True(result.Valid);
        Assert.NotNull(result.Installation);
        Assert.Equal("global", result.Installation.Region);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void MissingClientExecutableIsRejected()
    {
        CreateFile("Wuthering Waves.exe");

        var result = GameInstallationService.ValidateInstallation(temporaryDirectory);

        Assert.False(result.Valid);
        Assert.Contains("CLIENT_EXECUTABLE_NOT_FOUND", result.Issues);
        Assert.Null(result.Installation);
    }

    [Fact]
    public void LauncherConfigProvidesLocalVersion()
    {
        CreateFile("Wuthering Waves.exe");
        CreateFile(Path.Combine("Client", "Binaries", "Win64", "Client-Win64-Shipping.exe"));
        var configPath = Path.Combine(temporaryDirectory, "launcherDownloadConfig.json");
        File.WriteAllText(configPath, """{"version":"3.5.0"}""");

        var result = GameInstallationService.ValidateInstallation(temporaryDirectory);

        Assert.Equal("3.5.0", result.Installation?.LocalVersion);
    }

    public void Dispose()
    {
        if (Directory.Exists(temporaryDirectory)) Directory.Delete(temporaryDirectory, true);
        GC.SuppressFinalize(this);
    }

    private void CreateFile(string relativePath)
    {
        var path = Path.Combine(temporaryDirectory, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, []);
    }
}
