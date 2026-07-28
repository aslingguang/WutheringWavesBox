using System.Reflection;
using System.Runtime.InteropServices;
using WutheringWavesBox.Contracts;

namespace WutheringWavesBox.Helper;

public sealed class SystemService
{
    public static HealthResult Health() => new(
        Protocol.Version,
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0",
        RuntimeInformation.FrameworkDescription,
        RuntimeInformation.OSDescription,
        Environment.ProcessId);
}
