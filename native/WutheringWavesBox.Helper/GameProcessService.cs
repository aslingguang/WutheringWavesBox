using System.Collections.Concurrent;
using System.Diagnostics;
using WutheringWavesBox.Contracts;

namespace WutheringWavesBox.Helper;

public static class GameProcessService
{
    private static readonly ConcurrentDictionary<string, TrackedProcess> Processes =
        new(StringComparer.OrdinalIgnoreCase);

    public static GameProcessState Launch(
        string rootPath,
        string renderMode,
        string? displayMode = null,
        int? width = null,
        int? height = null)
    {
        var validation = GameInstallationService.ValidateInstallation(rootPath);
        if (!validation.Valid || validation.Installation is null)
            throw new GameProcessException("INVALID_GAME_DIRECTORY", "游戏目录验证失败");

        var installation = validation.Installation;
        var existingState = GetState(installation.RootPath);
        if (existingState.Running)
            throw new GameProcessException("GAME_RUNNING", "游戏已经在运行");

        if (Process.GetProcessesByName("Client-Win64-Shipping").Length > 0)
            throw new GameProcessException("GAME_RUNNING", "检测到鸣潮客户端已经在运行");

        var startInfo = new ProcessStartInfo
        {
            FileName = installation.ExecutablePath,
            WorkingDirectory = installation.RootPath,
            UseShellExecute = true,
            Arguments = BuildArguments(renderMode, displayMode, width, height),
        };

        Process process;
        try
        {
            process = Process.Start(startInfo) ??
                throw new GameProcessException("GAME_LAUNCH_FAILED", "系统未返回游戏进程");
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            throw new GameProcessException("GAME_LAUNCH_FAILED", "无法启动游戏", exception);
        }

        var startedAt = DateTimeOffset.UtcNow;
        Processes[installation.Id] = new TrackedProcess(process, startedAt);
        return new GameProcessState(installation.Id, true, process.Id, startedAt);
    }

    public static string BuildArguments(
        string renderMode,
        string? displayMode,
        int? width,
        int? height)
    {
        var arguments = new List<string>();
        if (renderMode == "dx11") arguments.Add("-dx11");
        if (renderMode == "dx12") arguments.Add("-dx12");
        if (displayMode is null || width is null || height is null)
            return string.Join(' ', arguments);

        arguments.Add($"-ResX={width.Value}");
        arguments.Add($"-ResY={height.Value}");
        if (displayMode == "fullscreen") arguments.Add("-fullscreen");
        else
        {
            arguments.Add("-windowed");
            if (displayMode == "borderless") arguments.Add("-borderless");
        }
        return string.Join(' ', arguments);
    }

    public static GameProcessState GetState(string rootPath)
    {
        var validation = GameInstallationService.ValidateInstallation(rootPath);
        if (!validation.Valid || validation.Installation is null)
            throw new GameProcessException("INVALID_GAME_DIRECTORY", "游戏目录验证失败");

        var installation = validation.Installation;
        if (!Processes.TryGetValue(installation.Id, out var tracked))
        {
            var discovered = FindRunningClient(installation);
            if (discovered is null)
                return new GameProcessState(installation.Id, false, null, null);
            tracked = new TrackedProcess(discovered, DateTimeOffset.UtcNow);
            Processes[installation.Id] = tracked;
        }

        try
        {
            if (!tracked.Process.HasExited)
                return new GameProcessState(
                    installation.Id,
                    true,
                    tracked.Process.Id,
                    tracked.StartedAt);
        }
        catch (InvalidOperationException)
        {
            // A process that can no longer be queried is treated as stopped.
        }

        Processes.TryRemove(installation.Id, out _);
        tracked.Process.Dispose();
        var client = FindRunningClient(installation);
        if (client is not null)
        {
            var clientProcess = new TrackedProcess(client, tracked.StartedAt);
            Processes[installation.Id] = clientProcess;
            return new GameProcessState(
                installation.Id,
                true,
                client.Id,
                clientProcess.StartedAt);
        }
        return new GameProcessState(installation.Id, false, null, null);
    }

    public static int StopAll()
    {
        var stopped = 0;
        foreach (var process in Process.GetProcessesByName("Client-Win64-Shipping"))
        {
            try
            {
                if (process.HasExited) continue;
                process.Kill(true);
                process.WaitForExit(5_000);
                stopped++;
            }
            catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException)
            {
                // A process owned by another security context cannot be stopped safely.
            }
            finally
            {
                process.Dispose();
            }
        }
        Processes.Clear();
        return stopped;
    }

    private static Process? FindRunningClient(GameInstallation installation)
    {
        foreach (var process in Process.GetProcessesByName("Client-Win64-Shipping"))
        {
            try
            {
                if (string.Equals(
                        process.MainModule?.FileName,
                        installation.ClientExecutablePath,
                        StringComparison.OrdinalIgnoreCase))
                    return process;
            }
            catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
            {
                // Processes owned by a different security context may not expose their executable path.
            }
            process.Dispose();
        }
        return null;
    }

    private sealed record TrackedProcess(Process Process, DateTimeOffset StartedAt);
}

public sealed class GameProcessException : Exception
{
    public GameProcessException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public GameProcessException(string code, string message, Exception innerException)
        : base(message, innerException)
    {
        Code = code;
    }

    public string Code { get; }
}
