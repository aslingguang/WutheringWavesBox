using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.Versioning;
using System.Text.Json;
using Microsoft.Win32;
using WutheringWavesBox.Contracts;

namespace WutheringWavesBox.Helper;

public static class GameInstallationService
{
    private const string RootExecutable = "Wuthering Waves.exe";
    private static readonly string ClientExecutable =
        Path.Combine("Client", "Binaries", "Win64", "Client-Win64-Shipping.exe");

    public static IReadOnlyList<GameInstallation> DetectInstallations()
    {
        var results = new Dictionary<string, GameInstallation>(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in GetCandidateDirectories())
        {
            var validation = ValidateInstallation(candidate);
            if (validation.Valid && validation.Installation is not null)
                results.TryAdd(validation.Installation.RootPath, validation.Installation);
        }

        return results.Values.OrderBy(item => item.RootPath, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public static GameValidationResult ValidateInstallation(string rootPath)
    {
        var issues = new List<string>();
        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(rootPath.Trim());
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return new GameValidationResult(false, ["INVALID_PATH"], null);
        }

        if (!Directory.Exists(fullPath))
            return new GameValidationResult(false, ["DIRECTORY_NOT_FOUND"], null);

        var executable = Path.Combine(fullPath, RootExecutable);
        var clientExecutable = Path.Combine(fullPath, ClientExecutable);
        if (!File.Exists(executable)) issues.Add("ROOT_EXECUTABLE_NOT_FOUND");
        if (!File.Exists(clientExecutable)) issues.Add("CLIENT_EXECUTABLE_NOT_FOUND");
        if (issues.Count > 0) return new GameValidationResult(false, issues, null);

        var installation = new GameInstallation(
            CreateId(fullPath),
            fullPath,
            executable,
            clientExecutable,
            DetectRegion(fullPath),
            ReadVersion(fullPath, clientExecutable));
        return new GameValidationResult(true, [], installation);
    }

    private static HashSet<string> GetCandidateDirectories()
    {
        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddRegistryCandidates(candidates);

        foreach (var drive in DriveInfo.GetDrives().Where(item => item.DriveType == DriveType.Fixed && item.IsReady))
        {
            AddCommonCandidates(candidates, drive.RootDirectory.FullName);
        }

        return candidates;
    }

    private static void AddCommonCandidates(HashSet<string> candidates, string root)
    {
        string[] paths =
        [
            "Wuthering Waves",
            "Wuthering Waves Game",
            "鸣潮",
            Path.Combine("Games", "Wuthering Waves"),
            Path.Combine("Games", "Wuthering Waves Game"),
            Path.Combine("Games", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Program Files", "Wuthering Waves"),
            Path.Combine("Program Files", "Wuthering Waves Game"),
            Path.Combine("Program Files", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Program Files (x86)", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("SteamLibrary", "steamapps", "common", "Wuthering Waves"),
            Path.Combine("SteamLibrary", "steamapps", "common", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Steam", "steamapps", "common", "Wuthering Waves"),
            Path.Combine("Steam", "steamapps", "common", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Games", "Steam", "steamapps", "common", "Wuthering Waves"),
            Path.Combine("Games", "Steam", "steamapps", "common", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Program Files", "Steam", "steamapps", "common", "Wuthering Waves"),
            Path.Combine("Program Files", "Steam", "steamapps", "common", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Program Files (x86)", "Steam", "steamapps", "common", "Wuthering Waves"),
            Path.Combine("Program Files (x86)", "Steam", "steamapps", "common", "Wuthering Waves", "Wuthering Waves Game"),
            Path.Combine("Program Files", "Epic Games", "WutheringWavesj3oFh"),
            Path.Combine("Program Files", "Epic Games", "WutheringWavesj3oFh", "Wuthering Waves Game"),
            Path.Combine("Program Files (x86)", "Epic Games", "WutheringWavesj3oFh"),
            Path.Combine("Program Files (x86)", "Epic Games", "WutheringWavesj3oFh", "Wuthering Waves Game"),
        ];
        foreach (var path in paths) candidates.Add(Path.Combine(root, path));
    }

    private static void AddRegistryCandidates(HashSet<string> candidates)
    {
        if (!OperatingSystem.IsWindows()) return;
        AddMuiCacheCandidates(candidates);
        string[] uninstallRoots =
        [
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ];
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var hive = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            foreach (var uninstallRoot in uninstallRoots)
            {
                using var key = hive.OpenSubKey(uninstallRoot);
                if (key is null) continue;
                foreach (var subkeyName in key.GetSubKeyNames())
                {
                    using var subkey = key.OpenSubKey(subkeyName);
                    var displayName = subkey?.GetValue("DisplayName") as string;
                    if (displayName is null ||
                        (!displayName.Contains("Wuthering", StringComparison.OrdinalIgnoreCase) &&
                         !displayName.Contains("鸣潮", StringComparison.OrdinalIgnoreCase))) continue;
                    var location = (subkey?.GetValue("InstallLocation") ?? subkey?.GetValue("InstallPath")) as string;
                    if (!string.IsNullOrWhiteSpace(location)) candidates.Add(location);
                }
            }
        }
    }

    [SupportedOSPlatform("windows")]
    private static void AddMuiCacheCandidates(HashSet<string> candidates)
    {
        using var key = Registry.CurrentUser.OpenSubKey(
            @"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache");
        if (key is null) return;
        foreach (var valueName in key.GetValueNames())
        {
            if (!valueName.EndsWith("Client-Win64-Shipping.exe.FriendlyAppName", StringComparison.OrdinalIgnoreCase) &&
                !valueName.EndsWith("Client-Win64-Shipping.exe.ApplicationCompany", StringComparison.OrdinalIgnoreCase))
                continue;
            var marker = valueName.IndexOf(@"\Client\", StringComparison.OrdinalIgnoreCase);
            if (marker > 0) candidates.Add(valueName[..marker]);
        }
    }

    private static string DetectRegion(string rootPath)
    {
        var sdkRoot = Path.Combine(rootPath, "Client", "Binaries", "Win64", "ThirdParty");
        if (Directory.Exists(Path.Combine(sdkRoot, "KrPcSdk_Global"))) return "global";
        var mainland = Path.Combine(sdkRoot, "KrPcSdk_Mainland", "KRSDKRes");
        if (Directory.Exists(Path.Combine(mainland, "Bilibili"))) return "bilibili";
        if (Directory.Exists(Path.Combine(mainland, "wegame"))) return "wegame";
        if (Directory.Exists(Path.Combine(sdkRoot, "KrPcSdk_Mainland"))) return "cn";
        return "unknown";
    }

    private static string? ReadVersion(string rootPath, string executablePath)
    {
        var launcherConfig = Path.Combine(rootPath, "launcherDownloadConfig.json");
        try
        {
            if (File.Exists(launcherConfig))
            {
                using var document = JsonDocument.Parse(File.ReadAllText(launcherConfig));
                var version = ReadLauncherConfigVersion(document.RootElement);
                if (!string.IsNullOrWhiteSpace(version)) return version;
            }
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            // Fall back to executable metadata when the launcher config cannot be read.
        }

        try
        {
            var info = FileVersionInfo.GetVersionInfo(executablePath);
            var version = string.IsNullOrWhiteSpace(info.ProductVersion)
                ? info.FileVersion
                : info.ProductVersion;
            return string.IsNullOrWhiteSpace(version) ? null : version;
        }
        catch (Exception exception) when (exception is FileNotFoundException or System.ComponentModel.Win32Exception)
        {
            return null;
        }
    }

    /// <summary>
    /// 官方启动器按资源包安装游戏：配置中的顶层 version 是基础版本，
    /// bundles.*.version 才是实际安装的客户端版本（例如基础 3.7.0 搭配 HD 资源包 3.7.1）。
    /// 远端启动器索引发布的是资源包版本，因此优先使用最高的资源包版本进行比较，
    /// 避免把已经更新的客户端误判为可更新。没有资源包信息时退回基础版本。
    /// </summary>
    private static string? ReadLauncherConfigVersion(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;

        var bundleVersions = new List<string>();
        if (root.TryGetProperty("bundles", out var bundles) && bundles.ValueKind == JsonValueKind.Object)
        {
            foreach (var bundle in bundles.EnumerateObject())
            {
                if (bundle.Value.ValueKind != JsonValueKind.Object) continue;
                if (!bundle.Value.TryGetProperty("version", out var versionElement) ||
                    versionElement.ValueKind != JsonValueKind.String) continue;
                var bundleVersion = versionElement.GetString();
                if (!string.IsNullOrWhiteSpace(bundleVersion)) bundleVersions.Add(bundleVersion.Trim());
            }
        }

        if (bundleVersions.Count > 0)
        {
            var newest = bundleVersions[0];
            foreach (var candidate in bundleVersions.Skip(1))
            {
                if (CompareVersions(candidate, newest) > 0) newest = candidate;
            }
            return newest;
        }

        if (root.TryGetProperty("version", out var baseVersionElement) &&
            baseVersionElement.ValueKind == JsonValueKind.String)
        {
            var baseVersion = baseVersionElement.GetString();
            if (!string.IsNullOrWhiteSpace(baseVersion)) return baseVersion.Trim();
        }

        return null;
    }

    private static int CompareVersions(string left, string right)
    {
        var leftValid = Version.TryParse(left, out var leftVersion);
        var rightValid = Version.TryParse(right, out var rightVersion);
        if (leftValid && rightValid) return leftVersion!.CompareTo(rightVersion);
        return leftValid ? 1 : rightValid ? -1 : 0;
    }

    private static string CreateId(string rootPath)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rootPath.ToUpperInvariant()));
        return Convert.ToHexString(bytes)[..16].ToLowerInvariant();
    }
}
