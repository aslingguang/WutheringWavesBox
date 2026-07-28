using System.Text.Json;
using WutheringWavesBox.Helper;

Console.InputEncoding = System.Text.Encoding.UTF8;
Console.OutputEncoding = System.Text.Encoding.UTF8;

var server = new RpcServer(Console.In, Console.Out);
await server.RunAsync(CancellationToken.None);
