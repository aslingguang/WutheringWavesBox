using System.Runtime.InteropServices;

namespace WutheringWavesBox.Helper;

public static class DisplayModeService
{
    private const int EnumCurrentSettings = -1;

    public static IReadOnlyList<DisplayResolution> GetResolutions()
    {
        var result = new HashSet<DisplayResolution>();
        var mode = CreateMode();
        for (var index = 0; EnumDisplaySettings(null, index, ref mode); index++)
        {
            if (mode.dmPelsWidth >= 640 && mode.dmPelsHeight >= 480)
                result.Add(new DisplayResolution((int)mode.dmPelsWidth, (int)mode.dmPelsHeight));
            mode = CreateMode();
        }
        mode = CreateMode();
        if (EnumDisplaySettings(null, EnumCurrentSettings, ref mode))
            result.Add(new DisplayResolution((int)mode.dmPelsWidth, (int)mode.dmPelsHeight));
        return result.OrderBy(item => item.Width * item.Height).ThenBy(item => item.Width).ToArray();
    }

    private static DevMode CreateMode() => new() { dmSize = (ushort)Marshal.SizeOf<DevMode>() };

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplaySettings(string? deviceName, int modeNum, ref DevMode devMode);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DevMode
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public uint dmFields;
        public int dmPositionX, dmPositionY;
        public uint dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
        public uint dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2;
        public uint dmPanningWidth, dmPanningHeight;
    }
}

public sealed record DisplayResolution(int Width, int Height);
