using System.Text;
using System.Text.RegularExpressions;
using WutheringWavesBox.Contracts;

namespace WutheringWavesBox.Helper;

public static partial class GachaLogService
{
    private const int MaximumLogBytes = 64 * 1024 * 1024;

    public static ConveneUrlResult FindConveneUrl(string rootPath)
    {
        var logs = GetLogCandidates(rootPath)
            .Where(candidate => File.Exists(candidate.Path))
            .Select(candidate => candidate with { LastModifiedAt = File.GetLastWriteTimeUtc(candidate.Path) })
            .OrderByDescending(candidate => candidate.LastModifiedAt)
            .ToArray();

        if (logs.Length == 0)
            return new ConveneUrlResult(false, null, null, null, "GACHA_LOG_NOT_FOUND");

        foreach (var log in logs)
        {
            try
            {
                var bytes = ReadSharedTail(log.Path);
                var url = log.Source == "clientLog"
                    ? FindLastUrl(Encoding.UTF8.GetString(DecodeClientLog(bytes))) ??
                      FindLastUrl(Encoding.UTF8.GetString(bytes))
                    : FindLastUrl(Encoding.UTF8.GetString(bytes));
                if (url is not null)
                    return new ConveneUrlResult(true, url, log.Source, log.LastModifiedAt, null);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                // Try the next available log before reporting that no URL was found.
            }
        }

        return new ConveneUrlResult(false, null, null, logs[0].LastModifiedAt, "GACHA_URL_NOT_FOUND");
    }

    public static byte[] DecodeClientLog(byte[] encoded)
    {
        var decoded = encoded.ToArray();
        for (var index = 0; index < decoded.Length; index++)
        {
            var value = decoded[index];
            decoded[index] = (byte)(value ^ ((value & 1) != 0 ? 0xA5 : 0xEF));
        }
        return decoded;
    }

    private static IEnumerable<LogCandidate> GetLogCandidates(string rootPath)
    {
        yield return new LogCandidate(
            Path.Combine(rootPath, "Client", "Saved", "Logs", "Client.log"),
            "clientLog",
            DateTimeOffset.MinValue);
        yield return new LogCandidate(
            Path.Combine(
                rootPath,
                "Client",
                "Binaries",
                "Win64",
                "ThirdParty",
                "KrPcSdk_Global",
                "KRSDKRes",
                "KRSDKWebView",
                "debug.log"),
            "debugLog",
            DateTimeOffset.MinValue);
    }

    private static byte[] ReadSharedTail(string path)
    {
        using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete);
        var length = (int)Math.Min(stream.Length, MaximumLogBytes);
        if (stream.Length > length) stream.Seek(-length, SeekOrigin.End);
        var buffer = new byte[length];
        stream.ReadExactly(buffer);
        return buffer;
    }

    private static string? FindLastUrl(string content)
    {
        var matches = ConveneUrlRegex().Matches(content);
        return matches.Count == 0 ? null : matches[^1].Value;
    }

    [GeneratedRegex(
        "https://aki-gm-resources(?:-oversea)?\\.aki-game\\.(?:net|com)/aki/gacha/index\\.html#/record[^\\\"\\s]*",
        RegexOptions.CultureInvariant)]
    private static partial Regex ConveneUrlRegex();

    private sealed record LogCandidate(string Path, string Source, DateTimeOffset LastModifiedAt);
}
