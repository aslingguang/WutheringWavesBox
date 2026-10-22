namespace WutheringWavesBox.Helper;

/// <summary>
/// 自定义启动参数只会追加到固定的游戏可执行文件之后，不能被用来替换可执行文件，
/// 因此这里只约束长度并拒绝换行、制表符等控制字符。
/// </summary>
public static class LaunchArgumentPolicy
{
    public const int MaxLength = 512;

    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return true;

        var trimmed = value.Trim();
        return trimmed.Length <= MaxLength && !trimmed.Any(char.IsControl);
    }

    public static string Normalize(string? value) => value?.Trim() ?? string.Empty;
}
