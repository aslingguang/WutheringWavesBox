using System.Text.Json;
using System.Text.Json.Serialization;

namespace WutheringWavesBox.Contracts;

public static class Protocol
{
    public const int Version = 2;
}

public sealed record RpcRequest(
    [property: JsonPropertyName("jsonrpc")] string JsonRpc,
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("method")] string? Method,
    [property: JsonPropertyName("params")] JsonElement Params);

public sealed record RpcError(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("details")] object? Details = null);

public sealed record RpcResponse(
    [property: JsonPropertyName("jsonrpc")] string JsonRpc,
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("result")] object? Result = null,
    [property: JsonPropertyName("error")] RpcError? Error = null);

public sealed record HealthResult(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("helperVersion")] string HelperVersion,
    [property: JsonPropertyName("runtimeVersion")] string RuntimeVersion,
    [property: JsonPropertyName("operatingSystem")] string OperatingSystem,
    [property: JsonPropertyName("processId")] int ProcessId);

public sealed record ValidateGameInstallationParams(
    [property: JsonPropertyName("rootPath")] string? RootPath);

public sealed record GameInstallation(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("rootPath")] string RootPath,
    [property: JsonPropertyName("executablePath")] string ExecutablePath,
    [property: JsonPropertyName("clientExecutablePath")] string? ClientExecutablePath,
    [property: JsonPropertyName("region")] string Region,
    [property: JsonPropertyName("localVersion")] string? LocalVersion);

public sealed record GameValidationResult(
    [property: JsonPropertyName("valid")] bool Valid,
    [property: JsonPropertyName("issues")] IReadOnlyList<string> Issues,
    [property: JsonPropertyName("installation")] GameInstallation? Installation);

public sealed record LaunchGameParams(
    [property: JsonPropertyName("rootPath")] string? RootPath,
    [property: JsonPropertyName("renderMode")] string? RenderMode,
    [property: JsonPropertyName("displayMode")] string? DisplayMode,
    [property: JsonPropertyName("width")] int? Width,
    [property: JsonPropertyName("height")] int? Height);

public sealed record GetGameProcessStateParams(
    [property: JsonPropertyName("rootPath")] string? RootPath);

public sealed record GameProcessState(
    [property: JsonPropertyName("installationId")] string InstallationId,
    [property: JsonPropertyName("running")] bool Running,
    [property: JsonPropertyName("processId")] int? ProcessId,
    [property: JsonPropertyName("startedAt")] DateTimeOffset? StartedAt);

public sealed record FindConveneUrlParams(
    [property: JsonPropertyName("rootPath")] string? RootPath);

public sealed record ConveneUrlResult(
    [property: JsonPropertyName("found")] bool Found,
    [property: JsonPropertyName("url")] string? Url,
    [property: JsonPropertyName("source")] string? Source,
    [property: JsonPropertyName("lastModifiedAt")] DateTimeOffset? LastModifiedAt,
    [property: JsonPropertyName("errorCode")] string? ErrorCode);
