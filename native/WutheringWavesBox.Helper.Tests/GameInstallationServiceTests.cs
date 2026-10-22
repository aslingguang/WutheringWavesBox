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

    [Fact]
    public void InstalledBundleVersionTakesPrecedenceOverBaseVersion()
    {
        CreateFile("Wuthering Waves.exe");
        CreateFile(Path.Combine("Client", "Binaries", "Win64", "Client-Win64-Shipping.exe"));
        var configPath = Path.Combine(temporaryDirectory, "launcherDownloadConfig.json");
        File.WriteAllText(
            configPath,
            """{"appId":"10003","version":"3.7.0","state":"","bundles":{"HD":{"version":"3.7.1","state":"","resourcePacks":["common","hd"]}}}""");

        var result = GameInstallationService.ValidateInstallation(temporaryDirectory);

        Assert.Equal("3.7.1", result.Installation?.LocalVersion);
    }

    [Fact]
    public void NewestBundleVersionIsUsedWhenSeveralBundlesExist()
    {
        CreateFile("Wuthering Waves.exe");
        CreateFile(Path.Combine("Client", "Binaries", "Win64", "Client-Win64-Shipping.exe"));
        var configPath = Path.Combine(temporaryDirectory, "launcherDownloadConfig.json");
        File.WriteAllText(
            configPath,
            """{"version":"3.7.0","bundles":{"Standard":{"version":"3.7.0"},"HD":{"version":"3.8.1"}}}""");

        var result = GameInstallationService.ValidateInstallation(temporaryDirectory);

        Assert.Equal("3.8.1", result.Installation?.LocalVersion);
    }

    [Fact]
    public void BaseVersionIsUsedWhenBundlesAreMissing()
    {
        CreateFile("Wuthering Waves.exe");
        CreateFile(Path.Combine("Client", "Binaries", "Win64", "Client-Win64-Shipping.exe"));
        var configPath = Path.Combine(temporaryDirectory, "launcherDownloadConfig.json");
        File.WriteAllText(configPath, """{"version":"3.9.0","bundles":[]}""");

        var result = GameInstallationService.ValidateInstallation(temporaryDirectory);

        Assert.Equal("3.9.0", result.Installation?.LocalVersion);
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
