using System.Text.Json;
using WutheringWavesBox.Contracts;

namespace WutheringWavesBox.Helper;

public sealed class RpcServer(TextReader input, TextWriter output)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await input.ReadLineAsync(cancellationToken);
            if (line is null) return;
            if (string.IsNullOrWhiteSpace(line)) continue;
            await WriteAsync(Handle(line), cancellationToken);
        }
    }

    public static RpcResponse Handle(string line)
    {
        RpcRequest? request;
        try
        {
            request = JsonSerializer.Deserialize<RpcRequest>(line, JsonOptions);
        }
        catch (JsonException)
        {
            return Failure(null, "INVALID_ARGUMENT", "请求不是有效 JSON");
        }

        if (request is null || request.JsonRpc != "2.0" || string.IsNullOrWhiteSpace(request.Id))
            return Failure(request?.Id, "INVALID_ARGUMENT", "RPC 请求结构无效");
        if (request.ProtocolVersion != Protocol.Version)
            return Failure(request.Id, "UNSUPPORTED_PROTOCOL", "协议版本不受支持");

        return request.Method switch
        {
            "system.health" => Success(request.Id, SystemService.Health()),
            "game.detectInstallations" => Success(request.Id, GameInstallationService.DetectInstallations()),
            "game.validateInstallation" => ValidateInstallation(request),
            "game.launch" => LaunchGame(request),
            "game.getProcessState" => GetGameProcessState(request),
            "game.stopAll" => Success(request.Id, GameProcessService.StopAll()),
            "gacha.findConveneUrl" => FindConveneUrl(request),
            _ => Failure(request.Id, "METHOD_NOT_FOUND", "未知 Helper 方法"),
        };
    }

    private static RpcResponse FindConveneUrl(RpcRequest request)
    {
        FindConveneUrlParams? parameters;
        try
        {
            parameters = request.Params.Deserialize<FindConveneUrlParams>(JsonOptions);
        }
        catch (JsonException)
        {
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏目录参数无效");
        }

        if (string.IsNullOrWhiteSpace(parameters?.RootPath) || parameters.RootPath.Length > 1_024)
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏目录不能为空");

        var validation = GameInstallationService.ValidateInstallation(parameters.RootPath);
        if (!validation.Valid)
            return Failure(request.Id, "INVALID_GAME_DIRECTORY", "游戏目录验证失败");

        return Success(request.Id!, GachaLogService.FindConveneUrl(parameters.RootPath));
    }

    private static RpcResponse LaunchGame(RpcRequest request)
    {
        LaunchGameParams? parameters;
        try
        {
            parameters = request.Params.Deserialize<LaunchGameParams>(JsonOptions);
        }
        catch (JsonException)
        {
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏启动参数无效");
        }

        var hasDisplaySettings = parameters?.DisplayMode is not null || parameters?.Width is not null || parameters?.Height is not null;
        var displaySettingsValid = !hasDisplaySettings ||
            (parameters?.DisplayMode is "fullscreen" or "borderless" or "windowed" &&
             parameters.Width is >= 640 and <= 16384 && parameters.Height is >= 480 and <= 8640);
        if (string.IsNullOrWhiteSpace(parameters?.RootPath) || parameters.RootPath.Length > 1_024 ||
            parameters.RenderMode is not ("default" or "dx11" or "dx12") || !displaySettingsValid)
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏启动参数无效");

        try
        {
            return Success(
                request.Id!,
                GameProcessService.Launch(
                    parameters.RootPath,
                    parameters.RenderMode,
                    parameters.DisplayMode,
                    parameters.Width,
                    parameters.Height));
        }
        catch (GameProcessException exception)
        {
            return Failure(request.Id, exception.Code, exception.Message);
        }
    }

    private static RpcResponse GetGameProcessState(RpcRequest request)
    {
        GetGameProcessStateParams? parameters;
        try
        {
            parameters = request.Params.Deserialize<GetGameProcessStateParams>(JsonOptions);
        }
        catch (JsonException)
        {
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏目录参数无效");
        }

        if (string.IsNullOrWhiteSpace(parameters?.RootPath) || parameters.RootPath.Length > 1_024)
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏目录不能为空");

        return Success(request.Id!, GameProcessService.GetState(parameters.RootPath));
    }

    private static RpcResponse ValidateInstallation(RpcRequest request)
    {
        ValidateGameInstallationParams? parameters;
        try
        {
            parameters = request.Params.Deserialize<ValidateGameInstallationParams>(JsonOptions);
        }
        catch (JsonException)
        {
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏目录参数无效");
        }

        if (string.IsNullOrWhiteSpace(parameters?.RootPath) || parameters.RootPath.Length > 1_024)
            return Failure(request.Id, "INVALID_ARGUMENT", "游戏目录不能为空");

        return Success(
            request.Id!,
            GameInstallationService.ValidateInstallation(parameters.RootPath));
    }

    private async Task WriteAsync(RpcResponse response, CancellationToken cancellationToken)
    {
        await output.WriteLineAsync(JsonSerializer.Serialize(response, JsonOptions).AsMemory(), cancellationToken);
        await output.FlushAsync(cancellationToken);
    }

    private static RpcResponse Success(string id, object result) => new("2.0", id, result);
    private static RpcResponse Failure(string? id, string code, string message) =>
        new("2.0", id, Error: new RpcError(code, message));
}
