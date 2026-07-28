using System.Text;
using WutheringWavesBox.Helper;
using Xunit;

namespace WutheringWavesBox.Helper.Tests;

public sealed class GachaLogServiceTests : IDisposable
{
    private const string ConveneUrl =
        "https://aki-gm-resources.aki-game.net/aki/gacha/index.html#/record?player_id=123&record_id=secret";
    private readonly string temporaryDirectory = Path.Combine(
        Path.GetTempPath(),
        "WutheringWavesBox.GachaTests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public void FindsUrlInXorEncodedClientLog()
    {
        var logPath = Path.Combine(temporaryDirectory, "Client", "Saved", "Logs", "Client.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        File.WriteAllBytes(logPath, EncodeClientLog(Encoding.UTF8.GetBytes($"before {ConveneUrl} after")));

        var result = GachaLogService.FindConveneUrl(temporaryDirectory);

        Assert.True(result.Found);
        Assert.Equal(ConveneUrl, result.Url);
        Assert.Equal("clientLog", result.Source);
    }

    [Fact]
    public void FallsBackToGlobalDebugLog()
    {
        var logPath = Path.Combine(
            temporaryDirectory,
            "Client",
            "Binaries",
            "Win64",
            "ThirdParty",
            "KrPcSdk_Global",
            "KRSDKRes",
            "KRSDKWebView",
            "debug.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        File.WriteAllText(logPath, $"navigation: {ConveneUrl}");

        var result = GachaLogService.FindConveneUrl(temporaryDirectory);

        Assert.True(result.Found);
        Assert.Equal("debugLog", result.Source);
    }

    [Fact]
    public void ReportsMissingLogsWithoutExposingAUrl()
    {
        var result = GachaLogService.FindConveneUrl(temporaryDirectory);

        Assert.False(result.Found);
        Assert.Null(result.Url);
        Assert.Equal("GACHA_LOG_NOT_FOUND", result.ErrorCode);
    }

    public void Dispose()
    {
        if (Directory.Exists(temporaryDirectory)) Directory.Delete(temporaryDirectory, true);
        GC.SuppressFinalize(this);
    }

    private static byte[] EncodeClientLog(byte[] plainText)
    {
        var encoded = new byte[plainText.Length];
        for (var index = 0; index < plainText.Length; index++)
        {
            var found = false;
            for (var candidate = 0; candidate <= byte.MaxValue; candidate++)
            {
                var value = (byte)candidate;
                var decoded = (byte)(value ^ ((value & 1) != 0 ? 0xA5 : 0xEF));
                if (decoded != plainText[index]) continue;
                encoded[index] = value;
                found = true;
                break;
            }
            Assert.True(found, $"No encoded byte found for {plainText[index]}");
        }
        return encoded;
    }
}
