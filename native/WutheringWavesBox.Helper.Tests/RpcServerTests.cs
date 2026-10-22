using System.Text.Json;
using WutheringWavesBox.Helper;
using Xunit;

namespace WutheringWavesBox.Helper.Tests;

public sealed class RpcServerTests
{
    [Fact]
    public void HealthReturnsCompatibleProtocol()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"system.health","params":{}}""");

        Assert.Null(response.Error);
        var json = JsonSerializer.Serialize(response.Result);
        Assert.Contains("\"protocolVersion\":2", json);
    }

    [Fact]
    public void IncompatibleProtocolIsRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":99,"id":"test","method":"system.health","params":{}}""");

        Assert.Equal("UNSUPPORTED_PROTOCOL", response.Error?.Code);
    }

    [Fact]
    public void MissingGamePathIsRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"game.validateInstallation","params":{}}""");

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }

    [Fact]
    public void ArbitraryLaunchArgumentIsRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"game.launch","params":{"rootPath":"C:\\\\Games","renderMode":"-arbitrary"}}""");

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }

    [Fact]
    public void InvalidDisplaySettingsAreRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"game.launch","params":{"rootPath":"C:\\Games","renderMode":"default","displayMode":"fullscreen","width":100,"height":100}}""");

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }

    [Fact]
    public void OversizedCustomArgumentsAreRejected()
    {
        var payload = new
        {
            jsonrpc = "2.0",
            protocolVersion = 2,
            id = "test",
            method = "game.launch",
            @params = new
            {
                rootPath = "C:/Games",
                renderMode = "default",
                customArguments = new string('a', 600),
            },
        };
        var response = RpcServer.Handle(JsonSerializer.Serialize(payload));

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }

    [Fact]
    public void MultiLineCustomArgumentsAreRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"game.launch","params":{"rootPath":"C:/Games","renderMode":"default","customArguments":"-dx12\n-dx11"}}""");

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }

    [Fact]
    public void MissingProcessStatePathIsRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"game.getProcessState","params":{}}""");

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }

    [Fact]
    public void MissingGachaPathIsRejected()
    {
        var response = RpcServer.Handle(
            """{"jsonrpc":"2.0","protocolVersion":2,"id":"test","method":"gacha.findConveneUrl","params":{}}""");

        Assert.Equal("INVALID_ARGUMENT", response.Error?.Code);
    }
}
